"use client";

// Shared pill/chip product-line picker — same "click a visible option
// instead of opening a hidden <select>" pattern as Search by Hashtag's
// preset picker, applied to product lines (a flat list, so no category
// level is needed here).
export interface ProductLinePickerOption {
  id: string;
  label: string;
  count?: number;
}

export function ProductLinePicker({
  options,
  value,
  onChange,
}: {
  options: ProductLinePickerOption[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((p) => {
        const active = p.id === value;
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onChange(p.id)}
            className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors ${
              active
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-foreground hover:bg-muted"
            }`}
          >
            {p.label}
            {p.count != null && (
              <span className={active ? "opacity-80" : "text-muted-foreground"}> ({p.count})</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
