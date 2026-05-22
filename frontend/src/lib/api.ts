const PUBLIC_API =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api";

export type ApiOptions = RequestInit & { auth?: boolean; raw?: boolean };

const tokenKey = "stellar.token";

export const tokenStore = {
  get(): string | null {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(tokenKey);
  },
  set(token: string) {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(tokenKey, token);
  },
  clear() {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(tokenKey);
  },
};

export async function api<T = any>(
  path: string,
  options: ApiOptions = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  if (!(options.body instanceof FormData)) {
    if (!headers.has("Content-Type") && options.body) {
      headers.set("Content-Type", "application/json");
    }
  }
  if (options.auth !== false) {
    const t = tokenStore.get();
    if (t) headers.set("Authorization", `Bearer ${t}`);
  }
  const res = await fetch(`${PUBLIC_API}${path}`, {
    ...options,
    headers,
    cache: "no-store",
  });
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = await res.json();
      message = body?.message || message;
    } catch {}
    throw new Error(message);
  }
  if (options.raw) return res as unknown as T;
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
