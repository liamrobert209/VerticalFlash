import Link from "next/link";

// Phase 2 of the ICP Coverage feature — not built yet. Needs a new
// classification step (mapping competitor ads onto our own ICP angle list,
// since their Gemini analysis only carries intent/usp/persona today) before
// this can show real data — see the plan discussed with the user.
export default function IcpCompetitorsPage() {
  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-5 py-8 sm:p-10">
      <header className="space-y-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link href="/icp-coverage/portfolio" className="hover:underline">Our ad portfolio</Link>
          <span>·</span>
          <Link href="/icp-coverage/competitors" className="font-semibold text-primary">Competitor analysis</Link>
          <span>·</span>
          <Link href="/icp-coverage/summary" className="hover:underline">Summary</Link>
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">Competitor analysis</h1>
      </header>
      <p className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
        Not built yet — this tab needs a new classification step (mapping each
        competitor ad onto our own ICP pain-point/solution list) before it can
        show real coverage data, plus a one-time backfill for existing ads.
      </p>
    </div>
  );
}
