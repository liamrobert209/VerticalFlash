import type { Metadata } from "next";
import Link from "next/link";
import { BarChart3, Image as ImageIcon, Megaphone, Palette, Plug, Settings2, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Settings · VerticalFlash" };

interface SettingsSection {
  title: string;
  description: string;
  href: string;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
}

const SECTIONS: SettingsSection[] = [
  {
    title: "Agents",
    description: "Select which workflow agents are active for this workspace.",
    href: "/settings/agents",
    icon: SlidersHorizontal,
  },
  {
    title: "Competitors",
    description: "Manage the brand and creator accounts tracked across Weekly Digest.",
    href: "/settings/competitors",
    icon: Megaphone,
  },
  {
    title: "Brand assets",
    description: "Logo, colors, and other brand reference files.",
    href: "/settings/brand-assets",
    icon: Palette,
  },
  {
    title: "Product images",
    description: "Five labeled reference photos per product line, used by AI generation.",
    href: "/settings/product-images",
    icon: ImageIcon,
  },
  {
    title: "Agent kit",
    description: "Download and connect the MCP kit so an external agent can work in this workspace.",
    href: "/settings/agent-kit",
    icon: Plug,
  },
];

export default function SettingsPage() {
  return (
    <div className="mx-auto w-full max-w-4xl space-y-8 px-5 py-8 sm:p-10">
      <header className="space-y-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><Settings2 className="size-4" aria-hidden="true" />Workspace</div>
        <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
        <p className="max-w-2xl text-muted-foreground">Select workflow agents, connect external agent tooling, and manage workspace-level controls.</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        {SECTIONS.map((section) => (
          <Link
            key={section.href}
            href={section.href}
            className="flex items-start gap-3 rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/60"
          >
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <section.icon className="size-5" aria-hidden />
            </div>
            <div>
              <h2 className="text-lg font-semibold">{section.title}</h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">{section.description}</p>
            </div>
          </Link>
        ))}
      </div>

      <section aria-labelledby="benchmarks" className="rounded-lg border border-border bg-card p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <BarChart3 className="size-5" aria-hidden="true" />
            </div>
            <div>
              <h2 id="benchmarks" className="text-lg font-semibold">AI editing benchmarks</h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
                Create locked provider comparisons for tagging, matching, storyboarding, editing, and B-roll, then collect blind human ratings.
              </p>
            </div>
          </div>
          <Button asChild size="lg">
            <Link href="/benchmarks">Open benchmarks</Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
