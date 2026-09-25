import { notFound } from "next/navigation";
import Link from "next/link";
import { Plug } from "lucide-react";
import { findAnalyticsChannel } from "@/lib/analytics-channels";
import { EmptyState } from "@/components/ui/EmptyState";

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
      <EmptyState
        icon={Plug}
        title={`${channel.label} isn't connected yet`}
        description="There's no live posting/analytics integration for this channel, so there's nothing to show here."
      />
    </div>
  );
}
