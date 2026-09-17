import type { Metadata } from "next";
import { BrandAssetsBoard } from "@/components/settings/BrandAssetsBoard";

export const metadata: Metadata = { title: "Brand assets · Settings · VerticalFlash" };

export default function BrandAssetsSettingsPage() {
  return <BrandAssetsBoard />;
}
