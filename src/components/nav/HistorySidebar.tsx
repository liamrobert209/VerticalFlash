"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, CalendarClock, ChevronRight, ClipboardCheck, FileClock, Film, Hash, Home, Image as ImageIcon, Megaphone, Menu, Newspaper, Palette, Plug, RotateCcw, Search, Settings2, SlidersHorizontal, Sparkles, Trash2, TrendingUp, Users, X } from "lucide-react";
import { useScanHistory } from "@/app/context/scan-history";
import type { DownloadEntry } from "@/lib/download-types";
import { projectHref, projectStage } from "@/lib/project-navigation";
import { ANALYTICS_CHANNELS } from "@/lib/analytics-channels";

const navClass = "flex min-h-7 items-center gap-2 text-sm font-semibold hover:text-primary";

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">
      {children}
    </p>
  );
}

// Every plain nav link uses this so the current page is always visually
// obvious — extends the pattern the Settings section already had on its
// own before this was generalized to the rest of the sidebar.
function NavLink({
  href,
  pathname,
  icon: Icon,
  children,
}: {
  href: string;
  pathname: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  const active = pathname === href;
  return (
    <Link href={href} aria-current={active ? "page" : undefined} className={`${navClass} ${active ? "text-primary" : ""}`}>
      <Icon className="size-4 shrink-0" />
      {children}
    </Link>
  );
}

// Top-level main-menu rollup: every section (Create, Library, Projects,
// Weekly Digest, Insights, Settings) collapses to just its header. This is
// a layer above the existing per-item collapsing inside Projects/Insights
// (Scan History, Analytics, Ad Insights, ...) — that finer-grained
// behavior is unchanged, just now nested inside one more toggle.
function CollapsibleSection({
  id,
  label,
  open,
  onToggle,
  children,
}: {
  id: string;
  label: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1 border-t border-border pt-4">
      <button
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={`sidebar-section-${id}`}
        className="flex w-full items-center gap-1.5 text-left"
      >
        <ChevronRight
          className={`size-3.5 shrink-0 text-muted-foreground/70 transition-transform ${open ? "rotate-90" : ""}`}
        />
        <SectionLabel>{label}</SectionLabel>
      </button>
      {open && (
        <div id={`sidebar-section-${id}`} className="space-y-1 pl-1">
          {children}
        </div>
      )}
    </div>
  );
}

export function HistorySidebar() {
  const { scans, currentScanId, deleteScan } = useScanHistory();
  const pathname = usePathname();
  const [files, setFiles] = useState<DownloadEntry[]>([]);
  const [open, setOpen] = useState({
    scans: true, storyboarding: true, editing: true, analytics: false, adInsights: false, contentInsights: false, creatorInsights: false,
    homeSection: true, createSection: true, librarySection: true, projectsSection: true, weeklyDigestSection: true, insightsSection: true, settingsSection: true,
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const loadProjects = useCallback(async () => {
    try {
      const response = await fetch("/api/downloads");
      if (!response.ok) throw new Error("Could not load local projects");
      const data = await response.json();
      setFiles(data.files ?? []);
      setError(null);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not load local projects");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProjects();
    window.addEventListener("downloads-changed", loadProjects);
    window.addEventListener("focus", loadProjects);
    return () => {
      window.removeEventListener("downloads-changed", loadProjects);
      window.removeEventListener("focus", loadProjects);
    };
  }, [loadProjects, pathname]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const removeProject = async (file: DownloadEntry) => {
    if (!confirm(`Delete "${file.displayName}" and its local project files?`)) return;
    setDeleting(file.name);
    try {
      const response = await fetch("/api/downloads", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not delete project");
      window.dispatchEvent(new Event("downloads-changed"));
      if (pathname.endsWith(`/${encodeURIComponent(file.name)}`)) {
        window.location.assign(projectStage(file) === "storyboarding" ? "/storyboards" : "/editing");
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not delete project");
    } finally {
      setDeleting(null);
    }
  };

  const closeMobile = () => setMobileOpen(false);
  const chain: string[] = [];
  let current = scans.find((scan) => scan.id === currentScanId);
  while (current && !chain.includes(current.id)) {
    chain.unshift(current.id);
    const parentId = current.parentScanId;
    current = scans.find((scan) => scan.id === parentId);
  }

  return (
    <>
      <button type="button" onClick={() => setMobileOpen(true)} aria-label="Open navigation" title="Open navigation"
        className="fixed left-3 top-3 z-40 flex size-10 items-center justify-center rounded-md border border-border bg-card md:hidden">
        <Menu className="size-5" />
      </button>
      {mobileOpen && <button aria-label="Close navigation" onClick={closeMobile} className="fixed inset-0 z-40 bg-black/30 md:hidden" />}
      <aside aria-label="Main navigation"
        className={`${mobileOpen ? "fixed inset-y-0 left-0 z-50 block" : "hidden"} w-56 shrink-0 border-r border-border bg-card md:sticky md:top-0 md:block md:h-screen`}>
        <nav className="h-full space-y-4 overflow-y-auto p-4" onClick={(event) => {
          if ((event.target as HTMLElement).closest("a")) closeMobile();
        }}>
          <button onClick={closeMobile} aria-label="Close navigation" title="Close navigation"
            className="ml-auto flex size-8 items-center justify-center md:hidden"><X className="size-4" /></button>

          <CollapsibleSection id="home" label="Home" open={open.homeSection}
            onToggle={() => setOpen((value) => ({ ...value, homeSection: !value.homeSection }))}>
            <NavLink href="/" pathname={pathname} icon={Home}>Start</NavLink>
          </CollapsibleSection>

          <CollapsibleSection id="create" label="Create" open={open.createSection}
            onToggle={() => setOpen((value) => ({ ...value, createSection: !value.createSection }))}>
            <NavLink href="/scan" pathname={pathname} icon={Search}>New scan</NavLink>
            <NavLink href="/iterate" pathname={pathname} icon={RotateCcw}>Iterate on a top video</NavLink>
            <NavLink href="/create-ad-hoc?origin=creator" pathname={pathname} icon={Sparkles}>Iterate creator content</NavLink>
            <NavLink href="/create-ad-hoc?origin=ad" pathname={pathname} icon={Megaphone}>Iterate ad content</NavLink>
            <NavLink href="/create-static-ad" pathname={pathname} icon={ImageIcon}>Create static ad</NavLink>
          </CollapsibleSection>

          <CollapsibleSection id="projects" label="Projects" open={open.projectsSection}
            onToggle={() => setOpen((value) => ({ ...value, projectsSection: !value.projectsSection }))}>
          <section>
            <button onClick={() => setOpen((value) => ({ ...value, scans: !value.scans }))}
              aria-expanded={open.scans} aria-controls="sidebar-scans" className="flex w-full items-center gap-2 text-left text-sm font-semibold">
              <ChevronRight className={`size-3.5 shrink-0 ${open.scans ? "rotate-90" : ""}`} />Scan History
            </button>
            {open.scans && chain.length > 0 && <p className="mt-1 break-words text-xs text-muted-foreground">
              {chain.map((id) => `Scan ${scans.findIndex((scan) => scan.id === id) + 1}`).join(" > ")}
            </p>}
            {open.scans && <div id="sidebar-scans" className="mt-3 max-h-64 space-y-1 overflow-y-auto">
              {scans.length === 0 && <p className="px-2 text-xs text-muted-foreground">No scans yet</p>}
              {scans.map((scan, index) => {
                const selected = scan.id === currentScanId;
                const seeds = [...scan.seeds.hashtags.slice(0, 1), ...scan.seeds.keywords.slice(0, 1), ...scan.seeds.competitors.slice(0, 1)].join(", ");
                return <div key={scan.id}>
                  <Link href={`/results?scan=${scan.id}`} aria-current={selected ? "page" : undefined}
                    className={`block rounded-md px-3 py-2 text-sm ${selected ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/50"}`}>
                    <div className="font-medium">Scan {index + 1}</div>
                    <div className="truncate text-xs" title={seeds}>{seeds || "No seeds"}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">{new Date(scan.timestamp).toLocaleTimeString()}</div>
                  </Link>
                  {selected && <button className="flex items-center gap-1 px-3 py-1 text-xs text-destructive"
                    onClick={() => { if (confirm("Delete this scan from history?")) deleteScan(scan.id); }}>
                    <Trash2 className="size-3" />Delete Scan
                  </button>}
                </div>;
              })}
            </div>}
          </section>

          {(["storyboarding", "editing"] as const).map((stage) => {
            const title = stage === "storyboarding" ? "Storyboarding" : "Editing";
            const entries = files.filter((file) => projectStage(file) === stage)
              .sort((a, b) => (b.lastEditedAt ?? b.modified) - (a.lastEditedAt ?? a.modified));
            const href = stage === "storyboarding" ? "/storyboards" : "/editing";
            return <section key={stage} className="space-y-2 pt-2">
              <div className="flex min-h-5 items-center gap-2">
                <button onClick={() => setOpen((value) => ({ ...value, [stage]: !value[stage] }))}
                  aria-expanded={open[stage]} aria-controls={`sidebar-${stage}`} aria-label={`Toggle ${title}`} title={`Toggle ${title}`}
                  className="flex size-5 shrink-0 items-center justify-center">
                  <ChevronRight className={`size-3.5 ${open[stage] ? "rotate-90" : ""}`} />
                </button>
                <Link href={href} className="flex min-w-0 flex-1 items-center gap-2 text-sm font-semibold">
                  {title}<span className="ml-auto min-w-5 rounded bg-muted px-1 text-center text-xs leading-5 tabular-nums">{entries.length}</span>
                </Link>
              </div>
              {open[stage] && <div id={`sidebar-${stage}`} className="max-h-48 space-y-1 overflow-y-auto">
                {loading ? <p className="px-2 text-xs text-muted-foreground">Loading...</p>
                  : entries.length === 0 ? <p className="px-2 py-1 text-xs text-muted-foreground">No {stage === "storyboarding" ? "storyboards" : "editing projects"} yet</p>
                  : entries.map((file) => {
                    const selected = pathname.endsWith(`/${encodeURIComponent(file.name)}`);
                    return <div key={file.name} className={`group flex min-h-11 items-center gap-1 rounded px-2 py-1.5 ${selected ? "bg-muted" : "hover:bg-muted/50"}`}>
                      <Link href={projectHref(file)} aria-current={selected ? "page" : undefined} className="min-w-0 flex-1 text-xs" title={file.displayName}>
                        <div className="truncate">{file.displayName}</div>
                        <div className="mt-0.5 truncate text-muted-foreground">{stage === "storyboarding" ? "Storyboarding File" : file.name}</div>
                      </Link>
                      <button onClick={() => removeProject(file)} disabled={deleting === file.name}
                        aria-label={`Delete ${file.displayName}`} title="Delete project"
                        className="flex size-6 shrink-0 items-center justify-center text-muted-foreground hover:text-destructive focus:opacity-100 md:opacity-0 md:group-hover:opacity-100 disabled:opacity-50">
                        <X className="size-3" />
                      </button>
                    </div>;
                  })}
              </div>}
            </section>;
          })}

          {error && <div role="alert" className="space-y-2 text-xs text-destructive">
            <p className="break-words">{error}</p>
            <button onClick={loadProjects} className="flex items-center gap-1"><RotateCcw className="size-3" />Retry</button>
          </div>}
          </CollapsibleSection>

          <CollapsibleSection id="weekly-digest" label="Weekly Digest" open={open.weeklyDigestSection}
            onToggle={() => setOpen((value) => ({ ...value, weeklyDigestSection: !value.weeklyDigestSection }))}>
            <NavLink href="/weekly-ads" pathname={pathname} icon={CalendarClock}>Weekly ads</NavLink>
            <NavLink href="/weekly-static-ads" pathname={pathname} icon={ImageIcon}>Weekly static ads</NavLink>
            <NavLink href="/weekly-content" pathname={pathname} icon={Newspaper}>Weekly content</NavLink>
            <NavLink href="/weekly-creators" pathname={pathname} icon={Users}>Weekly creators</NavLink>
            <NavLink href="/weekly-trending-content" pathname={pathname} icon={TrendingUp}>Weekly trending content</NavLink>
            <NavLink href="/weekly-hashtag-search" pathname={pathname} icon={Hash}>Search by hashtag</NavLink>
          </CollapsibleSection>

          <CollapsibleSection id="insights" label="Insights" open={open.insightsSection}
            onToggle={() => setOpen((value) => ({ ...value, insightsSection: !value.insightsSection }))}>
            <NavLink href="/content-history" pathname={pathname} icon={FileClock}>Content history</NavLink>
            <div className="flex min-h-7 items-center gap-2">
              <button onClick={() => setOpen((value) => ({ ...value, analytics: !value.analytics }))}
                aria-expanded={open.analytics} aria-controls="sidebar-analytics" aria-label="Toggle Analytics" title="Toggle Analytics"
                className="flex size-5 shrink-0 items-center justify-center">
                <ChevronRight className={`size-3.5 ${open.analytics ? "rotate-90" : ""}`} />
              </button>
              <Link href="/analytics" aria-current={pathname === "/analytics" ? "page" : undefined}
                className={`flex min-w-0 flex-1 items-center gap-2 text-sm font-semibold ${pathname === "/analytics" ? "text-primary" : ""}`}>
                <BarChart3 className="size-4 shrink-0" />Analytics
              </Link>
            </div>
            {open.analytics && (
              <div id="sidebar-analytics" className="ml-5 space-y-1">
                {ANALYTICS_CHANNELS.map((channel) => (
                  <Link key={channel.id} href={`/analytics/${channel.id}`}
                    className={`${navClass} text-xs`}>
                    {channel.label}
                    {!channel.connected && <span className="ml-auto text-muted-foreground/60">·</span>}
                  </Link>
                ))}
              </div>
            )}
            <div className="flex min-h-7 items-center gap-2">
              <button onClick={() => setOpen((value) => ({ ...value, adInsights: !value.adInsights }))}
                aria-expanded={open.adInsights} aria-controls="sidebar-ad-insights" aria-label="Toggle Ad Insights" title="Toggle Ad Insights"
                className="flex size-5 shrink-0 items-center justify-center">
                <ChevronRight className={`size-3.5 ${open.adInsights ? "rotate-90" : ""}`} />
              </button>
              <Link href="/ad-insights" aria-current={pathname === "/ad-insights" ? "page" : undefined}
                className={`flex min-w-0 flex-1 items-center gap-2 text-sm font-semibold ${pathname === "/ad-insights" ? "text-primary" : ""}`}>
                <Megaphone className="size-4 shrink-0" />Ad Insights
              </Link>
            </div>
            {open.adInsights && (
              <div id="sidebar-ad-insights" className="ml-5 space-y-1">
                {ANALYTICS_CHANNELS.map((channel) => (
                  <Link key={channel.id} href={`/ad-insights/${channel.id}`}
                    className={`${navClass} text-xs`}>
                    {channel.label}
                  </Link>
                ))}
              </div>
            )}
            <div className="flex min-h-7 items-center gap-2">
              <button onClick={() => setOpen((value) => ({ ...value, contentInsights: !value.contentInsights }))}
                aria-expanded={open.contentInsights} aria-controls="sidebar-content-insights" aria-label="Toggle Content Insights" title="Toggle Content Insights"
                className="flex size-5 shrink-0 items-center justify-center">
                <ChevronRight className={`size-3.5 ${open.contentInsights ? "rotate-90" : ""}`} />
              </button>
              <Link href="/content-insights" aria-current={pathname === "/content-insights" ? "page" : undefined}
                className={`flex min-w-0 flex-1 items-center gap-2 text-sm font-semibold ${pathname === "/content-insights" ? "text-primary" : ""}`}>
                <Newspaper className="size-4 shrink-0" />Content Insights
              </Link>
            </div>
            {open.contentInsights && (
              <div id="sidebar-content-insights" className="ml-5 space-y-1">
                {ANALYTICS_CHANNELS.map((channel) => (
                  <Link key={channel.id} href={`/content-insights/${channel.id}`}
                    className={`${navClass} text-xs`}>
                    {channel.label}
                  </Link>
                ))}
              </div>
            )}
            <div className="flex min-h-7 items-center gap-2">
              <button onClick={() => setOpen((value) => ({ ...value, creatorInsights: !value.creatorInsights }))}
                aria-expanded={open.creatorInsights} aria-controls="sidebar-creator-insights" aria-label="Toggle Creator Insights" title="Toggle Creator Insights"
                className="flex size-5 shrink-0 items-center justify-center">
                <ChevronRight className={`size-3.5 ${open.creatorInsights ? "rotate-90" : ""}`} />
              </button>
              <Link href="/creator-insights" aria-current={pathname === "/creator-insights" ? "page" : undefined}
                className={`flex min-w-0 flex-1 items-center gap-2 text-sm font-semibold ${pathname === "/creator-insights" ? "text-primary" : ""}`}>
                <Users className="size-4 shrink-0" />Creator Insights
              </Link>
            </div>
            {open.creatorInsights && (
              <div id="sidebar-creator-insights" className="ml-5 space-y-1">
                {ANALYTICS_CHANNELS.map((channel) => (
                  <Link key={channel.id} href={`/creator-insights/${channel.id}`}
                    className={`${navClass} text-xs`}>
                    {channel.label}
                  </Link>
                ))}
              </div>
            )}
            <NavLink href="/benchmarks" pathname={pathname} icon={ClipboardCheck}>Benchmarks</NavLink>
          </CollapsibleSection>

          <CollapsibleSection id="library" label="Library" open={open.librarySection}
            onToggle={() => setOpen((value) => ({ ...value, librarySection: !value.librarySection }))}>
            <NavLink href="/library" pathname={pathname} icon={Film}>Clip library</NavLink>
          </CollapsibleSection>

          <CollapsibleSection id="settings" label="Settings" open={open.settingsSection}
            onToggle={() => setOpen((value) => ({ ...value, settingsSection: !value.settingsSection }))}>
            <NavLink href="/settings" pathname={pathname} icon={Settings2}>Overview</NavLink>
            <NavLink href="/settings/agents" pathname={pathname} icon={SlidersHorizontal}>Agents</NavLink>
            <NavLink href="/settings/competitors" pathname={pathname} icon={Megaphone}>Competitors</NavLink>
            <NavLink href="/settings/brand-assets" pathname={pathname} icon={Palette}>Brand assets</NavLink>
            <NavLink href="/settings/product-images" pathname={pathname} icon={ImageIcon}>Product images</NavLink>
            <NavLink href="/settings/actor-images" pathname={pathname} icon={ImageIcon}>Actor images</NavLink>
            <NavLink href="/settings/agent-kit" pathname={pathname} icon={Plug}>Agent kit</NavLink>
          </CollapsibleSection>
        </nav>
      </aside>
    </>
  );
}
