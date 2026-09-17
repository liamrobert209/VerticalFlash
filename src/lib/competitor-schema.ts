import { z } from "zod";

// Matches your competitor doc's own six categories. Bulbs and red-light
// therapy aren't among the 8 active Ocushield product lines — they're kept
// as watchable competitors, not forced into the product-line enum.
export const COMPETITOR_CATEGORY_IDS = [
  "glasses",
  "screen_protectors",
  "privacy_filters",
  "supplements",
  "bulbs",
  "red_light_therapy",
] as const;

export type CompetitorCategoryId = (typeof COMPETITOR_CATEGORY_IDS)[number];

// Documented, non-enforced starting point for seeding — editable per
// account afterward, since real overlap isn't always this clean (e.g.
// Belkin sits under both screen protectors and privacy filters).
export const CATEGORY_TO_PRODUCT_LINES: Record<CompetitorCategoryId, string[]> = {
  glasses: ["anti_blue_light_glasses"],
  screen_protectors: ["phone_screen_protector", "ipad_screen_protector"],
  privacy_filters: ["macbook_privacy_filter", "monitor_privacy_filter"],
  supplements: ["eye_health_supplements"],
  bulbs: [],
  red_light_therapy: [],
};

export const COMPETITOR_REGIONS = ["uk", "eu", "us"] as const;
export type CompetitorRegion = (typeof COMPETITOR_REGIONS)[number];

export const TIKTOK_STATUSES = ["confirmed", "present_unconfirmed", "not_found"] as const;
export type TikTokStatus = (typeof TIKTOK_STATUSES)[number];

// Brand accounts source Weekly Ads + Weekly Content; creator/affiliate
// accounts source Weekly Creators (see content-record-schema.ts's
// referenceOrigin, which draws the same distinction on OUR generated
// content). Existing rows default to "brand" — every account seeded from
// the original competitor doc was a company, not a creator.
export const ACCOUNT_TYPES = ["brand", "creator"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const CompetitorAccountZ = z.object({
  id: z.string(),
  name: z.string().min(1),
  accountType: z.enum(ACCOUNT_TYPES).default("brand"),
  region: z.enum(COMPETITOR_REGIONS),
  website: z.string().nullable(),
  instagramHandle: z.string().nullable(),
  instagramUrl: z.string().nullable(),
  instagramFollowers: z.number().int().nullable(),
  facebookHandle: z.string().nullable(),
  facebookUrl: z.string().nullable(),
  facebookFollowers: z.number().int().nullable(),
  // Facebook Page ids this account is known to run ads from — matched
  // first (exact, display-name-independent) during a sync, before falling
  // back to matching by page name. A brand's regional storefronts (e.g.
  // "Barner Brand KW") are genuinely distinct Pages with their own ids, so
  // this can hold more than one; populated manually and auto-appended
  // whenever a sync matches an ad by name for the first time.
  facebookPageIds: z.array(z.string()).default([]),
  tiktokHandle: z.string().nullable(),
  tiktokUrl: z.string().nullable(),
  tiktokFollowers: z.number().int().nullable(),
  tiktokStatus: z.enum(TIKTOK_STATUSES),
  positioning: z.string().nullable(),
  crossCategoryFlag: z.boolean(),
  notes: z.string().nullable(),
  createdAt: z.union([z.string(), z.date()]),
  updatedAt: z.union([z.string(), z.date()]),
  categories: z.array(z.enum(COMPETITOR_CATEGORY_IDS)).default([]),
  productLineIds: z.array(z.string()).default([]),
});

export type CompetitorAccount = z.infer<typeof CompetitorAccountZ>;

// Input shape for creating/updating an account — id/timestamps are server-assigned
export const CompetitorAccountInputZ = z.object({
  name: z.string().min(1),
  accountType: z.enum(ACCOUNT_TYPES).default("brand"),
  region: z.enum(COMPETITOR_REGIONS),
  website: z.string().nullable().optional(),
  instagramHandle: z.string().nullable().optional(),
  instagramUrl: z.string().nullable().optional(),
  instagramFollowers: z.number().int().nullable().optional(),
  facebookHandle: z.string().nullable().optional(),
  facebookUrl: z.string().nullable().optional(),
  facebookFollowers: z.number().int().nullable().optional(),
  facebookPageIds: z.array(z.string()).default([]),
  tiktokHandle: z.string().nullable().optional(),
  tiktokUrl: z.string().nullable().optional(),
  tiktokFollowers: z.number().int().nullable().optional(),
  tiktokStatus: z.enum(TIKTOK_STATUSES).default("not_found"),
  positioning: z.string().nullable().optional(),
  crossCategoryFlag: z.boolean().default(false),
  notes: z.string().nullable().optional(),
  categories: z.array(z.enum(COMPETITOR_CATEGORY_IDS)).default([]),
  productLineIds: z.array(z.string()).default([]),
});

export type CompetitorAccountInput = z.infer<typeof CompetitorAccountInputZ>;

export const CompetitorQueryZ = z.object({
  category: z.enum(COMPETITOR_CATEGORY_IDS).optional(),
  region: z.enum(COMPETITOR_REGIONS).optional(),
  productLineId: z.string().optional(),
  accountType: z.enum(ACCOUNT_TYPES).optional(),
  scanReady: z.coerce.boolean().optional(),
});

export type CompetitorQuery = z.infer<typeof CompetitorQueryZ>;
