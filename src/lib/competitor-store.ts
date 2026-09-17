import { randomUUID } from "crypto";
import type postgres from "postgres";
import { getDb } from "./db";
import { getProductLinesConfig } from "./config";
import {
  CompetitorAccountZ,
  type CompetitorAccount,
  type CompetitorAccountInput,
  type CompetitorCategoryId,
  type CompetitorQuery,
} from "./competitor-schema";

// productLineIds is a plain string[] in the isomorphic schema (it can't
// import server-only config to validate against), so unlike `categories`
// (a real zod enum) a typo'd or stale id would otherwise persist silently
// and just never match any clipMatchesProductLine/query filter. Checked here
// instead, at the one server-side chokepoint both create and update share.
export function unknownProductLineIds(productLineIds: string[]): string[] {
  const known = new Set(getProductLinesConfig().productLines.map((p) => p.id));
  return productLineIds.filter((id) => !known.has(id));
}

// One SQL query per operation, categories/product lines assembled via
// array_agg from their join tables so callers get plain string arrays — no
// separate round trips per account. selectWithJoins() returns a nestable
// sql`` fragment (NOT sql.unsafe — that's for one-off raw execution, not
// composition) so it can be embedded in each query below.

// Shared by both the top-level connection and transaction handles (Sql and
// TransactionSql both extend ISql) so these helpers work with either.
type Sql = postgres.ISql;

function selectWithJoins(sql: Sql) {
  return sql`
    select
      a.*,
      coalesce(
        (select array_agg(c.category_id) from competitor_account_categories c where c.account_id = a.id),
        '{}'
      ) as categories,
      coalesce(
        (select array_agg(p.product_line_id) from competitor_account_product_lines p where p.account_id = a.id),
        '{}'
      ) as product_line_ids
    from competitor_accounts a
  `;
}

function parseAccount(row: unknown): CompetitorAccount {
  return CompetitorAccountZ.parse(row);
}

export async function listCompetitors(query: CompetitorQuery): Promise<CompetitorAccount[]> {
  const sql = getDb();
  const rows = await sql`
    ${selectWithJoins(sql)}
    where 1=1
    ${query.region ? sql`and a.region = ${query.region}` : sql``}
    ${query.accountType ? sql`and a.account_type = ${query.accountType}` : sql``}
    ${query.scanReady ? sql`and a.tiktok_status = 'confirmed'` : sql``}
    ${
      query.category
        ? sql`and exists (select 1 from competitor_account_categories c where c.account_id = a.id and c.category_id = ${query.category})`
        : sql``
    }
    ${
      query.productLineId
        ? sql`and exists (select 1 from competitor_account_product_lines p where p.account_id = a.id and p.product_line_id = ${query.productLineId})`
        : sql``
    }
    order by a.name asc
  `;
  return rows.map(parseAccount);
}

export async function getCompetitor(id: string): Promise<CompetitorAccount | null> {
  const sql = getDb();
  const rows = await sql`${selectWithJoins(sql)} where a.id = ${id}`;
  return rows[0] ? parseAccount(rows[0]) : null;
}

// Best-effort join used when tagging generated content with the reference
// account's positioning — handles are unique enough for this purpose, but
// not a real key, so this just takes the first match.
export async function getCompetitorByHandle(tiktokHandle: string): Promise<CompetitorAccount | null> {
  const sql = getDb();
  const rows = await sql`${selectWithJoins(sql)} where a.tiktok_handle = ${tiktokHandle} limit 1`;
  return rows[0] ? parseAccount(rows[0]) : null;
}

async function setJoins(
  tx: Sql,
  accountId: string,
  categories: string[],
  productLineIds: string[]
): Promise<void> {
  await tx`delete from competitor_account_categories where account_id = ${accountId}`;
  await tx`delete from competitor_account_product_lines where account_id = ${accountId}`;
  if (categories.length) {
    await tx`
      insert into competitor_account_categories (account_id, category_id)
      values ${tx(categories.map((c) => [accountId, c]))}
    `;
  }
  if (productLineIds.length) {
    await tx`
      insert into competitor_account_product_lines (account_id, product_line_id)
      values ${tx(productLineIds.map((p) => [accountId, p]))}
    `;
  }
}

export async function createCompetitor(input: CompetitorAccountInput): Promise<CompetitorAccount> {
  const sql = getDb();
  const id = randomUUID();
  return sql.begin(async (tx) => {
    await tx`
      insert into competitor_accounts (
        id, name, account_type, region, website,
        instagram_handle, instagram_url, instagram_followers,
        facebook_handle, facebook_url, facebook_followers,
        tiktok_handle, tiktok_url, tiktok_status,
        positioning, cross_category_flag, notes, created_at, updated_at
      ) values (
        ${id}, ${input.name}, ${input.accountType}, ${input.region}, ${input.website ?? null},
        ${input.instagramHandle ?? null}, ${input.instagramUrl ?? null}, ${input.instagramFollowers ?? null},
        ${input.facebookHandle ?? null}, ${input.facebookUrl ?? null}, ${input.facebookFollowers ?? null},
        ${input.tiktokHandle ?? null}, ${input.tiktokUrl ?? null}, ${input.tiktokStatus},
        ${input.positioning ?? null}, ${input.crossCategoryFlag}, ${input.notes ?? null},
        now(), now()
      )
    `;
    await setJoins(tx, id, input.categories, input.productLineIds);
    const rows = await tx`${selectWithJoins(tx)} where a.id = ${id}`;
    return parseAccount(rows[0]);
  });
}

export async function updateCompetitor(
  id: string,
  input: Partial<CompetitorAccountInput>
): Promise<CompetitorAccount | null> {
  const sql = getDb();

  // `existing` is read AND locked (`for update`) inside the same transaction
  // as the write, so a second concurrent PATCH on this id blocks until the
  // first commits rather than reading stale pre-write values — otherwise
  // two requests patching different fields of the same account race and one
  // silently reverts the other's just-written field back to its old value.
  return sql.begin(async (tx) => {
    const existingRows = await tx`select * from competitor_accounts where id = ${id} for update`;
    const existing = existingRows[0];
    if (!existing) return null;

    await tx`
      update competitor_accounts set
        name = ${input.name ?? existing.name},
        account_type = ${input.accountType ?? existing.accountType},
        region = ${input.region ?? existing.region},
        website = ${input.website !== undefined ? input.website : existing.website},
        instagram_handle = ${input.instagramHandle !== undefined ? input.instagramHandle : existing.instagramHandle},
        instagram_url = ${input.instagramUrl !== undefined ? input.instagramUrl : existing.instagramUrl},
        instagram_followers = ${input.instagramFollowers !== undefined ? input.instagramFollowers : existing.instagramFollowers},
        facebook_handle = ${input.facebookHandle !== undefined ? input.facebookHandle : existing.facebookHandle},
        facebook_url = ${input.facebookUrl !== undefined ? input.facebookUrl : existing.facebookUrl},
        facebook_followers = ${input.facebookFollowers !== undefined ? input.facebookFollowers : existing.facebookFollowers},
        tiktok_handle = ${input.tiktokHandle !== undefined ? input.tiktokHandle : existing.tiktokHandle},
        tiktok_url = ${input.tiktokUrl !== undefined ? input.tiktokUrl : existing.tiktokUrl},
        tiktok_status = ${input.tiktokStatus ?? existing.tiktokStatus},
        positioning = ${input.positioning !== undefined ? input.positioning : existing.positioning},
        cross_category_flag = ${input.crossCategoryFlag ?? existing.crossCategoryFlag},
        notes = ${input.notes !== undefined ? input.notes : existing.notes},
        updated_at = now()
      where id = ${id}
    `;
    if (input.categories !== undefined || input.productLineIds !== undefined) {
      let categories = input.categories;
      let productLineIds = input.productLineIds;
      if (categories === undefined || productLineIds === undefined) {
        const [full] = await tx`${selectWithJoins(tx)} where a.id = ${id}`;
        categories = categories ?? (full.categories as CompetitorCategoryId[]);
        productLineIds = productLineIds ?? (full.productLineIds as string[]);
      }
      await setJoins(tx, id, categories, productLineIds);
    }
    const rows = await tx`${selectWithJoins(tx)} where a.id = ${id}`;
    return parseAccount(rows[0]);
  });
}

export async function deleteCompetitor(id: string): Promise<boolean> {
  const sql = getDb();
  const result = await sql`delete from competitor_accounts where id = ${id}`;
  return result.count > 0;
}
