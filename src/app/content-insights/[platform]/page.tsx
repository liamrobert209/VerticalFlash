import Link from "next/link";
import { AccountInsightsChannelPage } from "@/components/insights/AccountInsightsBoard";
import { SocialPostInsights } from "@/components/insights/SocialPostInsights";

export default async function ContentInsightsChannelPage({
  params,
}: {
  params: Promise<{ platform: string }>;
}) {
  const { platform } = await params;

  // Facebook/Instagram get real per-post + daily metrics from the
  // social-metrics database instead of the scraped_content-backed
  // account-aggregate card every other channel still uses.
  if (platform === "facebook" || platform === "instagram") {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-6 px-5 py-8 sm:p-10">
        <header className="space-y-2">
          <Link href="/content-insights" className="text-sm text-muted-foreground hover:text-foreground">
            ← Content insights
          </Link>
          <h1 className="text-3xl font-semibold tracking-tight">
            {platform === "facebook" ? "Facebook" : "Instagram"} content insights
          </h1>
        </header>
        <SocialPostInsights initialPlatform={platform} />
      </div>
    );
  }

  return (
    <AccountInsightsChannelPage
      platform={platform}
      apiPath={`/api/content-insights/${platform}`}
      backHref="/content-insights"
      title="Content insights"
    />
  );
}
