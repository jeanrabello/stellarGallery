"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (loading) return;
    router.replace(user ? "/gallery" : "/login");
  }, [user, loading, router]);
  return (
    <div className="min-h-screen grid place-items-center text-muted-foreground">
      Carregando…
    </div>
  );
}
