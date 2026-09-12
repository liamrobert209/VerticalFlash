import { AccountInsightsChannelPage } from "@/components/insights/AccountInsightsBoard";

export default async function ContentInsightsChannelPage({
  params,
}: {
  params: Promise<{ platform: string }>;
}) {
  const { platform } = await params;
  return (
    <AccountInsightsChannelPage
      platform={platform}
      apiPath={`/api/content-insights/${platform}`}
      backHref="/content-insights"
      title="Content insights"
    />
  );
}
