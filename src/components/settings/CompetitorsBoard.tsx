"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { Plus, RotateCcw, Save, Trash2, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ACCOUNT_TYPES,
  COMPETITOR_CATEGORY_IDS,
  COMPETITOR_REGIONS,
  TIKTOK_STATUSES,
  type AccountType,
  type CompetitorAccount,
  type CompetitorAccountInput,
  type CompetitorCategoryId,
  type CompetitorRegion,
  type TikTokStatus,
} from "@/lib/competitor-schema";
import { useActiveProduct } from "@/app/context/active-product";

const CATEGORY_LABELS: Record<CompetitorCategoryId, string> = {
  glasses: "Glasses",
  screen_protectors: "Screen protectors",
  privacy_filters: "Privacy filters",
  supplements: "Supplements",
  bulbs: "Bulbs",
  red_light_therapy: "Red light therapy",
};

const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  brand: "Brand",
  creator: "Creator / affiliate",
};

const STATUS_LABELS: Record<TikTokStatus, string> = {
  confirmed: "Scan-ready",
  present_unconfirmed: "Unconfirmed handle",
  not_found: "No TikTok found",
};

const STATUS_COLORS: Record<TikTokStatus, string> = {
  confirmed: "bg-emerald-500/15 text-emerald-600",
  present_unconfirmed: "bg-amber-500/15 text-amber-600",
  not_found: "bg-muted text-muted-foreground",
};

const EMPTY_FORM: CompetitorAccountInput = {
  name: "",
  accountType: "brand",
  region: "uk",
  website: null,
  instagramHandle: null,
  instagramFollowers: null,
  facebookHandle: null,
  facebookFollowers: null,
  tiktokHandle: null,
  tiktokStatus: "not_found",
  positioning: null,
  crossCategoryFlag: false,
  notes: null,
  categories: [],
  productLineIds: [],
};

function AccountForm({
  id,
  initial,
  onCancel,
  onSaved,
}: {
  id?: string;
  initial: CompetitorAccountInput;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const { options: productLineOptions } = useActiveProduct();
  const [form, setForm] = useState<CompetitorAccountInput>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(id ? `/api/competitors/${id}` : "/api/competitors", {
        method: id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save competitor");
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save competitor");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 rounded-lg border border-border bg-muted/20 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Name</span>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
            placeholder="Brand name"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Region</span>
          <select
            value={form.region}
            onChange={(e) => setForm({ ...form, region: e.target.value as CompetitorRegion })}
            className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
          >
            {COMPETITOR_REGIONS.map((r) => (
              <option key={r} value={r}>{r.toUpperCase()}</option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">
            Account type
          </span>
          <select
            value={form.accountType}
            onChange={(e) => setForm({ ...form, accountType: e.target.value as AccountType })}
            className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
          >
            {ACCOUNT_TYPES.map((t) => (
              <option key={t} value={t}>{ACCOUNT_TYPE_LABELS[t]}</option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Website</span>
          <input
            value={form.website ?? ""}
            onChange={(e) => setForm({ ...form, website: e.target.value || null })}
            className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
            placeholder="https://..."
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">TikTok handle</span>
          <input
            value={form.tiktokHandle ?? ""}
            onChange={(e) => setForm({ ...form, tiktokHandle: e.target.value || null })}
            className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
            placeholder="handle (no @)"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">TikTok status</span>
          <select
            value={form.tiktokStatus}
            onChange={(e) => setForm({ ...form, tiktokStatus: e.target.value as TikTokStatus })}
            className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
          >
            {TIKTOK_STATUSES.map((s) => (
              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Instagram followers</span>
          <input
            type="number"
            value={form.instagramFollowers ?? ""}
            onChange={(e) => setForm({ ...form, instagramFollowers: e.target.value ? Number(e.target.value) : null })}
            className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
          />
        </label>
      </div>

      <label className="block text-sm">
        <span className="mb-1 block text-xs font-medium text-muted-foreground">Positioning / value proposition</span>
        <textarea
          value={form.positioning ?? ""}
          onChange={(e) => setForm({ ...form, positioning: e.target.value || null })}
          rows={2}
          className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
        />
      </label>

      <div>
        <span className="mb-1.5 block text-xs font-medium text-muted-foreground">Categories</span>
        <div className="flex flex-wrap gap-3">
          {COMPETITOR_CATEGORY_IDS.map((cat) => (
            <label key={cat} className="flex items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                checked={form.categories.includes(cat)}
                onChange={(e) =>
                  setForm({
                    ...form,
                    categories: e.target.checked
                      ? [...form.categories, cat]
                      : form.categories.filter((c) => c !== cat),
                  })
                }
                className="size-4 rounded border-input accent-primary"
              />
              {CATEGORY_LABELS[cat]}
            </label>
          ))}
        </div>
      </div>

      <div>
        <span className="mb-1.5 block text-xs font-medium text-muted-foreground">Product lines</span>
        <div className="flex flex-wrap gap-3">
          {productLineOptions.map((p) => (
            <label key={p.id} className="flex items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                checked={form.productLineIds.includes(p.id)}
                onChange={(e) =>
                  setForm({
                    ...form,
                    productLineIds: e.target.checked
                      ? [...form.productLineIds, p.id]
                      : form.productLineIds.filter((id) => id !== p.id),
                  })
                }
                className="size-4 rounded border-input accent-primary"
              />
              {p.label}
            </label>
          ))}
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={form.crossCategoryFlag}
          onChange={(e) => setForm({ ...form, crossCategoryFlag: e.target.checked })}
          className="size-4 rounded border-input accent-primary"
        />
        Cross-category competitor (spans unrelated product categories)
      </label>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-2">
        <Button onClick={save} disabled={saving || !form.name.trim()} size="sm">
          <Save className="size-4" aria-hidden="true" />
          {saving ? "Saving..." : "Save"}
        </Button>
        <Button onClick={onCancel} variant="outline" size="sm">Cancel</Button>
      </div>
    </div>
  );
}

export function CompetitorsBoard() {
  const [accounts, setAccounts] = useState<CompetitorAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [regionFilter, setRegionFilter] = useState<CompetitorRegion | "">("");
  const [categoryFilter, setCategoryFilter] = useState<CompetitorCategoryId | "">("");
  const [accountTypeFilter, setAccountTypeFilter] = useState<AccountType | "">("");
  const [scanReadyOnly, setScanReadyOnly] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (regionFilter) params.set("region", regionFilter);
      if (categoryFilter) params.set("category", categoryFilter);
      if (accountTypeFilter) params.set("accountType", accountTypeFilter);
      if (scanReadyOnly) params.set("scanReady", "true");
      const res = await fetch(`/api/competitors?${params.toString()}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load competitors");
      setAccounts(data.accounts);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load competitors");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regionFilter, categoryFilter, accountTypeFilter, scanReadyOnly]);

  const remove = async (id: string) => {
    if (!confirm("Remove this competitor from your saved accounts?")) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/competitors/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Could not delete competitor");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete competitor");
    } finally {
      setDeletingId(null);
    }
  };

  const scanReadyCount = useMemo(() => accounts.filter((a) => a.tiktokStatus === "confirmed").length, [accounts]);

  return (
    <section aria-labelledby="saved-accounts" className="rounded-lg border border-border bg-card">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border p-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Users className="size-4" aria-hidden="true" />
            Saved accounts
          </div>
          <h2 id="saved-accounts" className="text-lg font-semibold">Competitor / reference accounts</h2>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            {accounts.length} accounts loaded{regionFilter || categoryFilter || scanReadyOnly ? " (filtered)" : ""} · {scanReadyCount} scan-ready in this view.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={load} disabled={loading} variant="outline" size="sm">
            <RotateCcw className="size-4" aria-hidden="true" />
            Refresh
          </Button>
          <Button onClick={() => setAdding(true)} size="sm">
            <Plus className="size-4" aria-hidden="true" />
            Add competitor
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-b border-border bg-muted/20 px-5 py-3">
        <select
          value={regionFilter}
          onChange={(e) => setRegionFilter(e.target.value as CompetitorRegion | "")}
          className="h-8 rounded-md border border-input bg-background px-2 text-sm"
        >
          <option value="">All regions</option>
          {COMPETITOR_REGIONS.map((r) => (
            <option key={r} value={r}>{r.toUpperCase()}</option>
          ))}
        </select>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value as CompetitorCategoryId | "")}
          className="h-8 rounded-md border border-input bg-background px-2 text-sm"
        >
          <option value="">All categories</option>
          {COMPETITOR_CATEGORY_IDS.map((c) => (
            <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
          ))}
        </select>
        <select
          value={accountTypeFilter}
          onChange={(e) => setAccountTypeFilter(e.target.value as AccountType | "")}
          className="h-8 rounded-md border border-input bg-background px-2 text-sm"
        >
          <option value="">Brands + creators</option>
          {ACCOUNT_TYPES.map((t) => (
            <option key={t} value={t}>{ACCOUNT_TYPE_LABELS[t]}</option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-sm">
          <input
            type="checkbox"
            checked={scanReadyOnly}
            onChange={(e) => setScanReadyOnly(e.target.checked)}
            className="size-4 rounded border-input accent-primary"
          />
          Scan-ready only
        </label>
      </div>

      {error && <div className="border-b border-border px-5 py-3 text-sm text-destructive">{error}</div>}

      {adding && (
        <div className="border-b border-border p-5">
          <AccountForm
            initial={EMPTY_FORM}
            onCancel={() => setAdding(false)}
            onSaved={() => {
              setAdding(false);
              load();
            }}
          />
        </div>
      )}

      <div className="max-h-[32rem] overflow-y-auto">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="sticky top-0 border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-5 py-2.5 font-semibold">Name</th>
              <th className="px-5 py-2.5 font-semibold">Region</th>
              <th className="px-5 py-2.5 font-semibold">Categories</th>
              <th className="px-5 py-2.5 font-semibold">TikTok</th>
              <th className="px-5 py-2.5 font-semibold">IG followers</th>
              <th className="px-5 py-2.5 font-semibold"></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={6} className="px-5 py-6 text-center text-muted-foreground">Loading...</td></tr>
            )}
            {!loading && accounts.length === 0 && (
              <tr><td colSpan={6} className="px-5 py-6 text-center text-muted-foreground">No accounts match these filters.</td></tr>
            )}
            {accounts.map((account) => (
              <Fragment key={account.id}>
                <tr className="border-b border-border last:border-0">
                  <td className="px-5 py-3 align-top">
                    <div className="font-medium text-foreground">
                      {account.name}
                      {account.accountType === "creator" && (
                        <span className="ml-1.5 rounded-full bg-violet-500/15 px-1.5 py-0.5 text-[10px] font-medium text-violet-600 dark:text-violet-400">creator</span>
                      )}
                      {account.crossCategoryFlag && (
                        <span className="ml-1.5 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">cross-category</span>
                      )}
                    </div>
                    {account.positioning && (
                      <div className="mt-0.5 max-w-sm truncate text-xs text-muted-foreground" title={account.positioning}>
                        {account.positioning}
                      </div>
                    )}
                  </td>
                  <td className="px-5 py-3 align-top uppercase text-muted-foreground">{account.region}</td>
                  <td className="px-5 py-3 align-top">
                    <div className="flex flex-wrap gap-1">
                      {account.categories.map((c) => (
                        <span key={c} className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                          {CATEGORY_LABELS[c]}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-5 py-3 align-top">
                    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${STATUS_COLORS[account.tiktokStatus]}`}>
                      {STATUS_LABELS[account.tiktokStatus]}
                    </span>
                    {account.tiktokHandle && (
                      <div className="mt-0.5 text-xs text-muted-foreground">@{account.tiktokHandle}</div>
                    )}
                  </td>
                  <td className="px-5 py-3 align-top text-muted-foreground">
                    {account.instagramFollowers ? account.instagramFollowers.toLocaleString() : "—"}
                  </td>
                  <td className="px-5 py-3 align-top text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        onClick={() => setEditingId(editingId === account.id ? null : account.id)}
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Edit"
                      >
                        {editingId === account.id ? <X className="size-3.5" /> : <Plus className="size-3.5 rotate-45" />}
                      </Button>
                      <Button
                        onClick={() => remove(account.id)}
                        disabled={deletingId === account.id}
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Delete"
                        className="text-destructive"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
                {editingId === account.id && (
                  <tr key={`${account.id}-edit`} className="border-b border-border">
                    <td colSpan={6} className="p-4">
                      <AccountForm
                        id={account.id}
                        initial={{
                          name: account.name,
                          accountType: account.accountType,
                          region: account.region,
                          website: account.website,
                          instagramHandle: account.instagramHandle,
                          instagramFollowers: account.instagramFollowers,
                          facebookHandle: account.facebookHandle,
                          facebookFollowers: account.facebookFollowers,
                          tiktokHandle: account.tiktokHandle,
                          tiktokStatus: account.tiktokStatus,
                          positioning: account.positioning,
                          crossCategoryFlag: account.crossCategoryFlag,
                          notes: account.notes,
                          categories: account.categories,
                          productLineIds: account.productLineIds,
                        }}
                        onCancel={() => setEditingId(null)}
                        onSaved={() => {
                          setEditingId(null);
                          load();
                        }}
                      />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
