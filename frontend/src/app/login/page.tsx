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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { Sparkles } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const { loginEmail, loginGoogle } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = React.useState(false);

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [gEmail, setGEmail] = React.useState("usuario@gmail.com");
  const [gName, setGName] = React.useState("Usuário Google");

  const submit = async () => {
    setLoading(true);
    try {
      await loginEmail(email, password);
      router.replace("/gallery");
    } catch (e: any) {
      toast({ title: "Falha no login", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const google = async () => {
    setLoading(true);
    try {
      await loginGoogle({ email: gEmail, name: gName });
      router.replace("/gallery");
    } catch (e: any) {
      toast({ title: "Erro Google", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid place-items-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="mx-auto h-12 w-12 rounded-2xl bg-gradient-to-br from-pastel-lavender via-pastel-blush to-pastel-peach grid place-items-center shadow">
            <Sparkles className="h-6 w-6 text-white" />
          </div>
          <CardTitle className="text-center mt-2">Bem-vinda(o) ao Stellar Gallery</CardTitle>
          <CardDescription className="text-center">
            Faça login para gerenciar suas galerias
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="email">
            <TabsList className="w-full grid grid-cols-2">
              <TabsTrigger value="email">Email & senha</TabsTrigger>
              <TabsTrigger value="google">Google (mock)</TabsTrigger>
            </TabsList>
            <TabsContent value="email" className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="voce@exemplo.com"
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
                />
              </div>
              <Button onClick={submit} disabled={loading} className="w-full">
                Entrar
              </Button>
            </TabsContent>
            <TabsContent value="google" className="space-y-3">
              <p className="text-xs text-muted-foreground">
                OAuth do Google está em modo mock — informe o email/nome para criar a sessão.
              </p>
              <div className="space-y-1.5">
                <Label>Email Google</Label>
                <Input
                  type="email"
                  value={gEmail}
                  onChange={(e) => setGEmail(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Nome</Label>
                <Input value={gName} onChange={(e) => setGName(e.target.value)} />
              </div>
              <Button
                onClick={google}
                disabled={loading}
                variant="secondary"
                className="w-full"
              >
                Entrar com Google (mock)
              </Button>
            </TabsContent>
          </Tabs>
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
