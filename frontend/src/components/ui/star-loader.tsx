"use client";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export function StarLoader({
  label,
  fullScreen = true,
  className,
}: {
  label?: string;
  fullScreen?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid place-items-center w-full",
        fullScreen ? "min-h-[60vh]" : "py-12",
        className,
      )}
    >
      <div className="flex flex-col items-center gap-3">
        <div className="relative h-16 w-16">
          <div className="absolute inset-0 rounded-full bg-gradient-to-br from-pastel-lavender via-pastel-blush to-pastel-peach blur-md opacity-70 animate-ping" />
          <div className="absolute inset-0 rounded-full bg-gradient-to-br from-pastel-lavender via-pastel-blush to-pastel-peach grid place-items-center shadow-lg star-spin">
            <Sparkles className="h-8 w-8 text-white drop-shadow" />
          </div>
        </div>
        {label && (
          <div className="text-sm text-muted-foreground tracking-wide">
            {label}
          </div>
        )}
      </div>
    </div>
  );
}
