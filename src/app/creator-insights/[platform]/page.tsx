import { AccountInsightsChannelPage } from "@/components/insights/AccountInsightsBoard";

export default async function CreatorInsightsChannelPage({
  params,
}: {
  params: Promise<{ platform: string }>;
}) {
  const { platform } = await params;
  return (
    <AccountInsightsChannelPage
      platform={platform}
      apiPath={`/api/creator-insights/${platform}`}
      backHref="/creator-insights"
      title="Creator insights"
    />
  );
}
