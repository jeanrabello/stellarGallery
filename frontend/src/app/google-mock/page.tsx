"use client";
import * as React from "react";
import { Suspense } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GoogleIcon } from "@/components/icons/google";

function GoogleMockInner() {
  const [email, setEmail] = React.useState("usuario@gmail.com");
  const [firstName, setFirstName] = React.useState("Maria");
  const [lastName, setLastName] = React.useState("Silva");
  const [submitting, setSubmitting] = React.useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    if (window.opener) {
      window.opener.postMessage(
        {
          type: "stellar-google-mock",
          payload: { email, firstName, lastName },
        },
        window.location.origin,
      );
      setTimeout(() => window.close(), 200);
    }
  };

  return (
    <div className="min-h-screen grid place-items-center p-4 bg-gradient-to-br from-pastel-lavender/40 via-pastel-blush/30 to-pastel-peach/40">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center gap-3">
            <GoogleIcon className="h-8 w-8" />
            <div>
              <div className="font-semibold">Entrar com o Google</div>
              <div className="text-xs text-muted-foreground">
                (Janela mock — em produção seria o OAuth real do Google)
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Nome</Label>
                <Input
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  autoFocus
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label>Sobrenome</Label>
                <Input
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={submitting}
              data-testid="confirm-google"
            >
              Continuar com Google
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <GoogleMockInner />
    </Suspense>
  );
}
