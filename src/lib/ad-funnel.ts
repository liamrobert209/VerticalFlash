import { listCampaignSpend } from "./adnova-store";
import { FUNNEL_STAGES, classifyFunnelStage, type FunnelStage } from "./funnel-stage";

export { FUNNEL_STAGES, FUNNEL_STAGE_LABELS, classifyFunnelStage } from "./funnel-stage";
export type { FunnelStage } from "./funnel-stage";

export interface FunnelStageSpend {
  stage: FunnelStage;
  campaignCount: number;
  spend: number;
  revenue: number;
  purchaseCount: number;
  roas: number | null;
  merPct: number | null;
  spendShare: number;
}

// Spend/revenue/ROAS rolled up by funnel stage, optionally scoped to a date
// range — reuses whatever campaign-level totals listCampaignSpend returns
// rather than re-querying per-stage.
export async function getFunnelStageDistribution(from?: string, to?: string): Promise<FunnelStageSpend[]> {
  const campaigns = await listCampaignSpend(from, to);

  const totals = new Map<FunnelStage, { campaignCount: number; spend: number; revenue: number; purchaseCount: number }>();
  for (const stage of FUNNEL_STAGES) {
    totals.set(stage, { campaignCount: 0, spend: 0, revenue: 0, purchaseCount: 0 });
  }
  for (const c of campaigns) {
    const t = totals.get(classifyFunnelStage(c.campaignName))!;
    t.campaignCount++;
    t.spend += c.spend;
    t.revenue += c.revenue;
    t.purchaseCount += c.purchaseCount;
  }

  const totalSpend = campaigns.reduce((sum, c) => sum + c.spend, 0);
  return FUNNEL_STAGES.map((stage) => {
    const t = totals.get(stage)!;
    return {
      stage,
      campaignCount: t.campaignCount,
      spend: t.spend,
      revenue: t.revenue,
      purchaseCount: t.purchaseCount,
      roas: t.spend > 0 ? t.revenue / t.spend : null,
      merPct: t.revenue > 0 ? (t.spend / t.revenue) * 100 : null,
      spendShare: totalSpend > 0 ? t.spend / totalSpend : 0,
    };
  })
    .filter((s) => s.campaignCount > 0)
    .sort((a, b) => b.spend - a.spend);
}
