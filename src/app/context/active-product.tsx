"use client";

import React, { createContext, useContext, useState, useCallback } from "react";
import type { PublicProductLine } from "@/lib/product-lines";

interface ActiveProductValue {
  activeId: string;
  options: PublicProductLine[];
  setActiveId: (id: string) => void;
}

const ActiveProductContext = createContext<ActiveProductValue | undefined>(undefined);

// The root layout (a server component) resolves the active product line
// from the request cookie and hands the browser-safe subset down here.
export function ActiveProductProvider({
  active,
  options,
  children,
}: {
  active: string;
  options: PublicProductLine[];
  children: React.ReactNode;
}) {
  const [activeId, setActiveId] = useState(active);

  return (
    <ActiveProductContext.Provider value={{ activeId, options, setActiveId }}>
      {children}
    </ActiveProductContext.Provider>
  );
}

export function useActiveProduct(): ActiveProductValue {
  const context = useContext(ActiveProductContext);
  if (context === undefined) {
    throw new Error("useActiveProduct must be used within ActiveProductProvider");
  }
  return context;
}

// Posts the new selection to the server (sets the cookie) and updates local
// state immediately so the sidebar reflects the change without a full reload.
export function useSwitchActiveProduct() {
  const { setActiveId } = useActiveProduct();
  return useCallback(
    async (productLineId: string) => {
      const res = await fetch("/api/product-line", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productLineId }),
      });
      if (!res.ok) return false;
      setActiveId(productLineId);
      return true;
    },
    [setActiveId]
  );
}
