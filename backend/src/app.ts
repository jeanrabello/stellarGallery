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
import { initializeLoaders } from "./loaders/index";

const app = fastify({
  logger: true,
  // Trust X-Forwarded-* — required behind Render/Vercel/Cloudflare/etc.
  // so req.ip and req.protocol reflect the real client.
  trustProxy: true,
}).withTypeProvider<ZodTypeProvider>();

app.setValidatorCompiler(validatorCompiler);
app.setSerializerCompiler(serializerCompiler);

// CORS: in production lock to the configured FRONTEND_URL; in dev allow
// any origin so localhost ports and tunnels Just Work.
const corsOrigin =
  config.app.env === "production"
    ? [config.app.frontendUrl]
    : true;
app.register(fastifyCors, { origin: corsOrigin, credentials: true });
app.register(multipart, {
  limits: { fileSize: 25 * 1024 * 1024 },
});

swaggerPlugin(app);
rateLimitPlugin(app);
authMiddleware(app);
errorHandler(app);

// Cheap liveness probe — no DB/S3 dependencies so the platform's health
// check never trips because of a slow downstream.
app.get("/api/health", { schema: { hide: true } }, async () => ({
  status: "ok",
  env: config.app.env,
  uptime: process.uptime(),
}));

app.register(routes, { prefix: "/api" });

const startServer = async () => {
  try {
    await initializeLoaders();
    const address = await app.listen({
      port: config.app.port,
      host: config.app.host,
    });
    console.log(`Server listening at ${address}`);
  } catch (err) {
    app.log.error(err);
    console.error("Failed to start application:", err);
    process.exit(1);
  }
};

startServer();

export default app;
