"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { StarLoader } from "@/components/ui/star-loader";

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (loading) return;
    router.replace(user ? "/gallery" : "/login");
  }, [user, loading, router]);
  return <StarLoader />;
}
