"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth, type GoogleSignupPending } from "@/components/auth-provider";
import { api } from "@/lib/api";
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
import { Sparkles, Loader2 } from "lucide-react";
import { GoogleIcon } from "@/components/icons/google";
import { StarLoader } from "@/components/ui/star-loader";

export default function LoginPage() {
  const router = useRouter();
  const { loginEmail, loginGoogle, completeGoogleSignup } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = React.useState(false);
  // While the Google popup is open OR we are exchanging the token + redirecting.
  // Drives both the inline spinner on the button and a full-screen overlay
  // shown after we receive an access token (until the route changes).
  const [googleLoading, setGoogleLoading] = React.useState(false);
  const [googleRedirecting, setGoogleRedirecting] = React.useState(false);
  // Set when /auth/google returns needsUsername: true. The card switches to
  // a username step until the user confirms.
  const [pending, setPending] = React.useState<GoogleSignupPending | null>(
    null,
  );

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

  // Minimum dwell time for the full-screen overlay so the loader is always
  // visible long enough to feel intentional (UX preference).
  const OVERLAY_MIN_MS = 3000;
  const withMinDwell = async <T,>(task: Promise<T>): Promise<T> => {
    const [result] = await Promise.all([
      task,
      new Promise((r) => setTimeout(r, OVERLAY_MIN_MS)),
    ]);
    return result;
  };

  const loginWithAccessToken = async (accessToken: string) => {
    setGoogleRedirecting(true);
    try {
      const result = await withMinDwell(loginGoogle({ accessToken }));
      if (result.needsUsername) {
        // First-time Google user — collect a username before creating account.
        setGoogleRedirecting(false);
        setGoogleLoading(false);
        setPending(result);
        return;
      }
      router.replace("/gallery");
    } catch (e: any) {
      toast({
        title: "Erro Google",
        description: e.message,
        variant: "destructive",
      });
      setGoogleRedirecting(false);
      setGoogleLoading(false);
    }
  };

  const openGoogle = () => {
    if (googleClientId) {
      // OAuth 2.0 token client — opens the classic account chooser popup
      // (lists all signed-in Google accounts + "use another account").
      setGoogleLoading(true);
      const w = window as any;
      const start = () => {
        try {
          const client = w.google.accounts.oauth2.initTokenClient({
            client_id: googleClientId,
            scope: "openid email profile",
            prompt: "select_account",
            callback: (resp: { access_token?: string; error?: string }) => {
              if (resp?.error) {
                toast({
                  title: "Erro Google",
                  description: resp.error,
                  variant: "destructive",
                });
                setGoogleLoading(false);
                return;
              }
              if (resp?.access_token) loginWithAccessToken(resp.access_token);
              else setGoogleLoading(false);
            },
            error_callback: (err: { type?: string; message?: string }) => {
              // Fires when the user closes the popup, denies access, etc.
              if (err?.type && err.type !== "popup_closed") {
                toast({
                  title: "Erro Google",
                  description: err.message || err.type,
                  variant: "destructive",
                });
              }
              setGoogleLoading(false);
            },
          });
          client.requestAccessToken();
        } catch (e: any) {
          setGoogleLoading(false);
          toast({
            title: "Erro Google",
            description: e?.message || "Falha ao iniciar GIS",
            variant: "destructive",
          });
        }
      };
      if (w.google?.accounts?.oauth2) {
        start();
      } else {
        const s = document.createElement("script");
        s.src = "https://accounts.google.com/gsi/client";
        s.async = true;
        s.defer = true;
        s.onload = start;
        s.onerror = () => setGoogleLoading(false);
        document.head.appendChild(s);
      }
      return;
    }

    // Fallback: dev popup mock.
    setGoogleLoading(true);
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
      setGoogleLoading(false);
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
      setGoogleRedirecting(true);
      try {
        const result = await withMinDwell(loginGoogle(ev.data.payload));
        if (result.needsUsername) {
          setGoogleRedirecting(false);
          setGoogleLoading(false);
          setPending(result);
          return;
        }
        router.replace("/gallery");
      } catch (e: any) {
        toast({
          title: "Erro Google",
          description: e.message,
          variant: "destructive",
        });
        setGoogleRedirecting(false);
        setGoogleLoading(false);
      }
    };
    window.addEventListener("message", handler);
  };

  if (googleRedirecting) {
    return (
      <div className="min-h-screen grid place-items-center p-4">
        <StarLoader />
      </div>
    );
  }

  return (
    <div className="min-h-screen grid place-items-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="mx-auto h-12 w-12 rounded-2xl bg-gradient-to-br from-pastel-lavender via-pastel-blush to-pastel-peach grid place-items-center shadow">
            <Sparkles className="h-6 w-6 text-white" />
          </div>
          {pending ? (
            <>
              <CardTitle className="text-center mt-2">
                Falta só uma coisa…
              </CardTitle>
              <CardDescription className="text-center">
                Escolha o nome de usuário que aparecerá no Stellar Gallery
              </CardDescription>
            </>
          ) : (
            <>
              <CardTitle className="text-center mt-2">
                Bem-vinda(o) ao Stellar Gallery
              </CardTitle>
              <CardDescription className="text-center">
                Entre com sua conta para gerenciar suas galerias
              </CardDescription>
            </>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {pending ? (
            <UsernameStep
              pending={pending}
              onCancel={() => setPending(null)}
              onCreated={() => router.replace("/gallery")}
              completeGoogleSignup={completeGoogleSignup}
              setOverlay={setGoogleRedirecting}
              toast={toast}
            />
          ) : (
            <>
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
                  <span className="bg-white/75 px-2 text-muted-foreground">
                    ou
                  </span>
                </div>
              </div>

              <Button
                type="button"
                variant="outline"
                className="w-full bg-white/80"
                onClick={openGoogle}
                disabled={googleLoading || loading}
                data-testid="google-button"
              >
                {googleLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <GoogleIcon className="h-5 w-5" />
                )}
                {googleLoading ? "Conectando…" : "Entrar com Google"}
              </Button>
            </>
          )}
        </CardContent>
        {!pending && (
          <CardFooter className="justify-center text-sm">
            Ainda não tem conta?{" "}
            <Link href="/signup" className="ml-1 font-medium underline">
              Criar conta
            </Link>
          </CardFooter>
        )}
      </Card>
    </div>
  );
}

function UsernameStep({
  pending,
  onCancel,
  onCreated,
  completeGoogleSignup,
  setOverlay,
  toast,
}: {
  pending: GoogleSignupPending;
  onCancel: () => void;
  onCreated: () => void;
  completeGoogleSignup: (ticket: string, username: string) => Promise<void>;
  setOverlay: (v: boolean) => void;
  toast: ReturnType<typeof useToast>["toast"];
}) {
  const [username, setUsername] = React.useState(pending.suggestedUsername);
  const [checking, setChecking] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [status, setStatus] = React.useState<
    "idle" | "available" | "invalid" | "taken"
  >("idle");

  React.useEffect(() => {
    setStatus("idle");
    const value = username.trim().toLowerCase();
    if (!value) return;
    const handle = setTimeout(async () => {
      setChecking(true);
      try {
        const r = await api<{
          available: boolean;
          reason?: "invalid" | "taken";
        }>(
          `/auth/username-available?username=${encodeURIComponent(value)}`,
          { auth: false },
        );
        if (r.available) setStatus("available");
        else setStatus(r.reason === "invalid" ? "invalid" : "taken");
      } catch {
        // network hiccup — leave idle so user can still retry on submit
      } finally {
        setChecking(false);
      }
    }, 350);
    return () => clearTimeout(handle);
  }, [username]);

  const canSubmit = status === "available" && !submitting && !checking;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setOverlay(true);
    try {
      await Promise.all([
        completeGoogleSignup(pending.ticket, username.trim().toLowerCase()),
        new Promise((r) => setTimeout(r, 3000)),
      ]);
      onCreated();
    } catch (e: any) {
      toast({
        title: "Não foi possível criar a conta",
        description: e.message,
        variant: "destructive",
      });
      setOverlay(false);
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-pastel-blush/40 p-3 text-xs">
        <div className="font-medium text-foreground">
          {pending.profile.displayName ||
            [pending.profile.firstName, pending.profile.lastName]
              .filter(Boolean)
              .join(" ")}
        </div>
        <div className="text-muted-foreground truncate">
          {pending.profile.email}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="new-username">Nome de usuário</Label>
        <Input
          id="new-username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="seu-nome"
          autoComplete="off"
          autoFocus
        />
        <div className="text-xs min-h-[1.25rem]">
          {checking ? (
            <span className="text-muted-foreground inline-flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              Verificando…
            </span>
          ) : status === "available" ? (
            <span className="text-emerald-700">✓ Disponível</span>
          ) : status === "taken" ? (
            <span className="text-destructive">
              Esse nome já está em uso.
            </span>
          ) : status === "invalid" ? (
            <span className="text-destructive">
              Use 2 a 40 caracteres entre letras, números, “.”, “_” ou “-”.
            </span>
          ) : (
            <span className="text-muted-foreground">
              Use 2 a 40 caracteres entre letras, números, “.”, “_” ou “-”.
            </span>
          )}
        </div>
      </div>

      <div className="flex gap-2">
        <Button
          variant="ghost"
          className="flex-1"
          onClick={onCancel}
          disabled={submitting}
        >
          Voltar
        </Button>
        <Button className="flex-1" onClick={submit} disabled={!canSubmit}>
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            "Criar conta"
          )}
        </Button>
      </div>
    </div>
  );
}
