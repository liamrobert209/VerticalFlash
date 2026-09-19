import type { Metadata } from "next";
import { ActorImagesBoard } from "@/components/settings/ActorImagesBoard";

export const metadata: Metadata = { title: "Actor images · Settings · VerticalFlash" };

export default function ActorImagesSettingsPage() {
  return <ActorImagesBoard />;
}
