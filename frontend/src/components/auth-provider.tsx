"use client";
import * as React from "react";
import { useRouter, usePathname } from "next/navigation";
import { api, tokenStore } from "@/lib/api";

export type CurrentUser = {
  id: string;
  email: string;
  username: string;
  avatarUrl?: string;
};

type AuthCtx = {
  user: CurrentUser | null;
  loading: boolean;
  loginEmail: (email: string, password: string) => Promise<void>;
  signupEmail: (
    username: string,
    email: string,
    password: string,
  ) => Promise<void>;
  loginGoogle: (payload: {
    email: string;
    name: string;
  }) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
};

const Ctx = React.createContext<AuthCtx | null>(null);

const PUBLIC_ROUTES = new Set(["/login", "/signup", "/share"]);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<CurrentUser | null>(null);
  const [loading, setLoading] = React.useState(true);
  const router = useRouter();
  const pathname = usePathname();

  const fetchMe = React.useCallback(async () => {
    try {
      const me = await api<CurrentUser>("/users/me");
      setUser(me);
    } catch {
      setUser(null);
      tokenStore.clear();
    }
  }, []);

  React.useEffect(() => {
    const t = tokenStore.get();
    if (!t) {
      setLoading(false);
      return;
    }
    fetchMe().finally(() => setLoading(false));
  }, [fetchMe]);

  React.useEffect(() => {
    if (loading) return;
    const isPublic =
      PUBLIC_ROUTES.has(pathname) || pathname.startsWith("/share");
    if (!user && !isPublic) router.replace("/login");
  }, [loading, user, pathname, router]);

  const issue = (resp: any) => {
    if (resp?.accessToken) tokenStore.set(resp.accessToken);
    if (resp?.user) setUser(resp.user);
  };

  const loginEmail = async (email: string, password: string) => {
    const resp = await api("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
      auth: false,
    });
    issue(resp);
  };
  const signupEmail = async (
    username: string,
    email: string,
    password: string,
  ) => {
    const resp = await api("/auth/signup", {
      method: "POST",
      body: JSON.stringify({ username, email, password }),
      auth: false,
    });
    issue(resp);
  };
  const loginGoogle = async (payload: { email: string; name: string }) => {
    const resp = await api("/auth/google", {
      method: "POST",
      body: JSON.stringify({
        email: payload.email,
        name: payload.name,
        googleId: `google-${payload.email}`,
      }),
      auth: false,
    });
    issue(resp);
  };
  const logout = () => {
    tokenStore.clear();
    setUser(null);
    router.replace("/login");
  };

  return (
    <Ctx.Provider
      value={{
        user,
        loading,
        loginEmail,
        signupEmail,
        loginGoogle,
        logout,
        refresh: fetchMe,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const v = React.useContext(Ctx);
  if (!v) throw new Error("useAuth must be used within AuthProvider");
  return v;
}
