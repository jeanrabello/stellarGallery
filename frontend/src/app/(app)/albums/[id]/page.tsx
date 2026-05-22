"use client";
import * as React from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { Trash2, Upload, Share2, Copy } from "lucide-react";
import { PhotoLightbox } from "@/components/photo-lightbox";
import { StarLoader } from "@/components/ui/star-loader";

type Photo = {
  id: string;
  url: string;
  uploaderName: string;
  comment?: string;
  contentType: string;
  createdAt: string;
};

type Album = {
  id: string;
  name: string;
  description?: string;
  ownerType: "user" | "group";
};

export default function AlbumPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: album, isLoading: albumLoading } = useQuery<Album>({
    queryKey: ["album", id],
    queryFn: () => api<Album>(`/albums/${id}`),
  });

  const { data: photos = [], isLoading: photosLoading } = useQuery<Photo[]>({
    queryKey: ["photos", id],
    queryFn: () => api<Photo[]>(`/photos/album/${id}`),
  });

  const upload = useMutation({
    mutationFn: async (payload: { file: File; comment: string }) => {
      const fd = new FormData();
      fd.append("albumId", id);
      fd.append("comment", payload.comment);
      fd.append("file", payload.file);
      return api("/photos/upload", { method: "POST", body: fd });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["photos", id] }),
  });

  const del = useMutation({
    mutationFn: (photoId: string) =>
      api(`/photos/${photoId}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["photos", id] }),
  });

  const createShare = useMutation({
    mutationFn: (name?: string) =>
      api<{ token: string; url: string }>("/share-tokens", {
        method: "POST",
        body: JSON.stringify({ albumId: id, name }),
      }),
  });

  const [openUpload, setOpenUpload] = React.useState(false);
  const [openShare, setOpenShare] = React.useState(false);
  const [file, setFile] = React.useState<File | null>(null);
  const [comment, setComment] = React.useState("");
  const [shareName, setShareName] = React.useState("");
  const [issued, setIssued] = React.useState<{
    token: string;
    url: string;
  } | null>(null);

  const [lightboxIndex, setLightboxIndex] = React.useState<number | null>(null);

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: "Copiado!" });
    } catch {
      toast({ title: "Falha ao copiar", variant: "destructive" });
    }
  };

  if (albumLoading) return <StarLoader label="Carregando álbum…" />;

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden">
        <div className="h-2 bg-gradient-to-r from-pastel-lavender via-pastel-blush to-pastel-peach" />
        <CardContent className="p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-xl sm:text-2xl font-semibold">
                {album?.name}
              </h1>
              {album?.description && (
                <p className="text-sm text-muted-foreground">
                  {album.description}
                </p>
              )}
              <div className="mt-1 text-xs text-muted-foreground">
                {album?.ownerType === "group"
                  ? "Álbum compartilhado de grupo"
                  : "Álbum privado"}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {album?.ownerType === "user" && (
                <Dialog open={openShare} onOpenChange={setOpenShare}>
                  <Button
                    variant="secondary"
                    onClick={() => setOpenShare(true)}
                  >
                    <Share2 className="h-4 w-4" />
                    Compartilhar via token
                  </Button>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>
                        Gerar credencial de compartilhamento
                      </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium">
                          Nome (opcional)
                        </label>
                        <Input
                          value={shareName}
                          onChange={(e) => setShareName(e.target.value)}
                          placeholder="ex: blog-de-viagens"
                        />
                      </div>
                      {issued && (
                        <div className="rounded-xl bg-pastel-sky/40 p-3 text-xs space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <code className="break-all">{issued.url}</code>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => copy(issued.url)}
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <code className="break-all">{issued.token}</code>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => copy(issued.token)}
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                          </div>
                          <p className="text-muted-foreground">
                            Use o header <code>x-share-token</code> ou o param
                            <code> ?token=</code> em GET na URL acima.
                          </p>
                        </div>
                      )}
                    </div>
                    <DialogFooter>
                      <DialogClose asChild>
                        <Button variant="ghost">Fechar</Button>
                      </DialogClose>
                      <Button
                        onClick={async () => {
                          try {
                            const r = await createShare.mutateAsync(
                              shareName || undefined,
                            );
                            setIssued({ token: r.token, url: r.url });
                            toast({ title: "Credencial gerada" });
                          } catch (e: any) {
                            toast({
                              title: "Erro",
                              description: e.message,
                              variant: "destructive",
                            });
                          }
                        }}
                      >
                        Gerar
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}

              <Dialog open={openUpload} onOpenChange={setOpenUpload}>
                <Button onClick={() => setOpenUpload(true)}>
                  <Upload className="h-4 w-4" />
                  Enviar foto
                </Button>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Enviar foto</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-3">
                    <Input
                      type="file"
                      accept="image/*"
                      onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                    />
                    <Textarea
                      placeholder="Comentário opcional"
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                    />
                  </div>
                  <DialogFooter>
                    <DialogClose asChild>
                      <Button variant="ghost">Cancelar</Button>
                    </DialogClose>
                    <Button
                      disabled={!file || upload.isPending}
                      onClick={async () => {
                        if (!file) return;
                        try {
                          await upload.mutateAsync({ file, comment });
                          setFile(null);
                          setComment("");
                          setOpenUpload(false);
                          toast({ title: "Foto enviada!" });
                        } catch (e: any) {
                          toast({
                            title: "Erro",
                            description: e.message,
                            variant: "destructive",
                          });
                        }
                      }}
                    >
                      Enviar
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </CardContent>
      </Card>

      {photosLoading ? (
        <StarLoader label="Carregando fotos…" fullScreen={false} />
      ) : photos.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-white/40 p-10 text-center">
          <div className="text-base font-medium">Álbum vazio</div>
          <div className="text-sm text-muted-foreground">
            Envie a primeira foto.
          </div>
        </div>
      ) : (
        <div className="grid gap-3 sm:gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {photos.map((p, i) => (
            <Card key={p.id} className="overflow-hidden group relative">
              <button
                type="button"
                onClick={() => setLightboxIndex(i)}
                className="block w-full aspect-square bg-pastel-blush/40 cursor-zoom-in"
                aria-label="Abrir foto"
                data-testid={`photo-thumb-${i}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.url}
                  alt={p.comment || "photo"}
                  className="w-full h-full object-cover transition group-hover:scale-[1.02]"
                />
              </button>
              <div className="p-2 sm:p-3 text-[11px] sm:text-xs">
                <div className="font-medium truncate">{p.uploaderName}</div>
                {p.comment && (
                  <div className="text-muted-foreground line-clamp-2">
                    {p.comment}
                  </div>
                )}
              </div>
              <Button
                size="icon"
                variant="destructive"
                className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 h-7 w-7"
                onClick={() => del.mutate(p.id)}
                title="Excluir"
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </Card>
          ))}
        </div>
      )}

      <PhotoLightbox
        photos={photos.map((p) => ({
          id: p.id,
          url: p.url,
          uploaderName: p.uploaderName,
          comment: p.comment,
        }))}
        initialIndex={lightboxIndex ?? 0}
        open={lightboxIndex !== null}
        onClose={() => setLightboxIndex(null)}
      />
    </div>
  );
}
