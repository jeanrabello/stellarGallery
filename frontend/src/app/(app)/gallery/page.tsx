"use client";
import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { SortableAlbumGrid } from "@/components/album-grid";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Plus } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { StarLoader } from "@/components/ui/star-loader";

type Album = {
  id: string;
  name: string;
  description?: string;
  coverUrl?: string | null;
};

export default function MyGalleryPage() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: albums = [], isLoading } = useQuery<Album[]>({
    queryKey: ["albums", "mine"],
    queryFn: () => api<Album[]>("/albums/mine"),
  });

  const createMut = useMutation({
    mutationFn: (payload: { name: string; description?: string }) =>
      api("/albums", {
        method: "POST",
        body: JSON.stringify({ ...payload, ownerType: "user" }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["albums", "mine"] }),
  });

  const reorderMut = useMutation({
    mutationFn: (orderedIds: string[]) =>
      api("/albums/reorder", {
        method: "POST",
        body: JSON.stringify({ ownerType: "user", orderedIds }),
      }),
  });

  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold">Minha galeria</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Seus álbuns privados. Arraste para reordenar.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="w-full sm:w-auto">
              <Plus className="h-4 w-4" />
              Novo álbum
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Criar álbum privado</DialogTitle>
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
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="ghost">Cancelar</Button>
              </DialogClose>
              <Button
                onClick={async () => {
                  if (!name) return;
                  try {
                    await createMut.mutateAsync({ name, description });
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

      {isLoading ? (
        <StarLoader label="Buscando seus álbuns…" />
      ) : albums.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-white/40 p-10 text-center">
          <div className="text-lg font-medium">Nenhum álbum ainda</div>
          <div className="text-sm text-muted-foreground">
            Clique em <b>Novo álbum</b> para criar o primeiro.
          </div>
        </div>
      ) : (
        <SortableAlbumGrid
          albums={albums}
          onReorder={(ids) => reorderMut.mutate(ids)}
        />
      )}
    </div>
  );
}
