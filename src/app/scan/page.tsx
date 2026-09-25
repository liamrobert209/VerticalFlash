"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { CompetitorAccount } from "@/lib/competitor-schema";

export default function ScanPage() {
  const router = useRouter();
  const [tiktokUrl, setTiktokUrl] = useState("");
  const [hashtags, setHashtags] = useState("");
  const [keywords, setKeywords] = useState("");
  const [competitors, setCompetitors] = useState("");
  const [millionViewsOnly, setMillionViewsOnly] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [savedAccounts, setSavedAccounts] = useState<CompetitorAccount[]>([]);
  const [savedSearch, setSavedSearch] = useState("");

  useEffect(() => {
    fetch("/api/competitors?scanReady=true")
      .then((res) => res.json())
      .then((data) => setSavedAccounts(data.accounts ?? []))
      .catch(() => {});
  }, []);

  // One field, one source of truth: typing a handle and checking a saved
  // account both just add/remove an "@handle" from the same comma-separated
  // string, instead of maintaining two separate pieces of state that get
  // merged together on submit.
  const selectedHandles = new Set(
    competitors.split(",").map((c) => c.trim().replace(/^@/, "").toLowerCase()).filter(Boolean)
  );

  const toggleSaved = (handle: string) => {
    const parts = competitors.split(",").map((c) => c.trim()).filter(Boolean);
    const isSelected = selectedHandles.has(handle.toLowerCase());
    const next = isSelected
      ? parts.filter((p) => p.replace(/^@/, "").toLowerCase() !== handle.toLowerCase())
      : [...parts, `@${handle}`];
    setCompetitors(next.join(", "));
  };

  const filteredSavedAccounts = savedAccounts.filter(
    (a) =>
      !savedSearch.trim() ||
      a.name.toLowerCase().includes(savedSearch.toLowerCase()) ||
      a.tiktokHandle?.toLowerCase().includes(savedSearch.toLowerCase())
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!hashtags.trim() && !keywords.trim() && !competitors.trim()) {
      return;
    }

    setIsSubmitting(true);

    const params = new URLSearchParams();
    if (tiktokUrl.trim()) params.set("tiktokUrl", tiktokUrl.trim());
    if (hashtags.trim()) params.set("hashtags", hashtags.trim());
    if (keywords.trim()) params.set("keywords", keywords.trim());
    if (competitors.trim()) params.set("competitors", competitors.trim());
    if (millionViewsOnly) params.set("minViews", "1000000");

    router.push(`/results?${params.toString()}`);
  };

  const hasInput = hashtags.trim() || keywords.trim() || competitors.trim();

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-8">
      <div className="w-full max-w-lg space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Find content for inspiration</h1>
          <p className="mt-2 text-muted-foreground">
            Scan hashtags, keywords, or specific company accounts to find
            their best-performing content — not to discover new companies
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="tiktok-url" className="text-sm font-medium">
              TikTok Profile URL{" "}
              <span className="text-muted-foreground">(optional)</span>
            </label>
            <input
              id="tiktok-url"
              type="url"
              placeholder="https://www.tiktok.com/@username"
              value={tiktokUrl}
              onChange={(e) => setTiktokUrl(e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="hashtags" className="text-sm font-medium">
              Seed Hashtags
            </label>
            <input
              id="hashtags"
              type="text"
              placeholder="#thriftfashion, #y2kfashion, #styletok"
              value={hashtags}
              onChange={(e) => setHashtags(e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="text-xs text-muted-foreground">
              Enter hashtags with # symbol, separated by commas
            </p>
          </div>

          <div className="space-y-2">
            <label htmlFor="keywords" className="text-sm font-medium">
              Seed Keywords
            </label>
            <input
              id="keywords"
              type="text"
              placeholder="thrift transformation, outfit ideas, vintage finds"
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="text-xs text-muted-foreground">
              Enter search keywords, separated by commas
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label htmlFor="competitors" className="text-sm font-medium">
                Company accounts
              </label>
              {selectedHandles.size > 0 && (
                <span className="text-xs text-muted-foreground">{selectedHandles.size} selected</span>
              )}
            </div>
            <input
              id="competitors"
              type="text"
              placeholder="@thriftqueen, @vintagestyle, @y2kvibes"
              value={competitors}
              onChange={(e) => setCompetitors(e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="text-xs text-muted-foreground">
              Type @handles separated by commas, or check any of your saved accounts below — both add to the same list.
            </p>

            {savedAccounts.length > 0 && (
              <div className="space-y-2 rounded-lg border border-border p-3">
                <input
                  type="text"
                  placeholder="Search saved accounts..."
                  value={savedSearch}
                  onChange={(e) => setSavedSearch(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <div className="max-h-40 space-y-1 overflow-y-auto">
                  {filteredSavedAccounts.map((account) => (
                    <label
                      key={account.id}
                      className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-xs hover:bg-muted/50"
                    >
                      <input
                        type="checkbox"
                        checked={selectedHandles.has(account.tiktokHandle!.toLowerCase())}
                        onChange={() => toggleSaved(account.tiktokHandle!)}
                        className="size-3.5 rounded border-input accent-primary"
                      />
                      <span className="font-medium">{account.name}</span>
                      <span className="text-muted-foreground">
                        @{account.tiktokHandle} · {account.region.toUpperCase()}
                      </span>
                    </label>
                  ))}
                  {filteredSavedAccounts.length === 0 && (
                    <p className="px-1.5 py-1 text-xs text-muted-foreground">No matches</p>
                  )}
                </div>
              </div>
            )}
          </div>

          <label
            htmlFor="million-views-only"
            className="flex cursor-pointer items-center gap-2 text-sm font-medium"
          >
            <input
              id="million-views-only"
              type="checkbox"
              checked={millionViewsOnly}
              onChange={(e) => setMillionViewsOnly(e.target.checked)}
              className="size-4 rounded border-input accent-primary"
            />
            Only include videos with 1M+ views
          </label>
          <p className="text-xs text-muted-foreground">
            Videos longer than 25 seconds are always excluded.
          </p>

          <Button
            type="submit"
            className="w-full"
            disabled={!hasInput || isSubmitting}
          >
            {isSubmitting ? (
              <span className="flex items-center gap-2">
                <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Finding content...
              </span>
            ) : (
              "Find inspiration"
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}
