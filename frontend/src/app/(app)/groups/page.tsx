"use client";
import * as React from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { Plus, Users, Globe2, Lock } from "lucide-react";
import { StarLoader } from "@/components/ui/star-loader";

type Group = {
  id: string;
  name: string;
  description?: string;
  visibility: "public" | "private";
  joinCode: string;
  memberCount: number;
  isOwner: boolean;
};

export default function GroupsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: groups = [], isLoading } = useQuery<Group[]>({
    queryKey: ["groups"],
    queryFn: () => api<Group[]>("/groups"),
  });

  const create = useMutation({
    mutationFn: (payload: {
      name: string;
      description?: string;
      visibility: "public" | "private";
    }) => api("/groups", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["groups"] }),
  });

  const join = useMutation({
    mutationFn: (joinCode: string) =>
      api("/groups/join", {
        method: "POST",
        body: JSON.stringify({ joinCode }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["groups"] }),
  });

  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [visibility, setVisibility] = React.useState<"public" | "private">(
    "private",
  );

  const [joinCode, setJoinCode] = React.useState("");

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold">Grupos</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Crie grupos para compartilhar álbuns com pessoas.
          </p>
        </div>
        <div className="grid grid-cols-2 sm:flex sm:items-center gap-2">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="secondary" className="w-full sm:w-auto">
                Entrar com código
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Entrar em um grupo</DialogTitle>
              </DialogHeader>
              <div className="space-y-1.5">
                <Label>Código de participação</Label>
                <Input
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value)}
                  placeholder="EX: A1B2C3D4"
                />
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="ghost">Cancelar</Button>
                </DialogClose>
                <DialogClose asChild>
                  <Button
                    onClick={async () => {
                      try {
                        await join.mutateAsync(joinCode);
                        toast({ title: "Você entrou no grupo!" });
                        setJoinCode("");
                      } catch (e: any) {
                        toast({
                          title: "Erro",
                          description: e.message,
                          variant: "destructive",
                        });
                      }
                    }}
                  >
                    Entrar
                  </Button>
                </DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="w-full sm:w-auto">
                <Plus className="h-4 w-4" />
                Novo grupo
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Criar grupo</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Nome</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Descrição</Label>
                  <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>
                <Tabs
                  value={visibility}
                  onValueChange={(v) => setVisibility(v as any)}
                >
                  <TabsList className="grid grid-cols-2 w-full">
                    <TabsTrigger value="private">Privado</TabsTrigger>
                    <TabsTrigger value="public">Público</TabsTrigger>
                  </TabsList>
                  <TabsContent value="private" className="text-xs text-muted-foreground mt-2">
                    Apenas membros podem ver álbuns deste grupo.
                  </TabsContent>
                  <TabsContent value="public" className="text-xs text-muted-foreground mt-2">
                    Qualquer pessoa com o link pode visualizar e pedir para participar.
                  </TabsContent>
                </Tabs>
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="ghost">Cancelar</Button>
                </DialogClose>
                <Button
                  onClick={async () => {
                    if (!name) return;
                    try {
                      await create.mutateAsync({ name, description, visibility });
                      setName("");
                      setDescription("");
                      setOpen(false);
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
        </div>
      </div>

      {isLoading ? (
        <StarLoader label="Carregando seus grupos…" />
      ) : groups.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-white/40 p-10 text-center">
          <div className="text-lg font-medium">
            Você ainda não está em nenhum grupo
          </div>
          <div className="text-sm text-muted-foreground">
            Crie um grupo ou entre com um código.
          </div>
        </div>
      ) : (
        <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((g) => (
            <Card key={g.id} className="overflow-hidden">
              <div className="h-2 bg-gradient-to-r from-pastel-lavender via-pastel-blush to-pastel-peach" />
              <CardHeader className="gap-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base sm:text-lg">{g.name}</CardTitle>
                  <span
                    className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full inline-flex items-center gap-1 ${
                      g.visibility === "public"
                        ? "bg-pastel-mint text-emerald-800"
                        : "bg-pastel-lavender text-purple-800"
                    }`}
                  >
                    {g.visibility === "public" ? (
                      <Globe2 className="h-3 w-3" />
                    ) : (
                      <Lock className="h-3 w-3" />
                    )}
                    {g.visibility}
                  </span>
                </div>
                {g.description && (
                  <CardDescription className="line-clamp-2">
                    {g.description}
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent className="text-xs sm:text-sm text-muted-foreground flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1">
                  <Users className="h-4 w-4" /> {g.memberCount} membro
                  {g.memberCount === 1 ? "" : "s"}
                </span>
                <span className="ml-auto font-mono text-[11px] bg-pastel-butter/60 rounded-md px-2 py-1">
                  {g.joinCode}
                </span>
              </CardContent>
              <CardFooter>
                <Button asChild variant="secondary" className="w-full">
                  <Link href={`/groups/${g.id}`}>Abrir</Link>
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
