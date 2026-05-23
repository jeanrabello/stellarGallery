"use client";
import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, tokenStore } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

function AcceptInviteInner() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token") || "";
  const [status, setStatus] = React.useState<
    "idle" | "working" | "ok" | "error"
  >("idle");
  const [message, setMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!token) return;
    if (!tokenStore.get()) {
      router.replace(`/login?next=/invites/accept?token=${token}`);
      return;
    }
    setStatus("working");
    api<{ groupId: string }>("/invites/accept", {
      method: "POST",
      body: JSON.stringify({ token }),
    })
      .then((r) => {
        setStatus("ok");
        router.replace(`/groups/${r.groupId}`);
      })
      .catch((e) => {
        setStatus("error");
        setMessage(e.message);
      });
  }, [token, router]);

  return (
    <Card className="max-w-md w-full">
      <CardContent className="p-6 text-center space-y-3">
        {status === "working" && <div>Aceitando convite…</div>}
        {status === "ok" && <div>Convite aceito!</div>}
        {status === "error" && (
          <>
            <div className="font-semibold">Convite inválido</div>
            <div className="text-sm text-muted-foreground">{message}</div>
            <Button onClick={() => router.replace("/groups")}>
              Ir para grupos
            </Button>
          </>
        )}
        {!token && <div>Token não informado.</div>}
      </CardContent>
    </Card>
  );
}

export default function AcceptInvitePage() {
  return (
    <div className="min-h-screen grid place-items-center p-4">
      <React.Suspense
        fallback={
          <Card className="max-w-md w-full">
            <CardContent className="p-6 text-center">Carregando…</CardContent>
          </Card>
        }
      >
        <AcceptInviteInner />
      </React.Suspense>
    </div>
  );
}
