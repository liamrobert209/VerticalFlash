import assert from "node:assert/strict";
import { test } from "node:test";
import type { GoogleGenAI } from "@google/genai";
import { mergeContentTags } from "../src/lib/scraped-content-store";
import type { ScrapedContent, ScrapedContentSighting } from "../src/lib/scraped-content-schema";
import type { ContentAnalysis } from "../src/lib/content-analysis-schema";
import type { ProductLineCandidate } from "../src/lib/content-analyze";
import { getPublicProductLines } from "../src/lib/config";
import { resolveProductLineId } from "../src/lib/weekly-ads-sync";
import {
  processInstagramProfiles,
  processTikTokItems,
  type ProcessContentItemsDeps,
  type ContentSyncTarget,
} from "../src/lib/content-sync";

// --- mergeContentTags (pure) ---------------------------------------------

test("mergeContentTags dedupes, trims/lowercases, and sorts", () => {
  assert.deepEqual(
    mergeContentTags(["Bold", " colorful "], ["bold", "MINIMAL", "colorful"]),
    ["bold", "colorful", "minimal"]
  );
  assert.deepEqual(mergeContentTags([], []), []);
  assert.deepEqual(mergeContentTags(["a"], []), ["a"]);
  assert.deepEqual(mergeContentTags([], ["b", "  ", ""]), ["b"]);
});

// --- fixtures -------------------------------------------------------------

function makeContent(overrides: Partial<ScrapedContent> = {}): ScrapedContent {
  const now = new Date().toISOString();
  return {
    id: "content-id",
    accountId: null,
    platformId: "instagram",
    productLineId: null,
    externalContentId: "ext-1",
    postedAt: now,
    caption: "A caption",
    mediaUrl: "https://cdn.example.test/media.jpg",
    thumbnailUrl: "https://cdn.example.test/thumb.jpg",
    thumbnailLocalFile: null,
    viewCount: null,
    likeCount: 10,
    commentCount: 2,
    shareCount: null,
    tags: [],
    raw: null,
    analysis: null,
    analyzedAt: null,
    format: "image",
    firstSeenAt: now,
    lastSeenAt: now,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeContentAnalysis(overrides: Partial<ContentAnalysis> = {}): ContentAnalysis {
  return {
    summary: "A good post.",
    topic: "product_demo",
    painPoint: "Struggling with X",
    solutionAddressed: "Solves X",
    productShown: "Widget",
    tags: ["bold", "colorful"],
    productLineId: null,
    ...overrides,
  };
}

function makeFakeDeps(opts: {
  recordedContentOverrides?: Partial<ScrapedContent>;
  analysis?: ContentAnalysis;
  listUnanalyzedContentResult?: ScrapedContent[];
} = {}) {
  const recordContentSightingCalls: ScrapedContentSighting[] = [];
  const saveContentAnalysisCalls: {
    contentId: string;
    analysis: ContentAnalysis;
    productLineId: string | null | undefined;
  }[] = [];
  const analyzeContentCalls: {
    imageUrl: string;
    context: { caption: string | null; platformId: string };
    candidates: ProductLineCandidate[] | undefined;
  }[] = [];
  const listUnanalyzedContentCalls: { limit: number; accountIds?: string[] }[] = [];

  let sightingCounter = 0;

  const deps: ProcessContentItemsDeps = {
    recordContentSighting: async (sighting) => {
      recordContentSightingCalls.push(sighting);
      sightingCounter += 1;
      return makeContent({
        id: `content-${sightingCounter}`,
        accountId: sighting.accountId ?? null,
        platformId: sighting.platformId,
        productLineId: sighting.productLineId ?? null,
        externalContentId: sighting.externalContentId,
        caption: sighting.caption ?? null,
        thumbnailUrl: sighting.thumbnailUrl ?? null,
        mediaUrl: sighting.mediaUrl ?? null,
        format: sighting.format ?? null,
        ...opts.recordedContentOverrides,
      });
    },
    saveContentAnalysis: async (contentId, analysis, productLineId) => {
      saveContentAnalysisCalls.push({ contentId, analysis, productLineId });
      return makeContent({ id: contentId, analysis, productLineId: productLineId ?? null });
    },
    analyzeContent: async (_ai, imageUrl, context, candidates) => {
      analyzeContentCalls.push({ imageUrl, context, candidates });
      return opts.analysis ?? makeContentAnalysis();
    },
    listUnanalyzedContent: async (limit, accountIds) => {
      listUnanalyzedContentCalls.push({ limit, accountIds });
      return opts.listUnanalyzedContentResult ?? [];
    },
    getGeminiClient: () => ({} as GoogleGenAI),
  };

  return {
    deps,
    recordContentSightingCalls,
    saveContentAnalysisCalls,
    analyzeContentCalls,
    listUnanalyzedContentCalls,
  };
}

function igPost(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    type: "Image" as const,
    caption: "Caption",
    displayUrl: "https://cdn.example.test/ig.jpg",
    likesCount: 10,
    commentsCount: 2,
    timestamp: new Date().toISOString(),
    ownerUsername: "acme",
    ...overrides,
  };
}

function igProfile(username: string, posts: ReturnType<typeof igPost>[]) {
  return { username, latestPosts: posts };
}

function ttItem(id: string, authorName: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    text: "Caption",
    createTimeISO: new Date().toISOString(),
    webVideoUrl: "https://tiktok.example.test/video",
    diggCount: 5,
    shareCount: 1,
    playCount: 100,
    commentCount: 2,
    isSlideshow: false,
    videoMeta: { coverUrl: "https://cdn.example.test/cover.jpg" },
    authorMeta: { name: authorName },
    ...overrides,
  };
}

const [lineA, lineB] = getPublicProductLines().map((l) => l.id);

// --- resolveProductLineId reuse sanity check (already tested in
// weekly-ads-sync.test.ts — just confirms content-sync.ts's wiring uses
// the same shared function, not a re-implementation) -----------------

test("resolveProductLineId (shared with weekly-ads-sync.ts) behaves as expected here too", () => {
  assert.equal(resolveProductLineId("default", ["a", "b"], "b"), "b");
  assert.equal(resolveProductLineId("default", ["a", "b"], "c"), "default");
});

// --- Instagram wiring -----------------------------------------------------

test("Instagram: multi-line target + valid Gemini pick: saveContentAnalysis gets that pick", async () => {
  const target: ContentSyncTarget = {
    accountId: "acct-1",
    name: "Acme",
    instagramHandle: "acme",
    productLineId: lineA,
    candidateProductLineIds: [lineA, lineB],
  };
  const { deps, saveContentAnalysisCalls, analyzeContentCalls } = makeFakeDeps({
    analysis: makeContentAnalysis({ productLineId: lineB }),
  });

  await processInstagramProfiles([igProfile("acme", [igPost("p1")])], [target], 5, deps);

  assert.equal(analyzeContentCalls.length, 1);
  assert.deepEqual(
    analyzeContentCalls[0].candidates?.map((c) => c.id).sort(),
    [lineA, lineB].sort()
  );
  assert.equal(saveContentAnalysisCalls.length, 1);
  assert.equal(saveContentAnalysisCalls[0].productLineId, lineB);
});

test("Instagram: multi-line target + invalid/missing Gemini pick: falls back to the default", async () => {
  const target: ContentSyncTarget = {
    accountId: "acct-1",
    name: "Acme",
    instagramHandle: "acme",
    productLineId: lineA,
    candidateProductLineIds: [lineA, lineB],
  };
  const { deps, saveContentAnalysisCalls } = makeFakeDeps({
    analysis: makeContentAnalysis({ productLineId: "not-a-real-candidate" }),
  });

  await processInstagramProfiles([igProfile("acme", [igPost("p1")])], [target], 5, deps);

  assert.equal(saveContentAnalysisCalls.length, 1);
  assert.equal(saveContentAnalysisCalls[0].productLineId, lineA);

  const { deps: deps2, saveContentAnalysisCalls: calls2 } = makeFakeDeps({
    analysis: makeContentAnalysis({ productLineId: null }),
  });
  await processInstagramProfiles([igProfile("acme", [igPost("p2")])], [target], 5, deps2);
  assert.equal(calls2[0].productLineId, lineA);
});

test("Instagram: single-line target: analyzeContent is called with candidates undefined", async () => {
  const target: ContentSyncTarget = {
    accountId: "acct-1",
    name: "Acme",
    instagramHandle: "acme",
    productLineId: lineA,
    candidateProductLineIds: [lineA],
  };
  const { deps, analyzeContentCalls, saveContentAnalysisCalls } = makeFakeDeps();

  await processInstagramProfiles([igProfile("acme", [igPost("p1")])], [target], 5, deps);

  assert.equal(analyzeContentCalls.length, 1);
  assert.equal(analyzeContentCalls[0].candidates, undefined);
  assert.equal(saveContentAnalysisCalls[0].productLineId, lineA);
});

test("Instagram: posts are sorted newest-first and sliced to itemsPerTarget client-side", async () => {
  const target: ContentSyncTarget = {
    accountId: "acct-1",
    name: "Acme",
    instagramHandle: "acme",
  };
  const older = igPost("old", { timestamp: new Date(Date.now() - 100000).toISOString() });
  const newer = igPost("new", { timestamp: new Date().toISOString() });
  const { deps, recordContentSightingCalls } = makeFakeDeps();

  // itemsPerTarget=1 with 2 posts back — only the newer one should survive.
  await processInstagramProfiles([igProfile("acme", [older, newer])], [target], 1, deps);

  assert.equal(recordContentSightingCalls.length, 1);
  assert.equal(recordContentSightingCalls[0].externalContentId, "new");
});

test("Instagram: format derivation (image/video/carousel) is deterministic", async () => {
  const target: ContentSyncTarget = { accountId: "acct-1", name: "Acme", instagramHandle: "acme" };
  const { deps, recordContentSightingCalls } = makeFakeDeps();

  await processInstagramProfiles(
    [
      igProfile("acme", [
        igPost("p-image", { type: "Image" }),
        igPost("p-video", { type: "Video" }),
        igPost("p-carousel", { type: "Sidecar" }),
      ]),
    ],
    [target],
    5,
    deps
  );

  const byId = new Map(recordContentSightingCalls.map((c) => [c.externalContentId, c.format]));
  assert.equal(byId.get("p-image"), "image");
  assert.equal(byId.get("p-video"), "video");
  assert.equal(byId.get("p-carousel"), "carousel");
});

// --- TikTok wiring ----------------------------------------------------

test("TikTok: matches items back to targets via authorMeta.name (case-insensitive)", async () => {
  const target: ContentSyncTarget = { accountId: "acct-1", name: "Acme", tiktokHandle: "AcmeOfficial" };
  const { deps, recordContentSightingCalls } = makeFakeDeps();

  await processTikTokItems([ttItem("v1", "acmeofficial")], [target], deps);

  assert.equal(recordContentSightingCalls.length, 1);
  assert.equal(recordContentSightingCalls[0].accountId, "acct-1");
});

test("TikTok: format derivation (isSlideshow -> carousel, else video)", async () => {
  const target: ContentSyncTarget = { accountId: "acct-1", name: "Acme", tiktokHandle: "acme" };
  const { deps, recordContentSightingCalls } = makeFakeDeps();

  await processTikTokItems(
    [ttItem("v1", "acme", { isSlideshow: false }), ttItem("v2", "acme", { isSlideshow: true })],
    [target],
    deps
  );

  const byId = new Map(recordContentSightingCalls.map((c) => [c.externalContentId, c.format]));
  assert.equal(byId.get("v1"), "video");
  assert.equal(byId.get("v2"), "carousel");
});

test("TikTok: an item with no matching target is dropped, not stored", async () => {
  const target: ContentSyncTarget = { accountId: "acct-1", name: "Acme", tiktokHandle: "acme" };
  const { deps, recordContentSightingCalls } = makeFakeDeps();

  await processTikTokItems([ttItem("v1", "someone-else")], [target], deps);

  assert.equal(recordContentSightingCalls.length, 0);
});

// --- Retry pass ------------------------------------------------------

test("retry pass: an unanalyzed post from listUnanalyzedContent goes through the same analysis path, even with zero live items", async () => {
  const target: ContentSyncTarget = {
    accountId: "acct-1",
    name: "Acme",
    instagramHandle: "acme",
    productLineId: lineA,
    candidateProductLineIds: [lineA, lineB],
  };
  const retryContent = makeContent({
    id: "retry-content",
    accountId: "acct-1",
    analyzedAt: null,
    thumbnailUrl: "https://cdn.example.test/retry-thumb.jpg",
  });
  const { deps, saveContentAnalysisCalls, analyzeContentCalls, listUnanalyzedContentCalls } = makeFakeDeps({
    analysis: makeContentAnalysis({ productLineId: lineB }),
    listUnanalyzedContentResult: [retryContent],
  });

  // No profiles fetched this sync (e.g. the actor call returned nothing) —
  // the retry pass should still run against the given accounts.
  const results = await processInstagramProfiles([], [target], 5, deps);

  assert.equal(listUnanalyzedContentCalls.length, 1);
  assert.deepEqual(listUnanalyzedContentCalls[0], { limit: 10, accountIds: ["acct-1"] });
  assert.equal(analyzeContentCalls.length, 1);
  assert.equal(saveContentAnalysisCalls.length, 1);
  assert.equal(saveContentAnalysisCalls[0].contentId, "retry-content");
  assert.equal(saveContentAnalysisCalls[0].productLineId, lineB);
  assert.deepEqual(results, [{ platformId: "instagram", contentSeen: 0, errors: [] }]);
});
