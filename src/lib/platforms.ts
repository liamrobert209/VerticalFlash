// Static per-platform render/publish specs. TikTok is the only platform
// with a real publish integration today (src/app/api/tiktok/upload) — every
// other platform gets the same finishing *experience* (see
// PlatformFinishPanel) but posting is a manual last step until its own API
// integration is built. publishSupported drives that distinction in the UI.
export interface PlatformSpec {
  id: string;
  label: string;
  width: number;
  height: number;
  fps: number;
  maxDurationSeconds: number;
  captionCharLimit: number;
  publishSupported: boolean;
}

export const PLATFORMS: PlatformSpec[] = [
  {
    id: "tiktok",
    label: "TikTok",
    width: 1080,
    height: 1920,
    fps: 30,
    maxDurationSeconds: 600,
    captionCharLimit: 2200,
    publishSupported: true,
  },
  {
    id: "instagram_reels",
    label: "Instagram Reels",
    width: 1080,
    height: 1920,
    fps: 30,
    maxDurationSeconds: 900,
    captionCharLimit: 2200,
    publishSupported: false,
  },
  {
    id: "instagram_feed",
    label: "Instagram Feed",
    width: 1080,
    height: 1350,
    fps: 30,
    maxDurationSeconds: 60,
    captionCharLimit: 2200,
    publishSupported: false,
  },
  {
    id: "facebook",
    label: "Facebook",
    width: 1080,
    height: 1920,
    fps: 30,
    maxDurationSeconds: 240,
    captionCharLimit: 63206,
    publishSupported: false,
  },
  {
    id: "youtube_shorts",
    label: "YouTube Shorts",
    width: 1080,
    height: 1920,
    fps: 30,
    maxDurationSeconds: 180,
    captionCharLimit: 5000,
    publishSupported: false,
  },
  {
    id: "youtube_standard",
    label: "YouTube (standard)",
    width: 1920,
    height: 1080,
    fps: 30,
    maxDurationSeconds: 43200,
    captionCharLimit: 5000,
    publishSupported: false,
  },
  {
    id: "twitter",
    label: "Twitter / X",
    width: 1080,
    height: 1920,
    fps: 30,
    maxDurationSeconds: 140,
    captionCharLimit: 280,
    publishSupported: false,
  },
  {
    id: "linkedin",
    label: "LinkedIn",
    width: 1920,
    height: 1080,
    fps: 30,
    maxDurationSeconds: 600,
    captionCharLimit: 3000,
    publishSupported: false,
  },
  {
    id: "reddit",
    label: "Reddit",
    width: 1920,
    height: 1080,
    fps: 30,
    maxDurationSeconds: 900,
    captionCharLimit: 300,
    publishSupported: false,
  },
];

export const DEFAULT_PLATFORM_ID = "tiktok";

export function findPlatform(id: string | null | undefined): PlatformSpec | null {
  if (!id) return null;
  return PLATFORMS.find((p) => p.id === id) ?? null;
}

export function getPlatform(id: string | null | undefined): PlatformSpec {
  return findPlatform(id) ?? PLATFORMS.find((p) => p.id === DEFAULT_PLATFORM_ID)!;
}
