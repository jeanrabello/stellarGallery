"use client";
import * as React from "react";
import { cn } from "@/lib/utils";

type ToastItem = {
  id: number;
  title?: string;
  description?: string;
  variant?: "default" | "destructive";
};

type Ctx = {
  toast: (t: Omit<ToastItem, "id">) => void;
};

const ToastContext = React.createContext<Ctx | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<ToastItem[]>([]);
  const toast = React.useCallback((t: Omit<ToastItem, "id">) => {
    const id = Date.now() + Math.random();
    setItems((cur) => [...cur, { ...t, id }]);
    setTimeout(() => {
      setItems((cur) => cur.filter((x) => x.id !== id));
    }, 4200);
  }, []);
  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 w-[320px]">
        {items.map((t) => (
          <div
            key={t.id}
            className={cn(
              "rounded-xl border p-3 shadow-lg backdrop-blur bg-white/90",
              t.variant === "destructive"
                ? "border-destructive/40 bg-destructive/10"
                : "border-border",
            )}
          >
            {t.title && <div className="font-semibold text-sm">{t.title}</div>}
            {t.description && (
              <div className="text-xs text-muted-foreground mt-0.5">
                {t.description}
              </div>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
