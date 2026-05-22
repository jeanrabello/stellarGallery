"use client";
import * as React from "react";
import { cn } from "@/lib/utils";

export function Tooltip({
  label,
  children,
  side = "top",
  className,
}: {
  label: string;
  children: React.ReactNode;
  side?: "top" | "bottom";
  className?: string;
}) {
  return (
    <span className={cn("relative inline-flex group/tt", className)}>
      {children}
      <span
        role="tooltip"
        className={cn(
          "pointer-events-none absolute left-1/2 -translate-x-1/2 z-20 whitespace-nowrap",
          "rounded-md bg-foreground text-background text-[11px] px-2 py-1 shadow-md",
          "opacity-0 group-hover/tt:opacity-100 group-focus-within/tt:opacity-100",
          "transition-opacity duration-150",
          side === "top" ? "bottom-[calc(100%+6px)]" : "top-[calc(100%+6px)]",
        )}
      >
        {label}
      </span>
    </span>
  );
}
