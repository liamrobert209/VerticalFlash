import type { Metadata } from "next";
import { AgentSettingsBoard } from "@/components/settings/AgentSettingsBoard";

export const metadata: Metadata = { title: "Agents · Settings · VerticalFlash" };

export default function AgentsSettingsPage() {
  return <AgentSettingsBoard />;
}
