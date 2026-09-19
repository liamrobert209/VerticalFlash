import assert from "node:assert/strict";
import { test } from "node:test";
import type { GoogleGenAI } from "@google/genai";
import { mergeAdTags } from "../src/lib/ads-store";
import type { Ad, AdSighting } from "../src/lib/ads-schema";
import type { AdAnalysis } from "../src/lib/ad-analysis-schema";
import type { ProductLineCandidate } from "../src/lib/ad-analyze";
import { getPublicProductLines } from "../src/lib/config";
import {
  processFacebookItems,
  resolveProductLineId,
  type ProcessFacebookItemsDeps,
  type SyncTarget,
} from "../src/lib/weekly-ads-sync";

// --- mergeAdTags (pure) -----------------------------------------------

test("mergeAdTags dedupes, trims/lowercases, and sorts", () => {
  assert.deepEqual(
    mergeAdTags(["Bold", " colorful "], ["bold", "MINIMAL", "colorful"]),
    ["bold", "colorful", "minimal"]
  );
  assert.deepEqual(mergeAdTags([], []), []);
  assert.deepEqual(mergeAdTags(["a"], []), ["a"]);
  assert.deepEqual(mergeAdTags([], ["b", "  ", ""]), ["b"]);
});

// --- resolveProductLineId (pure) ---------------------------------------

test("resolveProductLineId trusts Gemini's pick only when it's an offered candidate", () => {
  assert.equal(resolveProductLineId("default", ["a", "b"], "b"), "b");
  assert.equal(resolveProductLineId("default", ["a", "b"], "c"), "default");
  assert.equal(resolveProductLineId("default", ["a", "b"], null), "default");
  assert.equal(resolveProductLineId("default", ["a", "b"], undefined), "default");
  assert.equal(resolveProductLineId(null, [], "anything"), null);
});

// --- processFacebookItems wiring (fakes for every DI'd dependency) -----

function makeAd(overrides: Partial<Ad> = {}): Ad {
  const now = new Date().toISOString();
  return {
    id: "ad-id",
    accountId: null,
    platformId: "facebook",
    productLineId: null,
    externalAdId: "ext-1",
    headline: "Headline",
    bodyText: "Body",
    creativeUrl: "https://cdn.example.test/creative.jpg",
    creativeLocalFile: null,
    landingUrl: null,
    launchDate: null,
    firstSeenAt: now,
    lastSeenAt: now,
    isActive: true,
    tags: [],
    raw: null,
    isStaticEligible: true,
    analysis: null,
    analyzedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeAnalysis(overrides: Partial<AdAnalysis> = {}): AdAnalysis {
  return {
    summary: "A good ad.",
    intent: "brand_awareness",
    usp: "Great USP",
    persona: "Someone",
    productShown: "Widget",
    tags: ["bold", "colorful"],
    productLineId: null,
    ...overrides,
  };
}

function makeFakeDeps(opts: {
  recordedAdOverrides?: Partial<Ad>;
  analysis?: AdAnalysis;
  listUnanalyzedStaticAdsResult?: Ad[];
} = {}) {
  const recordAdSightingCalls: AdSighting[] = [];
  const saveAdAnalysisCalls: { adId: string; analysis: AdAnalysis; productLineId: string | null | undefined }[] = [];
  const analyzeStaticAdCalls: {
    imageUrl: string;
    context: { headline: string | null; bodyText: string | null };
    candidates: ProductLineCandidate[] | undefined;
  }[] = [];
  const markStaleAdsInactiveCalls: unknown[] = [];
  const addFacebookPageIdCalls: unknown[] = [];
  const listUnanalyzedStaticAdsCalls: { limit: number; accountIds?: string[] }[] = [];
  const recordFlaggedAdLanguageCalls: { accountId: string; languageCode: string }[] = [];

  let sightingCounter = 0;

  const deps: ProcessFacebookItemsDeps = {
    recordAdSighting: async (sighting) => {
      recordAdSightingCalls.push(sighting);
      sightingCounter += 1;
      return makeAd({
        id: `ad-${sightingCounter}`,
        accountId: sighting.accountId ?? null,
        platformId: sighting.platformId,
        productLineId: sighting.productLineId ?? null,
        externalAdId: sighting.externalAdId,
        headline: sighting.headline ?? null,
        bodyText: sighting.bodyText ?? null,
        ...opts.recordedAdOverrides,
      });
    },
    saveAdAnalysis: async (adId, analysis, productLineId) => {
      saveAdAnalysisCalls.push({ adId, analysis, productLineId });
      return makeAd({ id: adId, analysis, productLineId: productLineId ?? null });
    },
    markStaleAdsInactive: async (...args) => {
      markStaleAdsInactiveCalls.push(args);
      return 0;
    },
    addFacebookPageId: async (...args) => {
      addFacebookPageIdCalls.push(args);
    },
    analyzeStaticAd: async (_ai, imageUrl, context, candidates) => {
      analyzeStaticAdCalls.push({ imageUrl, context, candidates });
      return opts.analysis ?? makeAnalysis();
    },
    listUnanalyzedStaticAds: async (limit, accountIds) => {
      listUnanalyzedStaticAdsCalls.push({ limit, accountIds });
      return opts.listUnanalyzedStaticAdsResult ?? [];
    },
    getGeminiClient: () => ({} as GoogleGenAI),
    recordFlaggedAdLanguage: async (accountId, languageCode) => {
      recordFlaggedAdLanguageCalls.push({ accountId, languageCode });
    },
  };

  return {
    deps,
    recordAdSightingCalls,
    saveAdAnalysisCalls,
    analyzeStaticAdCalls,
    markStaleAdsInactiveCalls,
    addFacebookPageIdCalls,
    listUnanalyzedStaticAdsCalls,
    recordFlaggedAdLanguageCalls,
  };
}

// A Facebook item with no images/videos at all — deliberately, so
// isFacebookStaticEligible (computed from the raw payload, not DI'd) stays
// false and the sync's best-effort local creative-caching step never fires
// a real network fetch. The DI'd `recordAdSighting` fake independently
// decides what Ad comes back (isStaticEligible: true by default via
// makeAd()), which is what analyzeIfNeeded actually reads.
function fbItem(adArchiveId: string, pageId: string) {
  return {
    ad_archive_id: adArchiveId,
    page_id: pageId,
    page_name: "Acme",
    snapshot: { title: "Headline", body: "Body text" },
  };
}

const [lineA, lineB] = getPublicProductLines().map((l) => l.id);

test("multi-line competitor + valid Gemini pick: saveAdAnalysis gets that pick", async () => {
  const target: SyncTarget = {
    accountId: "acct-1",
    name: "Acme",
    productLineId: lineA,
    candidateProductLineIds: [lineA, lineB],
    facebookPageIds: ["pg1"],
  };
  const { deps, saveAdAnalysisCalls, analyzeStaticAdCalls } = makeFakeDeps({
    analysis: makeAnalysis({ productLineId: lineB }),
  });

  await processFacebookItems([fbItem("ad1", "pg1")], [target], deps);

  assert.equal(analyzeStaticAdCalls.length, 1);
  assert.deepEqual(
    analyzeStaticAdCalls[0].candidates?.map((c) => c.id).sort(),
    [lineA, lineB].sort()
  );
  assert.equal(saveAdAnalysisCalls.length, 1);
  assert.equal(saveAdAnalysisCalls[0].productLineId, lineB);
});

test("multi-line competitor + invalid/missing Gemini pick: falls back to the default", async () => {
  const target: SyncTarget = {
    accountId: "acct-1",
    name: "Acme",
    productLineId: lineA,
    candidateProductLineIds: [lineA, lineB],
    facebookPageIds: ["pg1"],
  };
  const { deps, saveAdAnalysisCalls } = makeFakeDeps({
    analysis: makeAnalysis({ productLineId: "not-a-real-candidate" }),
  });

  await processFacebookItems([fbItem("ad1", "pg1")], [target], deps);

  assert.equal(saveAdAnalysisCalls.length, 1);
  assert.equal(saveAdAnalysisCalls[0].productLineId, lineA);

  const { deps: deps2, saveAdAnalysisCalls: calls2 } = makeFakeDeps({
    analysis: makeAnalysis({ productLineId: null }),
  });
  await processFacebookItems([fbItem("ad2", "pg1")], [target], deps2);
  assert.equal(calls2[0].productLineId, lineA);
});

test("single-line competitor: analyzeStaticAd is called with candidates undefined", async () => {
  const target: SyncTarget = {
    accountId: "acct-1",
    name: "Acme",
    productLineId: lineA,
    candidateProductLineIds: [lineA],
    facebookPageIds: ["pg1"],
  };
  const { deps, analyzeStaticAdCalls, saveAdAnalysisCalls } = makeFakeDeps();

  await processFacebookItems([fbItem("ad1", "pg1")], [target], deps);

  assert.equal(analyzeStaticAdCalls.length, 1);
  assert.equal(analyzeStaticAdCalls[0].candidates, undefined);
  assert.equal(saveAdAnalysisCalls[0].productLineId, lineA);
});

test("non-static-eligible ad: saveAdAnalysis is never called", async () => {
  const target: SyncTarget = {
    accountId: "acct-1",
    name: "Acme",
    productLineId: lineA,
    candidateProductLineIds: [lineA],
    facebookPageIds: ["pg1"],
  };
  const { deps, saveAdAnalysisCalls, analyzeStaticAdCalls } = makeFakeDeps({
    recordedAdOverrides: { isStaticEligible: false },
  });

  await processFacebookItems([fbItem("ad1", "pg1")], [target], deps);

  assert.equal(analyzeStaticAdCalls.length, 0);
  assert.equal(saveAdAnalysisCalls.length, 0);
});

test("retry pass: an unanalyzed ad from listUnanalyzedStaticAds goes through the same analysis path", async () => {
  const target: SyncTarget = {
    accountId: "acct-1",
    name: "Acme",
    productLineId: lineA,
    candidateProductLineIds: [lineA, lineB],
    facebookPageIds: ["pg1"],
  };
  const retryAd = makeAd({
    id: "retry-ad",
    accountId: "acct-1",
    isStaticEligible: true,
    analyzedAt: null,
    creativeUrl: "https://cdn.example.test/retry.jpg",
  });
  const { deps, saveAdAnalysisCalls, analyzeStaticAdCalls, listUnanalyzedStaticAdsCalls } = makeFakeDeps({
    analysis: makeAnalysis({ productLineId: lineB }),
    listUnanalyzedStaticAdsResult: [retryAd],
  });

  // No items fetched this sync (e.g. the actor call returned nothing) —
  // the retry pass should still run against the given accounts.
  const results = await processFacebookItems([], [target], deps);

  assert.equal(listUnanalyzedStaticAdsCalls.length, 1);
  assert.deepEqual(listUnanalyzedStaticAdsCalls[0], { limit: 10, accountIds: ["acct-1"] });
  assert.equal(analyzeStaticAdCalls.length, 1);
  assert.equal(saveAdAnalysisCalls.length, 1);
  assert.equal(saveAdAnalysisCalls[0].adId, "retry-ad");
  assert.equal(saveAdAnalysisCalls[0].productLineId, lineB);
  // No Facebook items were seen, so there's nothing to report per-platform —
  // the retry pass runs independently of that.
  assert.deepEqual(results, []);
});

test("non-English ad copy: skipped entirely, never recorded or analyzed", async () => {
  const target: SyncTarget = {
    accountId: "acct-1",
    name: "Acme",
    productLineId: lineA,
    candidateProductLineIds: [lineA],
    facebookPageIds: ["pg1"],
  };
  const { deps, recordAdSightingCalls, analyzeStaticAdCalls, saveAdAnalysisCalls } = makeFakeDeps();

  const thaiItem = {
    ad_archive_id: "ad-thai",
    page_id: "pg1",
    page_name: "Acme",
    snapshot: {
      title: "ดีลสุดคุ้ม!",
      body: "เคสไอแพดลิลลี่ แพด แถมฟรีสายชาร์จ! โค้ทลดเพิ่ม 100 บาท จำนวนจำกัด รีบสั่งเลยตอนนี้",
    },
  };

  const results = await processFacebookItems([fbItem("ad-en", "pg1"), thaiItem], [target], deps);

  // The English item still goes through normally...
  assert.equal(recordAdSightingCalls.length, 1);
  assert.equal(recordAdSightingCalls[0].externalAdId, "ad-en");
  assert.equal(analyzeStaticAdCalls.length, 1);
  assert.equal(saveAdAnalysisCalls.length, 1);

  // ...and the Thai one is surfaced as a skip, not an error, not a row.
  const errors = results.flatMap((r) => r.errors);
  assert.ok(errors.some((e) => e.includes("Skipped 1 non-English ad")));
});

test("non-English ad copy: tags the matched competitor with the detected language", async () => {
  const target: SyncTarget = {
    accountId: "acct-1",
    name: "Acme",
    productLineId: lineA,
    candidateProductLineIds: [lineA],
    facebookPageIds: ["pg1"],
  };
  const { deps, recordFlaggedAdLanguageCalls } = makeFakeDeps();

  const thaiItem = {
    ad_archive_id: "ad-thai",
    page_id: "pg1",
    page_name: "Acme",
    snapshot: {
      title: "ดีลสุดคุ้ม!",
      body: "เคสไอแพดลิลลี่ แพด แถมฟรีสายชาร์จ! โค้ทลดเพิ่ม 100 บาท จำนวนจำกัด รีบสั่งเลยตอนนี้",
    },
  };

  await processFacebookItems([thaiItem], [target], deps);

  assert.equal(recordFlaggedAdLanguageCalls.length, 1);
  assert.equal(recordFlaggedAdLanguageCalls[0].accountId, "acct-1");
  assert.equal(recordFlaggedAdLanguageCalls[0].languageCode, "tha");
});

test("non-English ad copy: skipped items never even synthesize a carrier row when nothing else happened", async () => {
  const target: SyncTarget = {
    accountId: "acct-1",
    name: "Acme",
    productLineId: lineA,
    candidateProductLineIds: [lineA],
    facebookPageIds: ["pg1"],
  };
  const { deps, recordAdSightingCalls } = makeFakeDeps();

  const thaiItem = {
    ad_archive_id: "ad-thai",
    page_id: "pg1",
    page_name: "Acme",
    snapshot: {
      title: "ดีลสุดคุ้ม!",
      body: "เคสไอแพดลิลลี่ แพด แถมฟรีสายชาร์จ! โค้ทลดเพิ่ม 100 บาท จำนวนจำกัด รีบสั่งเลยตอนนี้",
    },
  };

  // Every item this run is non-English — no platform ever gets a row from
  // seenByPlatform, but the skip note must still surface (via the
  // synthesize-a-carrier-row fallback), not be silently dropped.
  const results = await processFacebookItems([thaiItem], [target], deps);

  assert.equal(recordAdSightingCalls.length, 0);
  assert.equal(results.length, 1);
  assert.ok(results[0].errors.some((e) => e.includes("Skipped 1 non-English ad")));
  assert.equal(results[0].adsSeen, 0);
});
