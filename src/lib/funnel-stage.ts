// Client-safe funnel-stage constants and classifier, split out of
// ad-funnel.ts so the browser bundle (e.g. the ad-performance page's chart
// labels) doesn't pull in adnova-store's server-only postgres client.

export const FUNNEL_STAGES = ["TOF", "MOF", "BOF", "unknown"] as const;
export type FunnelStage = (typeof FUNNEL_STAGES)[number];

export const FUNNEL_STAGE_LABELS: Record<FunnelStage, string> = {
  TOF: "Top of funnel",
  MOF: "Middle of funnel",
  BOF: "Bottom of funnel",
  unknown: "Unclassified",
};

// Adnova has no dedicated funnel-stage field — confirmed via direct
// introspection that ai_tags.funnelBreakdown is unset on every single row.
// The real signal is the account's own campaign naming convention, which
// already bakes in funnel stage explicitly (TOF/MOF/BOF, plus PRO/RET/DPA
// as the underlying objective) — checked directly against every real
// campaign name in the account and it classified all of them with no
// leftover "unknown" bucket.
export function classifyFunnelStage(campaignName: string): FunnelStage {
  const name = campaignName.toLowerCase();
  if (/\bmof\b/.test(name)) return "MOF";
  if (/\bbof\b/.test(name)) return "BOF";
  if (/\bret\b/.test(name) || /dpa/.test(name)) return "BOF";
  if (/\btof\b/.test(name) || /\bpro\b/.test(name) || /videoviewfunnel/.test(name) || /ad_recall/.test(name)) {
    return "TOF";
  }
  return "unknown";
}
