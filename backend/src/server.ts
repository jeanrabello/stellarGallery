import "@src/config/env";
import config from "@config/api";
import app from "./app";
import { initializeLoaders } from "./loaders/index";

const startServer = async () => {
  try {
    await initializeLoaders();
    const address = await app.listen({
      port: config.app.port,
      host: config.app.host,
    });
    console.log(`Server listening at ${address}`);
    await app.ready();
    console.log("Server initialized and ready to run!");
  } catch (err) {
    app.log.error(err);
    console.error("Failed to start application:", err);
    process.exit(1);
  }
};

startServer();

export default app;
