import type { Metadata } from "next";
import { ProductLinesBoard } from "@/components/settings/ProductLinesBoard";

export const metadata: Metadata = { title: "Product Lines · Settings · VerticalFlash" };

export default function ProductLinesSettingsPage() {
  return <ProductLinesBoard />;
}
