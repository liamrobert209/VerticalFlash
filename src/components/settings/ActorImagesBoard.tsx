"use client";

import { useEffect, useState } from "react";
import { Trash2, Upload } from "lucide-react";
import { useActiveProduct } from "@/app/context/active-product";
import { Skeleton } from "@/components/ui/Skeleton";

interface ActorImageSlot {
  id: number;
  label: string;
  filename: string | null;
}

function SlotCard({
  productLineId,
  slot,
  onChanged,
}: {
  productLineId: string;
  slot: ActorImageSlot;
  onChanged: (slots: ActorImageSlot[]) => void;
}) {
  const [label, setLabel] = useState(slot.label);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setLabel(slot.label), [slot.label]);

  const saveLabel = async () => {
    if (label === slot.label) return;
    try {
      const res = await fetch(`/api/settings/actor-images/${productLineId}/${slot.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label }),
      });
      const data = await res.json();
      if (res.ok) onChanged(data.slots);
    } catch {
      // best-effort — the label field just keeps its local value
    }
  };

  const upload = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/settings/actor-images/${productLineId}/${slot.id}`, {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      onChanged(data.slots);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  const clear = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/settings/actor-images/${productLineId}/${slot.id}`, { method: "DELETE" });
      const data = await res.json();
      if (res.ok) onChanged(data.slots);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        onBlur={saveLabel}
        placeholder={`Image ${slot.id}`}
        className="rounded-md border border-input bg-background px-2 py-1 text-xs font-semibold"
      />
      <div className="group relative aspect-square overflow-hidden rounded-md border border-border bg-muted">
        {slot.filename ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/settings/actor-images/${productLineId}/${slot.id}?t=${slot.filename}`}
              alt={slot.label}
              className="size-full object-cover"
            />
            <button
              onClick={clear}
              disabled={busy}
              aria-label={`Remove ${slot.label}`}
              className="absolute right-1 top-1 flex size-6 items-center justify-center rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 disabled:opacity-50"
            >
              <Trash2 className="size-3.5" />
            </button>
          </>
        ) : (
          <label className="flex size-full cursor-pointer flex-col items-center justify-center gap-1 text-muted-foreground">
            <Upload className="size-5" />
            <span className="text-[10px]">Upload</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              disabled={busy}
              onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
            />
          </label>
        )}
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

export function ActorImagesBoard() {
  const { options: productLineOptions } = useActiveProduct();
  const [productLineId, setProductLineId] = useState(productLineOptions[0]?.id ?? "");
  const [slots, setSlots] = useState<ActorImageSlot[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async (id: string) => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/settings/actor-images?productLineId=${encodeURIComponent(id)}`, { cache: "no-store" });
      const data = await res.json();
      setSlots(data.slots ?? []);
    } catch {
      setSlots([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(productLineId);
  }, [productLineId]);

  return (
    <section aria-labelledby="actor-images" className="rounded-lg border border-border bg-card p-5 sm:p-7">
      <div>
        <h2 id="actor-images" className="text-lg font-semibold">Actor images</h2>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
          Real reference photos of a person, per product line — used when a competitor reference ad shows someone
          and generation swaps them in for our own person too, instead of keeping the competitor&apos;s actor. Scoped per
          product line so the right person shows up for whichever product the ad is actually for.
        </p>
      </div>

      <div className="mt-4">
        <select
          value={productLineId}
          onChange={(e) => setProductLineId(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
        >
          {productLineOptions.map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </select>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="aspect-square w-full" />)
        ) : (
          slots.map((slot) => (
            <SlotCard key={slot.id} productLineId={productLineId} slot={slot} onChanged={setSlots} />
          ))
        )}
      </div>
    </section>
  );
}
