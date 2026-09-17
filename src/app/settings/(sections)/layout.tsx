import Link from "next/link";
import { ChevronLeft } from "lucide-react";

// Shared shell for every settings sub-page — a route group so this layout
// (with its "back to Settings" link) wraps only the sub-pages, not the
// landing page itself. The sub-pages stay fully independent otherwise (no
// shared state beyond the global active-product context, which already
// works fine across arbitrary routes) — this is purely presentational.
export default function SettingsSectionLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-5 py-8 sm:p-10">
      <Link
        href="/settings"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" aria-hidden="true" />
        Settings
      </Link>
      {children}
    </div>
  );
}
