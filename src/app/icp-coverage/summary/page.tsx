import Link from "next/link";

// Phase 3 of the ICP Coverage feature — not built yet. Synthesizes the
// portfolio and competitor-analysis tabs (gaps, over-indexing, competitive-
// intensity signals), so it depends on the competitor-analysis tab existing
// first.
export default function IcpSummaryPage() {
  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-5 py-8 sm:p-10">
      <header className="space-y-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link href="/icp-coverage/portfolio" className="hover:underline">Our ad portfolio</Link>
          <span>·</span>
          <Link href="/icp-coverage/competitors" className="hover:underline">Competitor analysis</Link>
          <span>·</span>
          <Link href="/icp-coverage/summary" className="font-semibold text-primary">Summary</Link>
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">Summary</h1>
      </header>
      <p className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
        Not built yet — this synthesizes the portfolio and competitor-analysis
        tabs into gaps, over-indexing, and competitive-intensity signals, so
        it depends on the competitor-analysis tab existing first.
      </p>
    </div>
  );
}
