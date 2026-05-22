"use client";
import * as React from "react";
import { useRouter, usePathname } from "next/navigation";
import { api, tokenStore } from "@/lib/api";

export type CurrentUser = {
  id: string;
  email: string;
  username: string;
  firstName?: string;
  lastName?: string;
  displayName?: string;
  avatarUrl?: string;
};

type AuthCtx = {
  user: CurrentUser | null;
  loading: boolean;
  loginEmail: (identifier: string, password: string) => Promise<void>;
  signupEmail: (data: {
    firstName: string;
    lastName: string;
    username: string;
    email: string;
    password: string;
  }) => Promise<void>;
  loginGoogle: (payload: {
    idToken?: string;
    accessToken?: string;
    email?: string;
    firstName?: string;
    lastName?: string;
    name?: string;
    googleId?: string;
    avatarUrl?: string;
  }) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
};

const Ctx = React.createContext<AuthCtx | null>(null);

const PUBLIC_ROUTES = new Set(["/login", "/signup", "/share", "/google-mock"]);

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
      PUBLIC_ROUTES.has(pathname) ||
      pathname.startsWith("/share") ||
      pathname.startsWith("/google-mock");
    if (!user && !isPublic) router.replace("/login");
  }, [loading, user, pathname, router]);

  const issue = (resp: any) => {
    if (resp?.accessToken) tokenStore.set(resp.accessToken);
    if (resp?.user) setUser(resp.user);
  };

  const loginEmail = async (identifier: string, password: string) => {
    const resp = await api("/auth/login", {
      method: "POST",
      body: JSON.stringify({ identifier, password }),
      auth: false,
    });
    issue(resp);
  };
  const signupEmail = async (data: {
    firstName: string;
    lastName: string;
    username: string;
    email: string;
    password: string;
  }) => {
    const resp = await api("/auth/signup", {
      method: "POST",
      body: JSON.stringify(data),
      auth: false,
    });
    issue(resp);
  };
  const loginGoogle = async (payload: {
    idToken?: string;
    accessToken?: string;
    email?: string;
    firstName?: string;
    lastName?: string;
    name?: string;
    googleId?: string;
    avatarUrl?: string;
  }) => {
    const body: Record<string, unknown> = {};
    if (payload.idToken) body.idToken = payload.idToken;
    if (payload.accessToken) body.accessToken = payload.accessToken;
    if (payload.email) body.email = payload.email;
    if (payload.firstName) body.firstName = payload.firstName;
    if (payload.lastName) body.lastName = payload.lastName;
    if (payload.name) body.name = payload.name;
    else if (payload.firstName || payload.lastName)
      body.name = `${payload.firstName || ""} ${payload.lastName || ""}`.trim();
    if (payload.googleId) body.googleId = payload.googleId;
    else if (payload.email) body.googleId = `google-${payload.email}`;
    if (payload.avatarUrl) body.avatarUrl = payload.avatarUrl;
    const resp = await api("/auth/google", {
      method: "POST",
      body: JSON.stringify(body),
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
