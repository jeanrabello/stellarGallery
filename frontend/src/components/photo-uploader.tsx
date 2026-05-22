"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Upload, ImagePlus, X, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Status = "idle" | "uploading" | "done" | "error";

type Item = {
  id: string;
  file: File;
  previewUrl: string;
  comment: string;
  status: Status;
  error?: string;
};

export function PhotoUploader({
  onUpload,
  triggerLabel = "Enviar fotos",
}: {
  onUpload: (payload: { file: File; comment: string }) => Promise<unknown>;
  triggerLabel?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [items, setItems] = React.useState<Item[]>([]);
  const [isDragging, setIsDragging] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const addFiles = (files: FileList | File[]) => {
    const next: Item[] = [];
    Array.from(files).forEach((file) => {
      if (!file.type.startsWith("image/")) return;
      next.push({
        id: `${file.name}-${file.size}-${Date.now()}-${Math.random()}`,
        file,
        previewUrl: URL.createObjectURL(file),
        comment: "",
        status: "idle",
      });
    });
    if (next.length) setItems((cur) => [...cur, ...next]);
  };

  const removeItem = (id: string) => {
    setItems((cur) => {
      const it = cur.find((c) => c.id === id);
      if (it) URL.revokeObjectURL(it.previewUrl);
      return cur.filter((c) => c.id !== id);
    });
  };

  const reset = () => {
    items.forEach((i) => URL.revokeObjectURL(i.previewUrl));
    setItems([]);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
  };

  const sendAll = async () => {
    if (!items.length) return;
    setBusy(true);
    for (const it of items) {
      if (it.status === "done") continue;
      setItems((cur) =>
        cur.map((c) => (c.id === it.id ? { ...c, status: "uploading" } : c)),
      );
      try {
        await onUpload({ file: it.file, comment: it.comment });
        setItems((cur) =>
          cur.map((c) => (c.id === it.id ? { ...c, status: "done" } : c)),
        );
      } catch (e: any) {
        setItems((cur) =>
          cur.map((c) =>
            c.id === it.id
              ? { ...c, status: "error", error: e?.message || "erro" }
              : c,
          ),
        );
      }
    }
    setBusy(false);
    if (items.every((i) => i.status !== "error")) {
      setTimeout(() => {
        setOpen(false);
        reset();
      }, 600);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button
          className="gap-2 bg-gradient-to-br from-pastel-lavender/90 via-primary/80 to-pastel-peach/90 text-primary-foreground hover:opacity-95 shadow-md"
          data-testid="open-uploader"
        >
          <Upload className="h-4 w-4" />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Enviar fotos</DialogTitle>
        </DialogHeader>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
          className={cn(
            "relative rounded-2xl border-2 border-dashed p-6 sm:p-8 text-center cursor-pointer transition-all",
            "bg-gradient-to-br from-pastel-blush/40 via-white/40 to-pastel-sky/40",
            isDragging
              ? "border-primary scale-[1.01] shadow-md"
              : "border-border hover:border-primary/60",
          )}
          data-testid="dropzone"
        >
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            tabIndex={-1}
            onChange={(e) => {
              if (e.target.files) addFiles(e.target.files);
              e.target.value = "";
            }}
            onClick={(e) => e.stopPropagation()}
          />
          <div className="flex flex-col items-center gap-2">
            <div className="h-12 w-12 rounded-2xl bg-white/80 shadow-sm grid place-items-center">
              <ImagePlus className="h-6 w-6 text-primary" />
            </div>
            <div className="font-medium text-sm">
              Arraste e solte ou{" "}
              <span className="underline underline-offset-4 text-primary">
                escolha do dispositivo
              </span>
            </div>
            <div className="text-xs text-muted-foreground">
              JPG, PNG, WEBP até 25MB cada · múltiplas fotos permitidas
            </div>
          </div>
        </div>

        {items.length > 0 && (
          <div className="max-h-[42vh] overflow-y-auto pr-1 -mr-1 space-y-3">
            {items.map((it) => (
              <div
                key={it.id}
                className="flex gap-3 rounded-xl border bg-white/70 p-2.5"
              >
                <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-pastel-blush/40">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={it.previewUrl}
                    alt={it.file.name}
                    className="h-full w-full object-cover"
                  />
                  {it.status === "uploading" && (
                    <div className="absolute inset-0 grid place-items-center bg-black/30">
                      <div className="h-5 w-5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                    </div>
                  )}
                  {it.status === "done" && (
                    <div className="absolute inset-0 grid place-items-center bg-emerald-500/40">
                      <CheckCircle2 className="h-6 w-6 text-white" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1 flex flex-col gap-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs font-medium truncate">
                      {it.file.name}
                    </div>
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-foreground p-1 rounded-md"
                      onClick={() => removeItem(it.id)}
                      disabled={it.status === "uploading"}
                      aria-label="Remover"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <Textarea
                    value={it.comment}
                    onChange={(e) =>
                      setItems((cur) =>
                        cur.map((c) =>
                          c.id === it.id
                            ? { ...c, comment: e.target.value }
                            : c,
                        ),
                      )
                    }
                    placeholder="Comentário opcional"
                    rows={2}
                    className="text-xs min-h-[44px]"
                  />
                  {it.status === "error" && (
                    <div className="text-[11px] text-destructive">
                      {it.error}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <DialogFooter className="gap-2">
          <DialogClose asChild>
            <Button variant="ghost" disabled={busy}>
              Cancelar
            </Button>
          </DialogClose>
          <Button onClick={sendAll} disabled={!items.length || busy}>
            {busy
              ? "Enviando…"
              : items.length > 1
                ? `Enviar ${items.length} fotos`
                : "Enviar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
