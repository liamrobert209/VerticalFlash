import type { IcpProfile } from "./product-lines";

// Split out of product-lines.ts so client components can import these as
// real values (not just types) without pulling in the whole module —
// product-lines.ts's resolveIcp() has a dynamic import("./icp-store") that
// drags in the postgres client (fs/perf_hooks), which breaks the client
// build the moment anything besides a type is imported from it. Same fix
// ad-analysis-schema.ts's header comment already documents for the exact
// same class of problem (AD_INTENT_LABELS once bloated a client bundle
// before that split).

// A closed vocabulary of hook/angle options for a product's ICP, used by
// the iterate-on-content tool's angle pickers and the Static Ad
// Generator's category → detailed-angle picker. Each option carries which
// list it came from so content records can store that provenance.
export const ANGLE_SOURCE_LISTS = [
  "problemsSolved",
  "loves",
  "purchaseDrivers",
  "nearMissObjections",
] as const;

export type AngleSourceList = (typeof ANGLE_SOURCE_LISTS)[number];

// Human-facing category labels for ANGLE_SOURCE_LISTS — used by the Static
// Ad Generator's category → detailed-angle picker so the raw ICP list
// names never leak into the UI.
export const ANGLE_SOURCE_LABELS: Record<AngleSourceList, string> = {
  problemsSolved: "Problem we solve",
  loves: "What they already love",
  purchaseDrivers: "What drives purchase",
  nearMissObjections: "Objection to overcome",
};

export interface AngleOption {
  label: string;
  source: AngleSourceList;
}

// Turns an angleCategory/angleLabel pair into one descriptive string for
// prompts — e.g. "Problem we solve: eye strain from prolonged screen use"
// — used by both the base-image generation brief and ad-copy generation so
// neither has to duplicate the category-label lookup.
export function describeAngle(category: AngleSourceList | null, label: string): string {
  return category ? `${ANGLE_SOURCE_LABELS[category]}: ${label}` : label;
}

export function angleOptionsForIcp(icp: IcpProfile): AngleOption[] {
  const options: AngleOption[] = [];
  for (const source of ANGLE_SOURCE_LISTS) {
    for (const item of icp[source]) {
      options.push({ label: item.label, source });
    }
  }
  return options;
}
