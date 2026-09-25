"use client";

import { useRouter } from "next/navigation";

// Sidebar landing for the "Create" button — picks which of the Create-
// section flows to start, instead of the sidebar listing every flow as
// its own link. Iterate flows live behind the sibling "Iterate" button
// (see /iterate-hub) — this is only for genuinely new content, not an
// alternate version of something that already exists.
const OPTIONS = [
  {
    title: "Find content for inspiration",
    description: "Scan a niche/hashtag or your saved competitor accounts for videos worth remaking.",
    href: "/scan",
  },
  {
    title: "Create a static ad",
    description: "Pick a competitor's static ad as a visual reference, swap in your product/USP, and generate a new still image.",
    href: "/create-static-ad",
  },
];

export default function CreateHubPage() {
  const router = useRouter();

  return (
    <div className="flex flex-col items-center min-h-screen p-8">
      <div className="w-full max-w-2xl space-y-8 py-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold">What do you want to create?</h1>
          <p className="mt-2 text-muted-foreground">Pick a starting point.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {OPTIONS.map((option) => (
            <button
              key={option.href}
              onClick={() => router.push(option.href)}
              className="text-left p-5 rounded-xl border border-border bg-card hover:border-primary/60 hover:bg-muted/40 transition-colors"
            >
              <span className="font-semibold text-foreground">{option.title}</span>
              <span className="mt-1.5 block text-sm text-muted-foreground">{option.description}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
