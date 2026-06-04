import { z } from "zod";
import { ObjectId } from "mongodb";
import { FastifyTypedInstance } from "@src/shared/types/fastifyTypedInstance";
import {
  Albums,
  Groups,
  Photos,
  ShareTokens,
  Users,
  activeFilter,
} from "@src/shared/db/collections";
import { signedObjectUrl } from "@src/loaders/s3";
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
      // CORS for this scope is opened to any origin in app.ts (the global
      // delegator detects the /api/public prefix), because it's authenticated
      // by ?token= / x-share-token rather than cookies.
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
      const album = await Albums().findOne({
        _id: new ObjectId(albumId),
        ...activeFilter,
      });
      if (!album) throw new CustomError("Album not found", 404);

      // Resolve the "owner" to display. For group albums, album.ownerId is a
      // GROUP id — we must look up the group (and ensure it's still active, so
      // a revoked/deleted group can't keep leaking its albums through an old
      // token) and then resolve the group's owner user. For user albums the
      // ownerId is the user directly.
      let owner;
      if (album.ownerType === "group") {
        const group = await Groups().findOne({
          _id: album.ownerId,
          ...activeFilter,
        });
        if (!group) throw new CustomError("Album not found", 404);
        owner = await Users().findOne({ _id: group.ownerId });
      } else {
        owner = await Users().findOne({ _id: album.ownerId });
      }

      const photos = await Photos()
        .find({ albumId: album._id!, ...activeFilter })
        .sort({ position: 1, createdAt: 1 })
        .toArray();

      const uploaderIds = Array.from(
        new Set(photos.map((p) => p.uploaderId.toString())),
      ).map((id) => new ObjectId(id));
      const uploaders = uploaderIds.length
        ? await Users()
            .find({ _id: { $in: uploaderIds } })
            .project({ firstName: 1, lastName: 1, username: 1, email: 1 })
            .toArray()
        : [];
      const fullNameById = new Map(
        uploaders.map((u: any) => {
          const full = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
          return [u._id.toString(), full || u.username || u.email];
        }),
      );

      const ownerFullName = owner
        ? [owner.firstName, owner.lastName].filter(Boolean).join(" ").trim() ||
          owner.username
        : null;

      return {
        album: {
          id: album._id!.toString(),
          name: album.name,
          description: album.description,
          owner: owner
            ? {
                id: owner._id!.toString(),
                username: owner.username,
                displayName: ownerFullName,
              }
            : null,
          createdAt: album.createdAt,
        },
        photos: await Promise.all(
          photos.map(async (p) => ({
            id: p._id!.toString(),
            url: await signedObjectUrl(p.s3Key),
            contentType: p.contentType,
            uploaderName:
              fullNameById.get(p.uploaderId.toString()) || p.uploaderName,
            comment: p.comment,
            createdAt: p.createdAt,
          })),
        ),
      };
    },
  );
};
