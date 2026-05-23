"use client";
import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import { SortableAlbumGrid } from "@/components/album-grid";
import { useToast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import {
  Mail,
  Plus,
  Copy,
  UserPlus,
  Globe2,
  Lock,
  ImagePlus,
  Trash2,
  Loader2,
} from "lucide-react";
import { StarLoader } from "@/components/ui/star-loader";

type Album = {
  id: string;
  name: string;
  description?: string;
  coverUrl?: string | null;
};

type Group = {
  id: string;
  name: string;
  description?: string;
  visibility: "public" | "private";
  joinCode: string;
  isOwner: boolean;
  isMember: boolean;
  memberCount: number;
  coverUrl?: string | null;
  membersDetail: Array<{
    id: string;
    username: string;
    firstName?: string;
    lastName?: string;
    displayName?: string;
    email: string;
  }>;
};

export default function GroupDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: group, isLoading: groupLoading } = useQuery<Group>({
    queryKey: ["group", id],
    queryFn: () => api<Group>(`/groups/${id}`),
  });
  const { data: albums = [], isLoading: albumsLoading } = useQuery<Album[]>({
    queryKey: ["group-albums", id],
    queryFn: () => api<Album[]>(`/albums/group/${id}`),
    enabled: !!group && (group.isMember || group.visibility === "public"),
  });

  const createAlbum = useMutation({
    mutationFn: (payload: { name: string; description?: string }) =>
      api("/albums", {
        method: "POST",
        body: JSON.stringify({
          ...payload,
          ownerType: "group",
          groupId: id,
        }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["group-albums", id] }),
  });

  const reorder = useMutation({
    mutationFn: (orderedIds: string[]) =>
      api("/albums/reorder", {
        method: "POST",
        body: JSON.stringify({
          ownerType: "group",
          groupId: id,
          orderedIds,
        }),
      }),
  });

  const sendInvite = useMutation({
    mutationFn: (email: string) =>
      api<{ inviteLink: string; joinCode: string; emailSent: boolean }>(
        "/invites/send",
        {
          method: "POST",
          body: JSON.stringify({ groupId: id, email }),
        },
      ),
  });

  const joinGroup = useMutation({
    mutationFn: () =>
      api("/groups/join", {
        method: "POST",
        body: JSON.stringify({ joinCode: group?.joinCode }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["group", id] });
      qc.invalidateQueries({ queryKey: ["group-albums", id] });
      qc.invalidateQueries({ queryKey: ["groups"] });
      toast({ title: "Você entrou no grupo!" });
    },
  });

  const uploadCover = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      return api(`/groups/${id}/cover`, { method: "POST", body: fd });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["group", id] });
      qc.invalidateQueries({ queryKey: ["groups"] });
      toast({ title: "Capa atualizada" });
    },
    onError: (e: any) => {
      toast({
        title: "Falha ao atualizar capa",
        description: e.message,
        variant: "destructive",
      });
    },
  });

  const deleteGroup = useMutation({
    mutationFn: () => api(`/groups/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["groups"] });
      toast({ title: "Grupo excluído" });
      router.replace("/groups");
    },
    onError: (e: any) => {
      toast({
        title: "Erro",
        description: e.message,
        variant: "destructive",
      });
    },
  });

  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [openNew, setOpenNew] = React.useState(false);
  const [email, setEmail] = React.useState("");
  const [openInvite, setOpenInvite] = React.useState(false);
  const [lastInvite, setLastInvite] = React.useState<{
    link: string;
    code: string;
  } | null>(null);
  const coverInputRef = React.useRef<HTMLInputElement>(null);

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      toast({ title: "Código copiado!" });
    } catch {
      toast({ title: "Não foi possível copiar", variant: "destructive" });
    }
  };

  if (groupLoading) return <StarLoader />;
  if (!group) return null;

  const canManage = group.isMember;

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden">
        {/* Cover */}
        <div className="relative aspect-[16/5] bg-gradient-to-br from-pastel-lavender via-pastel-blush to-pastel-peach">
          {group.coverUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={group.coverUrl}
              alt={group.name}
              className="absolute inset-0 w-full h-full object-cover"
            />
          )}
          {group.isOwner && (
            <>
              <input
                ref={coverInputRef}
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadCover.mutate(f);
                  e.target.value = "";
                }}
              />
              <Button
                size="sm"
                variant="secondary"
                className="absolute bottom-3 right-3 shadow"
                onClick={() => coverInputRef.current?.click()}
                disabled={uploadCover.isPending}
              >
                {uploadCover.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ImagePlus className="h-4 w-4" />
                )}
                {uploadCover.isPending
                  ? "Enviando…"
                  : group.coverUrl
                    ? "Trocar capa"
                    : "Adicionar capa"}
              </Button>
            </>
          )}
        </div>

        <CardContent className="p-4 sm:p-5 space-y-4">
          {/* Title + tag + join code (inline) */}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-semibold break-words">
                {group.name}
              </h1>
              <span
                className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full inline-flex items-center gap-1 ${
                  group.visibility === "public"
                    ? "bg-pastel-mint text-emerald-800"
                    : "bg-pastel-lavender text-purple-800"
                }`}
              >
                {group.visibility === "public" ? (
                  <Globe2 className="h-3 w-3" />
                ) : (
                  <Lock className="h-3 w-3" />
                )}
                {group.visibility}
              </span>
              {canManage && (
                <Tooltip label="Copiar código">
                  <button
                    type="button"
                    onClick={() => copyCode(group.joinCode)}
                    aria-label="Copiar código"
                    className="font-mono text-[11px] bg-pastel-butter/70 rounded-md px-2 py-1 inline-flex items-center gap-1.5 hover:bg-pastel-butter transition-colors"
                  >
                    <span>{group.joinCode}</span>
                    <Copy className="h-3 w-3 opacity-70" />
                  </button>
                </Tooltip>
              )}
            </div>
            {group.description && (
              <p className="text-sm text-muted-foreground mt-1">
                {group.description}
              </p>
            )}
          </div>

          {/* Members + action buttons aligned on the same row */}
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 flex-1">
              <div className="text-xs text-muted-foreground mb-1.5">
                {group.memberCount} membro
                {group.memberCount === 1 ? "" : "s"}
              </div>
              {group.membersDetail?.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {group.membersDetail.map((m) => (
                    <span
                      key={m.id}
                      className="text-xs rounded-full bg-pastel-blush/60 px-3 py-1"
                      title={m.email}
                    >
                      {m.displayName || m.username}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 lg:shrink-0">
              {!group.isMember && group.visibility === "public" && (
                <Button
                  onClick={() => joinGroup.mutate()}
                  disabled={joinGroup.isPending}
                  data-testid="join-group-button"
                >
                  {joinGroup.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <UserPlus className="h-4 w-4" />
                  )}
                  {joinGroup.isPending ? "Entrando…" : "Participar"}
                </Button>
              )}

              {canManage && (
                <>
                  <Dialog open={openInvite} onOpenChange={setOpenInvite}>
                    <DialogTrigger asChild>
                      <Button variant="secondary">
                        <Mail className="h-4 w-4" />
                        Convidar
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Convidar para o grupo</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-3">
                        <div className="space-y-1.5">
                          <Label>Email da pessoa</Label>
                          <Input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                          />
                        </div>
                        <p className="text-xs text-muted-foreground">
                          O envio de email é mockado — copiamos o link aqui
                          para você compartilhar manualmente.
                        </p>
                        {lastInvite && (
                          <div className="rounded-xl bg-pastel-sky/40 p-3 text-xs space-y-1">
                            <div>
                              <b>Link:</b> {lastInvite.link}
                            </div>
                            <div>
                              <b>Código:</b> {lastInvite.code}
                            </div>
                          </div>
                        )}
                      </div>
                      <DialogFooter>
                        <DialogClose asChild>
                          <Button variant="ghost">Fechar</Button>
                        </DialogClose>
                        <Button
                          disabled={!email || sendInvite.isPending}
                          onClick={async () => {
                            if (!email || sendInvite.isPending) return;
                            try {
                              const r = await sendInvite.mutateAsync(email);
                              setLastInvite({
                                link: r.inviteLink,
                                code: r.joinCode,
                              });
                              toast({
                                title: r.emailSent
                                  ? "Convite enviado por email"
                                  : "Convite criado",
                                description: r.emailSent
                                  ? `Email enviado para ${email}. O link também está disponível abaixo.`
                                  : "Compartilhe o link/código abaixo manualmente.",
                              });
                              setEmail("");
                            } catch (e: any) {
                              toast({
                                title: "Erro",
                                description: e.message,
                                variant: "destructive",
                              });
                            }
                          }}
                        >
                          {sendInvite.isPending && (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          )}
                          {sendInvite.isPending ? "Enviando…" : "Enviar"}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>

                  <Dialog open={openNew} onOpenChange={setOpenNew}>
                    <DialogTrigger asChild>
                      <Button>
                        <Plus className="h-4 w-4" />
                        Novo álbum
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Criar álbum do grupo</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-3">
                        <div className="space-y-1.5">
                          <Label>Nome</Label>
                          <Input
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Descrição</Label>
                          <Textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                          />
                        </div>
                      </div>
                      <DialogFooter>
                        <DialogClose asChild>
                          <Button variant="ghost">Cancelar</Button>
                        </DialogClose>
                        <Button
                          disabled={!name || createAlbum.isPending}
                          onClick={async () => {
                            if (!name || createAlbum.isPending) return;
                            try {
                              await createAlbum.mutateAsync({
                                name,
                                description,
                              });
                              setName("");
                              setDescription("");
                              setOpenNew(false);
                            } catch (e: any) {
                              toast({
                                title: "Erro",
                                description: e.message,
                                variant: "destructive",
                              });
                            }
                          }}
                        >
                          {createAlbum.isPending && (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          )}
                          {createAlbum.isPending ? "Criando…" : "Criar"}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>

                  {group.isOwner && (
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button variant="destructive" title="Excluir grupo">
                          <Trash2 className="h-4 w-4" />
                          Excluir grupo
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Excluir este grupo?</DialogTitle>
                        </DialogHeader>
                        <p className="text-sm text-muted-foreground">
                          O grupo sairá da sua lista e ninguém mais terá acesso
                          aos álbuns compartilhados. Esta ação não pode ser
                          desfeita pela interface.
                        </p>
                        <DialogFooter>
                          <DialogClose asChild>
                            <Button variant="ghost">Cancelar</Button>
                          </DialogClose>
                          <Button
                            variant="destructive"
                            onClick={() => deleteGroup.mutate()}
                            disabled={deleteGroup.isPending}
                          >
                            {deleteGroup.isPending && (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            )}
                            {deleteGroup.isPending
                              ? "Excluindo…"
                              : "Excluir"}
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  )}
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <div>
        <h2 className="text-base sm:text-lg font-semibold mb-3">
          Álbuns do grupo
        </h2>
        {albumsLoading ? (
          <StarLoader fullScreen={false} />
        ) : albums.length === 0 ? (
          <div className="rounded-2xl border border-dashed bg-white/40 p-10 text-center">
            <div className="text-base font-medium">Sem álbuns por aqui</div>
            <div className="text-sm text-muted-foreground">
              {canManage
                ? "Crie o primeiro álbum compartilhado."
                : "Os álbuns aparecerão aqui quando forem criados."}
            </div>
          </div>
        ) : canManage ? (
          <SortableAlbumGrid
            albums={albums}
            onReorder={(ids) => reorder.mutate(ids)}
          />
        ) : (
          <div className="grid gap-3 sm:gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {albums.map((a) => (
              <a
                key={a.id}
                href={`/albums/${a.id}`}
                className="block rounded-2xl overflow-hidden border bg-white/70 hover:shadow-md transition"
              >
                <div className="aspect-[4/3] relative bg-gradient-to-br from-pastel-blush to-pastel-butter">
                  {a.coverUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={a.coverUrl}
                      alt={a.name}
                      className="w-full h-full object-cover"
                    />
                  )}
                  <div className="absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-black/55 to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 p-2 text-white text-sm font-semibold truncate">
                    {a.name}
                  </div>
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
