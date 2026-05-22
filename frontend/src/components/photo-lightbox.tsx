"use client";
import * as React from "react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type LightboxPhoto = {
  id: string;
  url: string;
  uploaderName?: string;
  comment?: string;
};

export function PhotoLightbox({
  photos,
  initialIndex,
  open,
  onClose,
}: {
  photos: LightboxPhoto[];
  initialIndex: number;
  open: boolean;
  onClose: () => void;
}) {
  const trackRef = React.useRef<HTMLDivElement>(null);
  const [index, setIndex] = React.useState(initialIndex);

  // Scroll to active photo when opened or initialIndex changes.
  React.useEffect(() => {
    if (!open) return;
    setIndex(initialIndex);
    requestAnimationFrame(() => {
      const el = trackRef.current?.children[initialIndex] as
        | HTMLElement
        | undefined;
      el?.scrollIntoView({ behavior: "instant" as ScrollBehavior, inline: "center", block: "nearest" });
    });
  }, [open, initialIndex]);

  // Detect current index from scroll position.
  const onScroll = () => {
    const track = trackRef.current;
    if (!track) return;
    const slideWidth = track.clientWidth;
    const next = Math.round(track.scrollLeft / slideWidth);
    if (next !== index) setIndex(next);
  };

  const goto = (i: number) => {
    const track = trackRef.current;
    if (!track) return;
    const clamped = Math.max(0, Math.min(photos.length - 1, i));
    const slide = track.children[clamped] as HTMLElement | undefined;
    slide?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  };

  // Keyboard nav
  React.useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") goto(index + 1);
      if (e.key === "ArrowLeft") goto(index - 1);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, index, photos.length, onClose]);

  if (!open || photos.length === 0) return null;
  const current = photos[index];

  return (
    <div
      className="fixed inset-0 z-[80] bg-black/85 backdrop-blur-sm flex flex-col"
      role="dialog"
      aria-modal="true"
    >
      <div className="flex items-center justify-between px-4 py-3 text-white">
        <div className="text-xs sm:text-sm">
          {index + 1} / {photos.length}
          {current?.uploaderName && (
            <span className="ml-2 opacity-80">por {current.uploaderName}</span>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="text-white hover:bg-white/10"
          onClick={onClose}
          aria-label="Fechar"
        >
          <X className="h-5 w-5" />
        </Button>
      </div>

      <div className="relative flex-1 min-h-0">
        <button
          type="button"
          onClick={() => goto(index - 1)}
          disabled={index === 0}
          className={cn(
            "hidden md:grid absolute left-3 top-1/2 -translate-y-1/2 z-10 h-11 w-11 place-items-center rounded-full bg-white/10 hover:bg-white/20 text-white transition",
            index === 0 && "opacity-30 cursor-not-allowed",
          )}
          aria-label="Anterior"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
        <button
          type="button"
          onClick={() => goto(index + 1)}
          disabled={index === photos.length - 1}
          className={cn(
            "hidden md:grid absolute right-3 top-1/2 -translate-y-1/2 z-10 h-11 w-11 place-items-center rounded-full bg-white/10 hover:bg-white/20 text-white transition",
            index === photos.length - 1 && "opacity-30 cursor-not-allowed",
          )}
          aria-label="Próxima"
        >
          <ChevronRight className="h-6 w-6" />
        </button>

        <div
          ref={trackRef}
          onScroll={onScroll}
          className="h-full w-full flex overflow-x-auto scrollbar-none snap-x-mandatory overscroll-x-contain"
          style={{ scrollBehavior: "smooth" }}
        >
          {photos.map((p) => (
            <div
              key={p.id}
              className="snap-center shrink-0 w-full h-full grid place-items-center p-3 sm:p-6"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.url}
                alt={p.comment || "photo"}
                draggable={false}
                className="max-h-[80vh] max-w-full object-contain rounded-lg shadow-2xl select-none"
              />
            </div>
          ))}
        </div>
      </div>

      {current?.comment && (
        <div className="text-white/85 text-sm text-center px-6 pb-4 pt-2">
          {current.comment}
        </div>
      )}

      <div className="flex justify-center gap-1.5 pb-4">
        {photos.map((_, i) => (
          <button
            key={i}
            onClick={() => goto(i)}
            aria-label={`Ir para foto ${i + 1}`}
            className={cn(
              "h-1.5 rounded-full transition-all",
              i === index ? "w-6 bg-white" : "w-1.5 bg-white/40 hover:bg-white/60",
            )}
          />
        ))}
      </div>
    </div>
  );
}
