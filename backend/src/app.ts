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

const app = fastify({ logger: true }).withTypeProvider<ZodTypeProvider>();

app.setValidatorCompiler(validatorCompiler);
app.setSerializerCompiler(serializerCompiler);

app.register(fastifyCors, { origin: true, credentials: true });
app.register(multipart, {
  limits: { fileSize: 25 * 1024 * 1024 },
});

swaggerPlugin(app);
rateLimitPlugin(app);
authMiddleware(app);
errorHandler(app);

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
