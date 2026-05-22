"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { Sparkles } from "lucide-react";
import { GoogleIcon } from "@/components/icons/google";

export default function LoginPage() {
  const router = useRouter();
  const { loginEmail, loginGoogle } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = React.useState(false);

  const [identifier, setIdentifier] = React.useState("");
  const [password, setPassword] = React.useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await loginEmail(identifier, password);
      router.replace("/gallery");
    } catch (e: any) {
      toast({
        title: "Falha no login",
        description: e.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";

  const loginWithIdToken = async (idToken: string) => {
    try {
      await loginGoogle({ idToken });
      router.replace("/gallery");
    } catch (e: any) {
      toast({
        title: "Erro Google",
        description: e.message,
        variant: "destructive",
      });
    }
  };

  const openGoogle = () => {
    if (googleClientId) {
      // Real Google Identity Services flow.
      const w = window as any;
      const start = () => {
        try {
          w.google.accounts.id.initialize({
            client_id: googleClientId,
            callback: (resp: { credential?: string }) => {
              if (resp?.credential) loginWithIdToken(resp.credential);
            },
            ux_mode: "popup",
            auto_select: false,
          });
          w.google.accounts.id.prompt();
        } catch (e: any) {
          toast({
            title: "Erro Google",
            description: e?.message || "Falha ao iniciar GIS",
            variant: "destructive",
          });
        }
      };
      if (w.google?.accounts?.id) {
        start();
      } else {
        const s = document.createElement("script");
        s.src = "https://accounts.google.com/gsi/client";
        s.async = true;
        s.defer = true;
        s.onload = start;
        document.head.appendChild(s);
      }
      return;
    }

    // Fallback: dev popup mock.
    const w = 460;
    const h = 580;
    const left = window.screenX + (window.outerWidth - w) / 2;
    const top = window.screenY + (window.outerHeight - h) / 2;
    const popup = window.open(
      "/google-mock",
      "stellar-google",
      `width=${w},height=${h},left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no`,
    );
    if (!popup) {
      toast({
        title: "Pop-up bloqueado",
        description: "Permita pop-ups para entrar com Google.",
        variant: "destructive",
      });
      return;
    }
    const handler = async (ev: MessageEvent) => {
      if (ev.origin !== window.location.origin) return;
      if (ev.data?.type !== "stellar-google-mock") return;
      window.removeEventListener("message", handler);
      try {
        await loginGoogle(ev.data.payload);
        router.replace("/gallery");
      } catch (e: any) {
        toast({
          title: "Erro Google",
          description: e.message,
          variant: "destructive",
        });
      }
    };
    window.addEventListener("message", handler);
  };

  return (
    <div className="min-h-screen grid place-items-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="mx-auto h-12 w-12 rounded-2xl bg-gradient-to-br from-pastel-lavender via-pastel-blush to-pastel-peach grid place-items-center shadow">
            <Sparkles className="h-6 w-6 text-white" />
          </div>
          <CardTitle className="text-center mt-2">
            Bem-vinda(o) ao Stellar Gallery
          </CardTitle>
          <CardDescription className="text-center">
            Entre com sua conta para gerenciar suas galerias
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={submit} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="identifier">Email ou nome de usuário</Label>
              <Input
                id="identifier"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="voce@exemplo.com ou ana"
                autoComplete="username"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
              />
            </div>
            <Button type="submit" disabled={loading} className="w-full">
              Entrar
            </Button>
          </form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs uppercase tracking-wider">
              <span className="bg-white/75 px-2 text-muted-foreground">ou</span>
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            className="w-full bg-white/80"
            onClick={openGoogle}
            data-testid="google-button"
          >
            <GoogleIcon className="h-5 w-5" />
            Entrar com Google
          </Button>
        </CardContent>
        <CardFooter className="justify-center text-sm">
          Ainda não tem conta?{" "}
          <Link href="/signup" className="ml-1 font-medium underline">
            Criar conta
          </Link>
        </CardFooter>
      </Card>
    </div>
  );
}
