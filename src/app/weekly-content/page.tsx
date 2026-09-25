"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { WeeklyContentBoard } from "@/components/weekly-digest/WeeklyContentBoard";

// Weekly Content and Weekly Creators used to be two separate sidebar
// entries pointing at the exact same WeeklyContentBoard component with
// only origin/apiPath swapped — merged here into one page with a tab.

const TABS = [
  {
    id: "brand",
    label: "Brand accounts",
    props: {
      title: "Weekly content",
      description: "Organic posts from your saved competitor brand accounts. One section per product, newest and top-performing.",
      apiPath: "/api/weekly-content",
      origin: "ad" as const,
      emptyStateHint: "No content synced yet. Syncing organic content isn't wired up yet — check back once that's ready.",
    },
  },
  {
    id: "creators",
    label: "Creator accounts",
    props: {
      title: "Weekly creators",
      description: "Organic posts from your saved creator/affiliate accounts. One section per product, newest and top-performing.",
      apiPath: "/api/weekly-creators",
      origin: "creator" as const,
      emptyStateHint: "No creator content synced yet. Syncing organic content isn't wired up yet — check back once that's ready.",
    },
  },
] as const;

type TabId = (typeof TABS)[number]["id"];

function WeeklyContentPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawTab = searchParams.get("tab");
  const tab: TabId = TABS.some((t) => t.id === rawTab) ? (rawTab as TabId) : "brand";
  const active = TABS.find((t) => t.id === tab) ?? TABS[0];

  const setTab = (id: TabId) => {
    router.replace(id === "brand" ? "/weekly-content" : `/weekly-content?tab=${id}`, { scroll: false });
  };

  return (
    <div>
      <div className="mx-auto w-full max-w-5xl px-5 pt-8 sm:px-10 sm:pt-10">
        <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-muted/40 p-1">
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${
                tab === id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <WeeklyContentBoard key={active.id} {...active.props} />
    </div>
  );
}

export default function WeeklyContentPage() {
  return (
    <Suspense fallback={<div className="p-10 text-sm text-muted-foreground">Loading...</div>}>
      <WeeklyContentPageInner />
    </Suspense>
  );
}
