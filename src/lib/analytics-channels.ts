// The channel set for Analytics/Insights — deliberately its own list
// rather than reusing platforms.ts's PLATFORMS: that array splits by
// render format (instagram_reels vs instagram_feed, youtube_shorts vs
// youtube_standard) since it drives export dimensions, but analytics is
// per-CHANNEL, not per-format, so Instagram/YouTube are each one entry
// here.
export interface AnalyticsChannel {
  id: string;
  label: string;
  connected: boolean;
}

export const ANALYTICS_CHANNELS: AnalyticsChannel[] = [
  { id: "tiktok", label: "TikTok", connected: true },
  { id: "facebook", label: "Facebook", connected: false },
  { id: "instagram", label: "Instagram", connected: false },
  { id: "reddit", label: "Reddit", connected: false },
  { id: "twitter", label: "Twitter / X", connected: false },
  { id: "youtube", label: "YouTube", connected: false },
];

export function findAnalyticsChannel(id: string): AnalyticsChannel | undefined {
  return ANALYTICS_CHANNELS.find((c) => c.id === id);
}
