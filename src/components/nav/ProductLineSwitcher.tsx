"use client";

import { useActiveProduct, useSwitchActiveProduct } from "@/app/context/active-product";

export function ProductLineSwitcher() {
  const { activeId, options } = useActiveProduct();
  const switchProduct = useSwitchActiveProduct();

  return (
    <div className="space-y-1">
      <label htmlFor="active-product-line" className="text-xs font-medium text-muted-foreground">
        Active product
      </label>
      <select
        id="active-product-line"
        value={activeId}
        onChange={(event) => switchProduct(event.target.value)}
        className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      >
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
