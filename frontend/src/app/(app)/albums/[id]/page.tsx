"use client";
import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import {
  Trash2,
  Share2,
  Copy,
  Star,
  StarOff,
  Loader2,
  Download,
  Lock,
  LockOpen,
} from "lucide-react";
import { PhotoLightbox } from "@/components/photo-lightbox";
import { StarLoader } from "@/components/ui/star-loader";
import { PhotoUploader } from "@/components/photo-uploader";
import { useAuth } from "@/components/auth-provider";

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
  ownerId: string;
  coverPhotoId?: string | null;
  locked?: boolean;
};

type Group = {
  id: string;
  ownerId: string;
  isOwner: boolean;
};

export default function AlbumPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();

  const { data: album, isLoading: albumLoading } = useQuery<Album>({
    queryKey: ["album", id],
    queryFn: () => api<Album>(`/albums/${id}`),
  });

  const { data: photos = [], isLoading: photosLoading } = useQuery<Photo[]>({
    queryKey: ["photos", id],
    queryFn: () => api<Photo[]>(`/photos/album/${id}`),
  });

  // For group albums we need to know whether the current user owns the group
  // — only the group owner may share via token or lock/unlock the album.
  const { data: group } = useQuery<Group>({
    queryKey: ["group", album?.ownerId],
    queryFn: () => api<Group>(`/groups/${album!.ownerId}`),
    enabled: album?.ownerType === "group" && !!album?.ownerId,
  });

  // Who is allowed to manage (share/lock) this album.
  const canManage =
    album?.ownerType === "user"
      ? album.ownerId === user?.id
      : !!group?.isOwner;

  const locked = !!album?.locked;

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

  const setCover = useMutation({
    mutationFn: (photoId: string) =>
      api(`/albums/${id}/cover`, {
        method: "PATCH",
        body: JSON.stringify({ photoId }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["album", id] });
      qc.invalidateQueries({ queryKey: ["albums", "mine"] });
      qc.invalidateQueries({ queryKey: ["group-albums"] });
      toast({ title: "Capa definida" });
    },
    onError: (e: any) => {
      toast({
        title: "Erro",
        description: e.message,
        variant: "destructive",
      });
    },
  });

  const deleteAlbum = useMutation({
    mutationFn: () => api(`/albums/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["albums", "mine"] });
      qc.invalidateQueries({ queryKey: ["group-albums"] });
      toast({ title: "Álbum excluído" });
      router.replace("/gallery");
    },
    onError: (e: any) => {
      toast({
        title: "Erro",
        description: e.message,
        variant: "destructive",
      });
    },
  });

  const toggleLock = useMutation({
    mutationFn: (next: boolean) =>
      api(`/albums/${id}/${next ? "lock" : "unlock"}`, { method: "PATCH" }),
    onSuccess: (_d, next) => {
      qc.invalidateQueries({ queryKey: ["album", id] });
      toast({
        title: next ? "Álbum travado" : "Álbum destravado",
        description: next
          ? "Novos envios de fotos estão bloqueados."
          : "Envios de fotos liberados.",
      });
    },
    onError: (e: any) => {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    },
  });

  const download = useMutation({
    mutationFn: async () => {
      // `raw` returns the Response so we can read the zip as a blob.
      const res = await api<Response>(`/albums/${id}/download`, { raw: true });
      const blob = await res.blob();
      const disposition = res.headers.get("content-disposition") || "";
      const match = disposition.match(/filename="?([^"]+)"?/);
      const filename = match?.[1] || `${album?.name || "album"}.zip`;
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
    },
    onError: (e: any) => {
      toast({ title: "Erro ao baixar", description: e.message, variant: "destructive" });
    },
  });

  const [openShare, setOpenShare] = React.useState(false);
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

  if (albumLoading) return <StarLoader />;

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
              <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                <span>
                  {album?.ownerType === "group"
                    ? "Álbum compartilhado de grupo"
                    : "Álbum privado"}
                </span>
                {locked && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-700 px-2 py-0.5 text-[10px] uppercase tracking-wider">
                    <Lock className="h-3 w-3" />
                    travado
                  </span>
                )}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {canManage && (
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
                        disabled={createShare.isPending}
                        onClick={async () => {
                          if (createShare.isPending) return;
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
                        {createShare.isPending && (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        )}
                        {createShare.isPending ? "Gerando…" : "Gerar"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}

              <Button
                size="icon"
                className="bg-emerald-400 text-white hover:bg-emerald-400/90"
                onClick={() => download.mutate()}
                disabled={download.isPending || photos.length === 0}
                aria-label="Baixar álbum (.zip)"
                title={
                  photos.length === 0
                    ? "Álbum vazio"
                    : "Baixar álbum (.zip)"
                }
              >
                {download.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
              </Button>

              {canManage && (
                <Button
                  variant="secondary"
                  onClick={() => toggleLock.mutate(!locked)}
                  disabled={toggleLock.isPending}
                  title={
                    locked
                      ? "Liberar novos envios"
                      : "Bloquear novos envios de fotos"
                  }
                >
                  {toggleLock.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : locked ? (
                    <LockOpen className="h-4 w-4" />
                  ) : (
                    <Lock className="h-4 w-4" />
                  )}
                  {toggleLock.isPending
                    ? "Atualizando…"
                    : locked
                      ? "Destravar álbum"
                      : "Travar álbum"}
                </Button>
              )}

              {locked ? (
                <div className="inline-flex items-center gap-1 rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
                  <Lock className="h-3.5 w-3.5" />
                  Envios bloqueados
                </div>
              ) : (
                <PhotoUploader
                  onUpload={async ({ file, comment }) => {
                    await upload.mutateAsync({ file, comment });
                  }}
                />
              )}

              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="destructive" title="Excluir álbum">
                    <Trash2 className="h-4 w-4" />
                    Excluir álbum
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Excluir este álbum?</DialogTitle>
                  </DialogHeader>
                  <p className="text-sm text-muted-foreground">
                    O álbum sairá da sua galeria. Esta ação não pode ser
                    desfeita pela interface.
                  </p>
                  <DialogFooter>
                    <DialogClose asChild>
                      <Button variant="ghost">Cancelar</Button>
                    </DialogClose>
                    <Button
                      variant="destructive"
                      onClick={() => deleteAlbum.mutate()}
                      disabled={deleteAlbum.isPending}
                    >
                      {deleteAlbum.isPending && (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      )}
                      {deleteAlbum.isPending ? "Excluindo…" : "Excluir"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </CardContent>
      </Card>

      {photosLoading ? (
        <StarLoader fullScreen={false} />
      ) : photos.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-white/40 p-10 text-center">
          <div className="text-base font-medium">Álbum vazio</div>
          <div className="text-sm text-muted-foreground">
            Envie a primeira foto.
          </div>
        </div>
      ) : (
        <div className="grid gap-3 sm:gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {photos.map((p, i) => {
            const isCover =
              !!album?.coverPhotoId && album.coverPhotoId === p.id;
            const onlyPhoto = photos.length === 1;
            return (
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
                {(isCover || onlyPhoto) && (
                  <div className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-full bg-white/90 text-[10px] uppercase tracking-wider px-2 py-0.5 shadow-sm">
                    <Star className="h-3 w-3 text-amber-500 fill-amber-400" />
                    capa
                  </div>
                )}
                <div className="p-2 sm:p-3 text-[11px] sm:text-xs">
                  <div className="font-medium truncate">{p.uploaderName}</div>
                  {p.comment && (
                    <div className="text-muted-foreground line-clamp-2">
                      {p.comment}
                    </div>
                  )}
                </div>
                <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                  {!isCover && photos.length > 1 && (
                    <Button
                      size="icon"
                      variant="secondary"
                      className="h-7 w-7"
                      onClick={() => setCover.mutate(p.id)}
                      title="Definir como capa"
                      disabled={setCover.isPending}
                    >
                      {setCover.isPending && setCover.variables === p.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <StarOff className="h-3 w-3" />
                      )}
                    </Button>
                  )}
                  <Button
                    size="icon"
                    variant="destructive"
                    className="h-7 w-7"
                    onClick={() => del.mutate(p.id)}
                    title="Excluir"
                    disabled={del.isPending && del.variables === p.id}
                  >
                    {del.isPending && del.variables === p.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Trash2 className="h-3 w-3" />
                    )}
                  </Button>
                </div>
              </Card>
            );
          })}
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
