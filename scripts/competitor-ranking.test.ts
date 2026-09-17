import assert from "node:assert/strict";
import { test } from "node:test";
import type { CompetitorAccount } from "../src/lib/competitor-schema";
import { rankContentTargets, rankAdsTargetsForProductLine } from "../src/lib/competitor-ranking";

let idCounter = 0;

function makeAccount(overrides: Partial<CompetitorAccount> = {}): CompetitorAccount {
  idCounter += 1;
  const now = new Date().toISOString();
  return {
    id: `acct-${idCounter}`,
    name: `Account ${idCounter}`,
    accountType: "brand",
    region: "uk",
    website: null,
    instagramHandle: null,
    instagramUrl: null,
    instagramFollowers: null,
    facebookHandle: null,
    facebookUrl: null,
    facebookFollowers: null,
    facebookPageIds: [],
    tiktokHandle: null,
    tiktokUrl: null,
    tiktokFollowers: null,
    tiktokStatus: "not_found",
    positioning: null,
    crossCategoryFlag: false,
    notes: null,
    createdAt: now,
    updatedAt: now,
    categories: [],
    productLineIds: [],
    ...overrides,
  };
}

// --- rankContentTargets --------------------------------------------------

test("rankContentTargets filters by handle presence, ignoring accountType", () => {
  const brandWithHandle = makeAccount({ accountType: "brand", instagramHandle: "brand1", instagramFollowers: 100 });
  const brandNoHandle = makeAccount({ accountType: "brand", instagramHandle: null, instagramFollowers: 500 });
  const creatorWithHandle = makeAccount({ accountType: "creator", instagramHandle: "creator1", instagramFollowers: 200 });

  // Flat top-N, no brand/creator split — both handled accounts qualify.
  const result = rankContentTargets(
    [brandWithHandle, brandNoHandle, creatorWithHandle],
    "instagram",
    10
  );

  assert.deepEqual(
    result.map((a) => a.id).sort(),
    [brandWithHandle.id, creatorWithHandle.id].sort()
  );
});

test("rankContentTargets sorts desc by the platform's own follower count", () => {
  const low = makeAccount({ instagramHandle: "low", instagramFollowers: 10 });
  const high = makeAccount({ instagramHandle: "high", instagramFollowers: 1000 });
  const mid = makeAccount({ instagramHandle: "mid", instagramFollowers: 100 });

  const result = rankContentTargets([low, high, mid], "instagram", 10);

  assert.deepEqual(
    result.map((a) => a.id),
    [high.id, mid.id, low.id]
  );
});

test("rankContentTargets treats null follower counts as 0", () => {
  const nullFollowers = makeAccount({ instagramHandle: "a", instagramFollowers: null });
  const zeroFollowers = makeAccount({ instagramHandle: "b", instagramFollowers: 0 });
  const positive = makeAccount({ instagramHandle: "c", instagramFollowers: 5 });

  const result = rankContentTargets([nullFollowers, zeroFollowers, positive], "instagram", 10);

  assert.equal(result[0].id, positive.id);
  assert.deepEqual(
    result.slice(1).map((a) => a.id).sort(),
    [nullFollowers.id, zeroFollowers.id].sort()
  );
});

test("rankContentTargets slices to the requested limit", () => {
  const accounts = [1, 2, 3, 4, 5].map((n) =>
    makeAccount({ tiktokHandle: `handle-${n}`, tiktokFollowers: n * 10 })
  );

  const result = rankContentTargets(accounts, "tiktok", 2);

  assert.equal(result.length, 2);
  // Highest two follower counts (40, 50) survive the slice.
  assert.deepEqual(
    result.map((a) => a.tiktokFollowers).sort((a, b) => (a ?? 0) - (b ?? 0)),
    [40, 50]
  );
});

test("rankContentTargets uses each platform's own handle/follower field, not the other platform's", () => {
  const igOnly = makeAccount({
    instagramHandle: "ig-only",
    instagramFollowers: 999,
    tiktokHandle: null,
    tiktokFollowers: 999,
  });

  assert.deepEqual(rankContentTargets([igOnly], "tiktok", 10), []);
  assert.deepEqual(
    rankContentTargets([igOnly], "instagram", 10).map((a) => a.id),
    [igOnly.id]
  );
});

// --- rankAdsTargetsForProductLine -----------------------------------------

test("rankAdsTargetsForProductLine filters to accounts linked to the given product line", () => {
  const linked = makeAccount({ productLineIds: ["line-a"] });
  const unlinked = makeAccount({ productLineIds: ["line-b"] });
  const multiLinked = makeAccount({ productLineIds: ["line-b", "line-a"] });

  const result = rankAdsTargetsForProductLine([linked, unlinked, multiLinked], "line-a", "facebook");

  assert.deepEqual(
    result.map((a) => a.id).sort(),
    [linked.id, multiLinked.id].sort()
  );
});

test("rankAdsTargetsForProductLine sorts desc by the platform's follower proxy", () => {
  const a = makeAccount({ productLineIds: ["line-a"], facebookFollowers: 50 });
  const b = makeAccount({ productLineIds: ["line-a"], facebookFollowers: 500 });
  const c = makeAccount({ productLineIds: ["line-a"], facebookFollowers: 200 });

  const result = rankAdsTargetsForProductLine([a, b, c], "line-a", "facebook");

  assert.deepEqual(result.map((x) => x.id), [b.id, c.id, a.id]);
});

test("rankAdsTargetsForProductLine falls back facebookFollowers ?? instagramFollowers ?? 0", () => {
  const noFacebook = makeAccount({ productLineIds: ["line-a"], facebookFollowers: null, instagramFollowers: 300 });
  const bothNull = makeAccount({ productLineIds: ["line-a"], facebookFollowers: null, instagramFollowers: null });
  const hasFacebook = makeAccount({ productLineIds: ["line-a"], facebookFollowers: 100, instagramFollowers: 999 });

  const result = rankAdsTargetsForProductLine([noFacebook, bothNull, hasFacebook], "line-a", "facebook");

  // noFacebook proxies to 300 (its IG count), hasFacebook uses its own 100
  // (not IG's 999), bothNull falls all the way to 0.
  assert.deepEqual(result.map((a) => a.id), [noFacebook.id, hasFacebook.id, bothNull.id]);
});

test("rankAdsTargetsForProductLine falls back tiktokFollowers ?? instagramFollowers ?? 0", () => {
  const noTiktok = makeAccount({ productLineIds: ["line-a"], tiktokFollowers: null, instagramFollowers: 400 });
  const bothNull = makeAccount({ productLineIds: ["line-a"], tiktokFollowers: null, instagramFollowers: null });
  const hasTiktok = makeAccount({ productLineIds: ["line-a"], tiktokFollowers: 150, instagramFollowers: 999 });

  const result = rankAdsTargetsForProductLine([noTiktok, bothNull, hasTiktok], "line-a", "tiktok");

  assert.deepEqual(result.map((a) => a.id), [noTiktok.id, hasTiktok.id, bothNull.id]);
});

test("rankAdsTargetsForProductLine returns everything linked, no limit applied", () => {
  const accounts = Array.from({ length: 12 }, () => makeAccount({ productLineIds: ["line-a"] }));
  const result = rankAdsTargetsForProductLine(accounts, "line-a", "facebook");
  assert.equal(result.length, 12);
});
