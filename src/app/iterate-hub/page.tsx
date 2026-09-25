"use client";

import { useRouter } from "next/navigation";

// Sidebar landing for the "Iterate" button — picks which existing piece
// of content to build an alternate version of. Sibling to /create-hub,
// which covers genuinely new content instead.
const OPTIONS = [
  {
    title: "Iterate on a top video",
    description: "Pick one of your own best-performing published videos and build an alternate version.",
    href: "/iterate",
  },
  {
    title: "Iterate creator content",
    description: "Swap the hook and product on an affiliate's, influencer's, or other creator's video.",
    href: "/create-ad-hoc?origin=creator",
  },
  {
    title: "Iterate ad content",
    description: "Same tool as above, tagged as coming from a competitor or your own past ad.",
    href: "/create-ad-hoc?origin=ad",
  },
];

export default function IterateHubPage() {
  const router = useRouter();

  return (
    <div className="flex flex-col items-center min-h-screen p-8">
      <div className="w-full max-w-2xl space-y-8 py-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold">What do you want to iterate on?</h1>
          <p className="mt-2 text-muted-foreground">Pick what the new version should be based on.</p>
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
