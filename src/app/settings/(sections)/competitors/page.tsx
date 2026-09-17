import type { Metadata } from "next";
import { CompetitorsBoard } from "@/components/settings/CompetitorsBoard";

export const metadata: Metadata = { title: "Competitors · Settings · VerticalFlash" };

export default function CompetitorsSettingsPage() {
  return <CompetitorsBoard />;
}
