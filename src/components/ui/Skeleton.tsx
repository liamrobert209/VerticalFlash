// Shared shimmer placeholder — replaces the plain "Loading..." text that
// was scattered across every data page with something that actually
// hints at the shape of what's coming in.
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-muted ${className}`} />;
}

export function SkeletonCardGrid({ count = 6, className = "" }: { count?: number; className?: string }) {
  return (
    <div className={`grid gap-4 sm:grid-cols-2 md:grid-cols-3 ${className}`}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="space-y-2 rounded-lg border border-border p-4">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-4/5" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonRows({ count = 4, className = "" }: { count?: number; className?: string }) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-14 w-full" />
      ))}
    </div>
  );
}

// Stands in for a horizontal-bar-chart card (ICP Coverage's category
// breakdowns) — a title-width bar plus a handful of bars at varying
// widths, so the loading state at least reads as "a chart is coming"
// rather than a generic block.
const BAR_WIDTHS = ["w-2/3", "w-1/3", "w-1/2", "w-5/6", "w-2/5"];

// For loading rows inside an existing <table>/<tbody> — a plain <div>
// skeleton can't be a direct tbody child.
export function SkeletonTableRows({ columns, rows = 5 }: { columns: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={r} className="border-b border-border last:border-0">
          {Array.from({ length: columns }).map((_, c) => (
            <td key={c} className="px-4 py-3">
              <Skeleton className="h-4 w-full" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export function SkeletonChart({ rows = 4, className = "" }: { rows?: number; className?: string }) {
  return (
    <div className={`space-y-3 rounded-lg border border-border p-4 ${className}`}>
      <Skeleton className="h-4 w-1/3" />
      <div className="space-y-2">
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className={`h-5 ${BAR_WIDTHS[i % BAR_WIDTHS.length]}`} />
        ))}
      </div>
    </div>
  );
}
