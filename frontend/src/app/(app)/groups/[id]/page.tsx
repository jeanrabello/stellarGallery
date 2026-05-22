"use client";
import * as React from "react";
import { useParams } from "next/navigation";
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
import { Mail, Plus, Copy, UserPlus, Globe2, Lock } from "lucide-react";
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
      api<{ inviteLink: string; joinCode: string }>("/invites/send", {
        method: "POST",
        body: JSON.stringify({ groupId: id, email }),
      }),
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

  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [openNew, setOpenNew] = React.useState(false);
  const [email, setEmail] = React.useState("");
  const [openInvite, setOpenInvite] = React.useState(false);
  const [lastInvite, setLastInvite] = React.useState<{
    link: string;
    code: string;
  } | null>(null);

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: "Copiado!" });
    } catch {
      toast({ title: "Não foi possível copiar", variant: "destructive" });
    }
  };

  if (groupLoading) return <StarLoader label="Abrindo grupo…" />;
  if (!group) return null;

  const canManage = group.isMember;

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden">
        <div className="h-2 bg-gradient-to-r from-pastel-lavender via-pastel-blush to-pastel-peach" />
        <CardContent className="p-4 sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-semibold break-words">
                {group.name}
              </h1>
              {group.description && (
                <p className="text-sm text-muted-foreground mt-1">
                  {group.description}
                </p>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                <span
                  className={`px-2 py-0.5 rounded-full inline-flex items-center gap-1 ${
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
                  <>
                    <span className="font-mono bg-pastel-butter/70 px-2 py-0.5 rounded-md">
                      {group.joinCode}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => copy(group.joinCode)}
                    >
                      <Copy className="h-3 w-3" />
                      copiar código
                    </Button>
                  </>
                )}
                <span className="text-muted-foreground">
                  {group.memberCount} membro
                  {group.memberCount === 1 ? "" : "s"}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {!group.isMember && group.visibility === "public" && (
                <Button
                  onClick={() => joinGroup.mutate()}
                  disabled={joinGroup.isPending}
                  data-testid="join-group-button"
                >
                  <UserPlus className="h-4 w-4" />
                  Participar
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
                          O envio de email é mockado — copiamos o link aqui para
                          você compartilhar manualmente.
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
                          onClick={async () => {
                            if (!email) return;
                            try {
                              const r = await sendInvite.mutateAsync(email);
                              setLastInvite({
                                link: r.inviteLink,
                                code: r.joinCode,
                              });
                              toast({
                                title: "Convite criado",
                                description:
                                  "Link disponível abaixo (email mockado).",
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
                          Enviar
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
                          onClick={async () => {
                            if (!name) return;
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
                          Criar
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </>
              )}
            </div>
          </div>

          {group.membersDetail?.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
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
        </CardContent>
      </Card>

      <div>
        <h2 className="text-base sm:text-lg font-semibold mb-3">
          Álbuns do grupo
        </h2>
        {albumsLoading ? (
          <StarLoader label="Carregando álbuns…" fullScreen={false} />
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
          // Read-only grid for public viewers (no drag)
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
