import { getDb } from "./db";

export const QA_OUTCOME_KINDS = ["product_placement", "person_placement", "brand_qa"] as const;
export type QaOutcomeKind = (typeof QA_OUTCOME_KINDS)[number];

// Best-effort by design — a QA outcome failing to persist should never
// block or fail the generation/finish flow it's attached to. Every call
// site wraps this in its own try/catch and just logs on failure.
export async function recordQaOutcome(opts: {
  projectId: string;
  attempt: number | null;
  kind: QaOutcomeKind;
  passed: boolean;
  issues: string[];
}): Promise<void> {
  const sql = getDb();
  await sql`
    insert into qa_outcomes (project_id, attempt, kind, passed, issues)
    values (${opts.projectId}, ${opts.attempt}, ${opts.kind}, ${opts.passed}, ${opts.issues})
  `;
}

export interface QaOutcomeSummary {
  kind: QaOutcomeKind;
  total: number;
  passed: number;
  failed: number;
  passRate: number;
  topIssues: { issue: string; count: number }[];
}

// Real aggregation over qa_outcomes, not a cached/derived guess — used to
// answer "is the system getting this right continually" with actual
// numbers instead of impression. sinceDays narrows to a rolling window
// (default 30) so old data doesn't dilute a recent regression or fix.
export async function summarizeQaOutcomes(sinceDays = 30): Promise<QaOutcomeSummary[]> {
  const sql = getDb();
  const totals = await sql`
    select
      kind,
      count(*)::int as total,
      count(*) filter (where passed)::int as passed
    from qa_outcomes
    where created_at >= now() - (${sinceDays} || ' days')::interval
    group by kind
  `;

  const issueRows = await sql`
    select kind, issue, count(*)::int as count
    from qa_outcomes, unnest(issues) as issue
    where created_at >= now() - (${sinceDays} || ' days')::interval and not passed
    group by kind, issue
    order by kind, count desc
  `;

  const totalRows = totals as unknown as { kind: QaOutcomeKind; total: number; passed: number }[];
  const issues = issueRows as unknown as { kind: QaOutcomeKind; issue: string; count: number }[];

  return totalRows.map((row) => ({
    kind: row.kind,
    total: row.total,
    passed: row.passed,
    failed: row.total - row.passed,
    passRate: row.total > 0 ? row.passed / row.total : 1,
    topIssues: issues
      .filter((i) => i.kind === row.kind)
      .slice(0, 5)
      .map((i) => ({ issue: i.issue, count: i.count })),
  }));
}
