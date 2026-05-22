import { z } from "zod";
import { ObjectId } from "mongodb";
import { randomBytes } from "crypto";
import { FastifyTypedInstance } from "@src/shared/types/fastifyTypedInstance";
import { Albums, ShareTokens, activeFilter } from "@src/shared/db/collections";
import { getCurrentUser } from "@src/shared/middlewares/auth";
import CustomError from "@src/shared/classes/CustomError";
import config from "@config/api";

const createSchema = z.object({
  albumId: z.string(),
  name: z.string().max(80).optional(),
});

export const shareRoutes = async (app: FastifyTypedInstance) => {
  app.get(
    "/",
    { preHandler: app.authenticate, schema: { tags: ["share-tokens"] } },
    async (req) => {
      const me = getCurrentUser(req);
      const list = await ShareTokens()
        .find({ ownerId: new ObjectId(me.id) })
        .sort({ createdAt: -1 })
        .toArray();
      return list.map((t) => ({
        id: t._id!.toString(),
        token: t.token,
        name: t.name,
        albumId: t.albumId.toString(),
        revoked: !!t.revokedAt,
        lastUsedAt: t.lastUsedAt,
        createdAt: t.createdAt,
        url: `${config.app.url}/api/public/albums/${t.albumId.toString()}?token=${t.token}`,
      }));
    },
  );

  app.post(
    "/",
    {
      preHandler: app.authenticate,
      schema: { body: createSchema, tags: ["share-tokens"] },
    },
    async (req) => {
      const me = getCurrentUser(req);
      const { albumId, name } = req.body as z.infer<typeof createSchema>;
      const album = await Albums().findOne({
        _id: new ObjectId(albumId),
        ...activeFilter,
      });
      if (!album) throw new CustomError("Album not found", 404);
      // Only allowed for private user-owned albums (the requirement).
      if (album.ownerType !== "user" || album.ownerId.toString() !== me.id)
        throw new CustomError(
          "Only your own private albums can be shared via token",
          403,
        );

      const token = randomBytes(24).toString("hex");
      const doc = {
        albumId: album._id!,
        ownerId: new ObjectId(me.id),
        token,
        name,
        createdAt: new Date(),
      };
      const r = await ShareTokens().insertOne(doc as any);
      return {
        id: r.insertedId.toString(),
        token,
        name,
        albumId: album._id!.toString(),
        url: `${config.app.url}/api/public/albums/${album._id!.toString()}?token=${token}`,
        createdAt: doc.createdAt,
      };
    },
  );

  app.delete(
    "/:id",
    {
      preHandler: app.authenticate,
      schema: {
        params: z.object({ id: z.string() }),
        tags: ["share-tokens"],
      },
    },
    async (req) => {
      const me = getCurrentUser(req);
      const { id } = req.params as { id: string };
      const t = await ShareTokens().findOne({ _id: new ObjectId(id) });
      if (!t) throw new CustomError("Token not found", 404);
      if (t.ownerId.toString() !== me.id)
        throw new CustomError("Forbidden", 403);
      await ShareTokens().updateOne(
        { _id: t._id! },
        { $set: { revokedAt: new Date() } },
      );
      return { ok: true };
    },
  );
};
