"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LogOut, Sparkles, Images, Users, Link2 } from "lucide-react";

const navItems = [
  { href: "/gallery", label: "Minha galeria", icon: Images },
  { href: "/groups", label: "Grupos", icon: Users },
  { href: "/shares", label: "Compartilhamentos", icon: Link2 },
];

export function SiteShell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const pathname = usePathname();

  if (!user) return <>{children}</>;
  const displayName = user.displayName || user.username;

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-30 bg-white/65 backdrop-blur border-b">
        <div className="container flex items-center justify-between h-14 sm:h-16">
          <Link href="/gallery" className="flex items-center gap-2 min-w-0">
            <div className="h-8 w-8 sm:h-9 sm:w-9 rounded-2xl bg-gradient-to-br from-pastel-lavender via-pastel-blush to-pastel-peach grid place-items-center shadow shrink-0">
              <Sparkles className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
            </div>
            <span className="font-semibold tracking-tight truncate text-sm sm:text-base">
              Stellar Gallery
            </span>
          </Link>
          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active =
                pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium",
                    active
                      ? "bg-primary/20 text-foreground"
                      : "hover:bg-accent/50",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="flex items-center gap-2 min-w-0">
            <div className="text-right hidden sm:block min-w-0">
              <div className="text-sm font-medium truncate max-w-[140px]">
                {displayName}
              </div>
              <div className="text-xs text-muted-foreground truncate max-w-[140px]">
                @{user.username}
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={logout} title="Sair">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <nav className="md:hidden container flex items-center gap-1 pb-2 overflow-x-auto scrollbar-none">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active =
              pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex-1 min-w-[110px] inline-flex items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-xs font-medium",
                  active ? "bg-primary/20" : "hover:bg-accent/50",
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>
      <main className="flex-1 container py-5 sm:py-8">{children}</main>
    </div>
  );
}
