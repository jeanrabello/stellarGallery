import { z } from "zod";
import { ObjectId } from "mongodb";
import { FastifyTypedInstance } from "@src/shared/types/fastifyTypedInstance";
import {
  Albums,
  Photos,
  ShareTokens,
  Users,
} from "@src/shared/db/collections";
import CustomError from "@src/shared/classes/CustomError";

const validateToken = async (albumId: string, token: string) => {
  const t = await ShareTokens().findOne({
    albumId: new ObjectId(albumId),
    token,
  });
  if (!t || t.revokedAt) throw new CustomError("Invalid or revoked token", 401);
  await ShareTokens().updateOne(
    { _id: t._id! },
    { $set: { lastUsedAt: new Date() } },
  );
  return t;
};

// Public endpoints for third-party apps using a share token.
// Two ways to authenticate: ?token=<t> query OR header `x-share-token: <t>`.
export const publicShareRoutes = async (app: FastifyTypedInstance) => {
  app.get(
    "/albums/:albumId",
    {
      schema: {
        params: z.object({ albumId: z.string() }),
        querystring: z.object({ token: z.string().optional() }),
        tags: ["public"],
      },
    },
    async (req) => {
      const { albumId } = req.params as { albumId: string };
      const headerToken = (req.headers["x-share-token"] as string) || "";
      const queryToken =
        (req.query as { token?: string })?.token || "";
      const token = headerToken || queryToken;
      if (!token) throw new CustomError("Share token required", 401);

      await validateToken(albumId, token);
      const album = await Albums().findOne({ _id: new ObjectId(albumId) });
      if (!album) throw new CustomError("Album not found", 404);
      const owner = await Users().findOne({ _id: album.ownerId });

      const photos = await Photos()
        .find({ albumId: album._id! })
        .sort({ position: 1, createdAt: 1 })
        .toArray();

      return {
        album: {
          id: album._id!.toString(),
          name: album.name,
          description: album.description,
          owner: owner
            ? { id: owner._id!.toString(), username: owner.username }
            : null,
          createdAt: album.createdAt,
        },
        photos: photos.map((p) => ({
          id: p._id!.toString(),
          url: p.url,
          contentType: p.contentType,
          uploaderName: p.uploaderName,
          comment: p.comment,
          createdAt: p.createdAt,
        })),
      };
    },
  );
};
