"use client";
import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Copy, X } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { StarLoader } from "@/components/ui/star-loader";

type ShareToken = {
  id: string;
  token: string;
  url: string;
  name?: string;
  albumId: string;
  revoked: boolean;
  lastUsedAt?: string;
  createdAt: string;
};

export default function SharesPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: tokens = [], isLoading } = useQuery<ShareToken[]>({
    queryKey: ["shares"],
    queryFn: () => api<ShareToken[]>("/share-tokens"),
  });
  const revoke = useMutation({
    mutationFn: (id: string) =>
      api(`/share-tokens/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["shares"] }),
  });

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: "Copiado!" });
    } catch {}
  };

  if (isLoading) return <StarLoader label="Carregando tokens…" />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Compartilhamentos</h1>
        <p className="text-sm text-muted-foreground">
          Tokens emitidos para consumir seus álbuns em outras aplicações.
        </p>
      </div>
      {tokens.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-white/40 p-10 text-center">
          Nenhum token. Abra um álbum privado e clique em <b>Compartilhar via token</b>.
        </div>
      ) : (
        <div className="grid gap-3">
          {tokens.map((t) => (
            <Card key={t.id}>
              <CardContent className="p-4 flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{t.name || "(sem nome)"}</div>
                  <div className="text-xs text-muted-foreground break-all">
                    {t.url}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Token: <code className="break-all">{t.token}</code>
                  </div>
                  {t.revoked && (
                    <span className="inline-block mt-1 text-[10px] uppercase tracking-wider rounded-full bg-destructive/10 text-destructive px-2 py-0.5">
                      revogado
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="ghost" onClick={() => copy(t.url)}>
                    <Copy className="h-3 w-3" />
                    URL
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => copy(t.token)}
                  >
                    <Copy className="h-3 w-3" />
                    Token
                  </Button>
                  {!t.revoked && (
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => revoke.mutate(t.id)}
                    >
                      <X className="h-3 w-3" />
                      Revogar
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
