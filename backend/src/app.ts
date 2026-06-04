import config from "@config/api";
import { fastifyCors } from "@fastify/cors";
import multipart from "@fastify/multipart";
import authMiddleware from "@src/shared/middlewares/auth";
import errorHandler from "@src/shared/middlewares/errorHandler";
import { routes } from "@modules/routes";
import { rateLimitPlugin, swaggerPlugin } from "@plugins/index";
import { fastify } from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
  ZodTypeProvider,
} from "fastify-type-provider-zod";
import { FastifyTypedInstance } from "@src/shared/types/fastifyTypedInstance";

export interface BuildAppOptions {
  /** Disable Fastify's request logger (handy in tests). Defaults to true. */
  logger?: boolean;
}

/**
 * Build a fully configured Fastify instance WITHOUT binding a port or
 * connecting to downstreams. Tests use this with `app.inject()`; `server.ts`
 * uses it as the base for the long-running process. Keeping construction and
 * startup separate means importing the app never triggers a listen().
 */
export const buildApp = (
  options: BuildAppOptions = {},
): FastifyTypedInstance => {
  const app = fastify({
    logger: options.logger ?? true,
    // Trust X-Forwarded-* — required behind Render/Vercel/Cloudflare/etc.
    // so req.ip and req.protocol reflect the real client.
    trustProxy: true,
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // CORS: in production lock to the configured FRONTEND_URL; in dev allow any
  // origin so localhost ports and tunnels Just Work. The `/api/public` share
  // endpoints are an exception — they're authenticated by a `?token=` (not
  // cookies) and meant to be embedded by arbitrary third-party sites, so they
  // must answer ANY origin. A `delegator` resolves the options per request
  // (the plain `origin` callback can't see the URL): public routes reflect the
  // origin WITHOUT credentials (wildcard origin + credentials is spec-illegal,
  // and these routes never read cookies), everything else keeps the locked
  // credentialed policy.
  const devMode = config.app.env !== "production";
  app.register(fastifyCors, {
    delegator(req, cb) {
      const isPublic = (req.url || "").startsWith("/api/public");
      if (isPublic) {
        return cb(null, { origin: true, credentials: false });
      }
      return cb(null, {
        origin: devMode ? true : [config.app.frontendUrl],
        credentials: true,
      });
    },
  });
  app.register(multipart, {
    limits: { fileSize: 25 * 1024 * 1024 },
  });

  swaggerPlugin(app);
  rateLimitPlugin(app);
  authMiddleware(app);
  errorHandler(app);

  app.register(routes, { prefix: "/api" });

  return app;
};

// Default export kept for callers that just want a ready-to-use instance.
const app = buildApp();

export default app;
