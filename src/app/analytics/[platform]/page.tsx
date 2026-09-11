import { notFound } from "next/navigation";
import Link from "next/link";
import { findAnalyticsChannel } from "@/lib/analytics-channels";

// TikTok has its own literal route (analytics/tiktok/page.tsx, the
// original per-channel analytics page) — Next.js resolves that static
// segment ahead of this dynamic one, so this only ever renders for the
// remaining, not-yet-connected channels.
export default async function AnalyticsChannelPage({
  params,
}: {
  params: Promise<{ platform: string }>;
}) {
  const { platform } = await params;
  const channel = findAnalyticsChannel(platform);
  if (!channel) notFound();

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 px-5 py-8 sm:p-10">
      <header className="space-y-2">
        <Link href="/analytics" className="text-sm text-muted-foreground hover:text-foreground">
          ← Analytics
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">{channel.label} analytics</h1>
      </header>
      <div className="rounded-lg border border-dashed border-border p-8 text-center">
        <p className="text-sm text-muted-foreground">
          {channel.label} isn&apos;t connected yet — there&apos;s no live posting/analytics
          integration for this channel, so there&apos;s nothing to show here.
        </p>
      </div>
    </div>
  );
}
