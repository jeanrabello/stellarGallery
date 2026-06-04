import { afterEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";

// CORS behaves differently per environment and per route scope, and the
// effective rules are decided at module-import time (config/api.ts snapshots
// process.env once). So each case resets the module registry, stubs the env,
// then dynamically imports a fresh app. No DB/S3 needed: CORS runs in the
// onRequest hook and OPTIONS preflights short-circuit before any handler.

const FRONTEND = "https://stellar-frontend.example";
const THIRD_PARTY = "https://some-birthday-site.example";

const buildFreshApp = async (env: string): Promise<FastifyInstance> => {
  vi.resetModules();
  vi.stubEnv("NODE_ENV", env);
  vi.stubEnv("FRONTEND_URL", FRONTEND);
  const { buildApp } = await import("@src/app");
  const app = buildApp({ logger: false });
  await app.ready();
  return app as unknown as FastifyInstance;
};

const preflight = (app: FastifyInstance, url: string, origin: string) =>
  app.inject({
    method: "OPTIONS",
    url,
    headers: {
      origin,
      "access-control-request-method": "GET",
    },
  });

let app: FastifyInstance | undefined;

afterEach(async () => {
  if (app) await app.close();
  app = undefined;
  vi.unstubAllEnvs();
});

describe("CORS — production", () => {
  it("allows the configured frontend on a normal (non-public) route", async () => {
    app = await buildFreshApp("production");
    const res = await preflight(app, "/api/albums", FRONTEND);
    expect(res.headers["access-control-allow-origin"]).toBe(FRONTEND);
  });

  it("blocks an arbitrary third-party origin on a normal route", async () => {
    app = await buildFreshApp("production");
    const res = await preflight(app, "/api/albums", THIRD_PARTY);
    // The global rule rejects unknown origins → no allow-origin header.
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("allows ANY origin on the public share scope", async () => {
    app = await buildFreshApp("production");
    const res = await preflight(
      app,
      "/api/public/albums/abc123",
      THIRD_PARTY,
    );
    // Public scope reflects the requesting origin so static third-party sites
    // can embed a shared album from anywhere.
    expect(res.headers["access-control-allow-origin"]).toBe(THIRD_PARTY);
    // ...and never claims credentials (would be invalid alongside a reflected
    // origin, and these routes are token-authenticated, not cookie-based).
    expect(res.headers["access-control-allow-credentials"]).toBeUndefined();
  });
});

describe("CORS — development", () => {
  it("allows any origin everywhere", async () => {
    app = await buildFreshApp("development");
    const normal = await preflight(app, "/api/albums", THIRD_PARTY);
    expect(normal.headers["access-control-allow-origin"]).toBe(THIRD_PARTY);
    const pub = await preflight(
      app,
      "/api/public/albums/abc123",
      THIRD_PARTY,
    );
    expect(pub.headers["access-control-allow-origin"]).toBe(THIRD_PARTY);
  });
});
