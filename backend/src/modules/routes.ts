import { FastifyTypedInstance } from "@src/shared/types/fastifyTypedInstance";
import { authRoutes } from "@modules/auth/auth.routes";
import { groupRoutes } from "@modules/groups/groups.routes";
import { albumRoutes } from "@modules/albums/albums.routes";
import { photoRoutes } from "@modules/photos/photos.routes";
import { inviteRoutes } from "@modules/invites/invites.routes";
import { shareRoutes } from "@modules/share/share.routes";
import { publicShareRoutes } from "@modules/share/publicShare.routes";
import { meRoutes } from "@modules/users/users.routes";
import config from "@config/api";

export const routes = (app: FastifyTypedInstance) => {
  app.register(authRoutes, { prefix: "/auth" });
  app.register(meRoutes, { prefix: "/users" });
  app.register(groupRoutes, { prefix: "/groups" });
  app.register(albumRoutes, { prefix: "/albums" });
  app.register(photoRoutes, { prefix: "/photos" });
  app.register(inviteRoutes, { prefix: "/invites" });
  app.register(shareRoutes, { prefix: "/share-tokens" });
  app.register(publicShareRoutes, { prefix: "/public" });

  // Liveness probe — no DB/S3 dependencies so the platform health check
  // never trips because of a slow downstream.
  app.get("/health", { schema: { hide: true } }, async () => ({
    status: "ok",
    env: config.app.env,
    uptime: process.uptime(),
  }));
};
