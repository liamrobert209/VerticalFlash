import type { Metadata } from "next";
import { ProductImagesBoard } from "@/components/settings/ProductImagesBoard";

export const metadata: Metadata = { title: "Product images · Settings · VerticalFlash" };

export default function ProductImagesSettingsPage() {
  return <ProductImagesBoard />;
}
