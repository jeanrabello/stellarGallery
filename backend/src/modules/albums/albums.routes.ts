import { z } from "zod";
import { ObjectId } from "mongodb";
import { FastifyTypedInstance } from "@src/shared/types/fastifyTypedInstance";
import {
  Albums,
  AlbumDoc,
  Groups,
  Photos,
} from "@src/shared/db/collections";
import { getCurrentUser } from "@src/shared/middlewares/auth";
import CustomError from "@src/shared/classes/CustomError";

const createSchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(500).optional(),
  ownerType: z.enum(["user", "group"]),
  groupId: z.string().optional(),
});

const reorderSchema = z.object({
  orderedIds: z.array(z.string()).min(1),
});

const albumToDto = (a: AlbumDoc & { coverUrl?: string | null }) => ({
  id: a._id!.toString(),
  name: a.name,
  description: a.description,
  ownerType: a.ownerType,
  ownerId: a.ownerId.toString(),
  position: a.position,
  coverUrl: a.coverUrl ?? null,
  createdAt: a.createdAt,
});

const ensureUserCanAccessAlbum = async (
  album: AlbumDoc,
  userId: string,
): Promise<void> => {
  if (album.ownerType === "user") {
    if (album.ownerId.toString() !== userId)
      throw new CustomError("Forbidden", 403);
    return;
  }
  const g = await Groups().findOne({ _id: album.ownerId });
  if (!g) throw new CustomError("Group not found", 404);
  const isMember = g.members.some((m) => m.toString() === userId);
  if (!isMember && g.visibility !== "public")
    throw new CustomError("Forbidden", 403);
};

const decorateCovers = async (
  albums: AlbumDoc[],
): Promise<(AlbumDoc & { coverUrl: string | null })[]> => {
  if (albums.length === 0) return [];
  const ids = albums.map((a) => a._id!);
  const photos = await Photos()
    .aggregate([
      { $match: { albumId: { $in: ids } } },
      { $sort: { position: 1, createdAt: 1 } },
      {
        $group: {
          _id: "$albumId",
          firstUrl: { $first: "$url" },
        },
      },
    ])
    .toArray();
  const map = new Map(photos.map((p: any) => [p._id.toString(), p.firstUrl]));
  return albums.map((a) => ({
    ...a,
    coverUrl: map.get(a._id!.toString()) ?? null,
  }));
};

export const albumRoutes = async (app: FastifyTypedInstance) => {
  // My private albums
  app.get(
    "/mine",
    { preHandler: app.authenticate, schema: { tags: ["albums"] } },
    async (req) => {
      const me = getCurrentUser(req);
      const list = await Albums()
        .find({ ownerType: "user", ownerId: new ObjectId(me.id) })
        .sort({ position: 1, createdAt: 1 })
        .toArray();
      const decorated = await decorateCovers(list);
      return decorated.map(albumToDto);
    },
  );

  // Group albums
  app.get(
    "/group/:groupId",
    {
      preHandler: app.authenticate,
      schema: {
        params: z.object({ groupId: z.string() }),
        tags: ["albums"],
      },
    },
    async (req) => {
      const me = getCurrentUser(req);
      const { groupId } = req.params as { groupId: string };
      const g = await Groups().findOne({ _id: new ObjectId(groupId) });
      if (!g) throw new CustomError("Group not found", 404);
      const isMember = g.members.some((m) => m.toString() === me.id);
      if (!isMember && g.visibility !== "public")
        throw new CustomError("Forbidden", 403);

      const list = await Albums()
        .find({ ownerType: "group", ownerId: new ObjectId(groupId) })
        .sort({ position: 1, createdAt: 1 })
        .toArray();
      const decorated = await decorateCovers(list);
      return decorated.map(albumToDto);
    },
  );

  app.post(
    "/",
    {
      preHandler: app.authenticate,
      schema: { body: createSchema, tags: ["albums"] },
    },
    async (req) => {
      const me = getCurrentUser(req);
      const body = req.body as z.infer<typeof createSchema>;

      let ownerId: ObjectId;
      if (body.ownerType === "user") {
        ownerId = new ObjectId(me.id);
      } else {
        if (!body.groupId)
          throw new CustomError("groupId required for group albums", 400);
        const g = await Groups().findOne({ _id: new ObjectId(body.groupId) });
        if (!g) throw new CustomError("Group not found", 404);
        const isMember = g.members.some((m) => m.toString() === me.id);
        if (!isMember) throw new CustomError("Forbidden", 403);
        ownerId = g._id!;
      }

      const lastPos = await Albums()
        .find({ ownerType: body.ownerType, ownerId })
        .sort({ position: -1 })
        .limit(1)
        .toArray();
      const position = lastPos.length ? lastPos[0].position + 1 : 0;

      const doc: AlbumDoc = {
        name: body.name,
        description: body.description,
        ownerType: body.ownerType,
        ownerId,
        position,
        createdAt: new Date(),
      };
      const r = await Albums().insertOne(doc as any);
      return albumToDto({ ...doc, _id: r.insertedId, coverUrl: null });
    },
  );

  app.get(
    "/:id",
    {
      preHandler: app.authenticate,
      schema: {
        params: z.object({ id: z.string() }),
        tags: ["albums"],
      },
    },
    async (req) => {
      const me = getCurrentUser(req);
      const { id } = req.params as { id: string };
      const a = await Albums().findOne({ _id: new ObjectId(id) });
      if (!a) throw new CustomError("Album not found", 404);
      await ensureUserCanAccessAlbum(a, me.id);
      const [decorated] = await decorateCovers([a]);
      return albumToDto(decorated);
    },
  );

  app.delete(
    "/:id",
    {
      preHandler: app.authenticate,
      schema: {
        params: z.object({ id: z.string() }),
        tags: ["albums"],
      },
    },
    async (req) => {
      const me = getCurrentUser(req);
      const { id } = req.params as { id: string };
      const a = await Albums().findOne({ _id: new ObjectId(id) });
      if (!a) throw new CustomError("Album not found", 404);
      await ensureUserCanAccessAlbum(a, me.id);
      // For group albums only owner of group can delete
      if (a.ownerType === "group") {
        const g = await Groups().findOne({ _id: a.ownerId });
        if (!g || g.ownerId.toString() !== me.id)
          throw new CustomError("Only group owner can delete", 403);
      }
      await Photos().deleteMany({ albumId: a._id! });
      await Albums().deleteOne({ _id: a._id! });
      return { ok: true };
    },
  );

  // Reorder albums of user or group
  app.post(
    "/reorder",
    {
      preHandler: app.authenticate,
      schema: {
        body: reorderSchema.extend({
          ownerType: z.enum(["user", "group"]),
          groupId: z.string().optional(),
        }),
        tags: ["albums"],
      },
    },
    async (req) => {
      const me = getCurrentUser(req);
      const body = req.body as any;
      const ownerId =
        body.ownerType === "user"
          ? new ObjectId(me.id)
          : new ObjectId(body.groupId);

      if (body.ownerType === "group") {
        const g = await Groups().findOne({ _id: ownerId });
        if (!g) throw new CustomError("Group not found", 404);
        const isMember = g.members.some((m) => m.toString() === me.id);
        if (!isMember) throw new CustomError("Forbidden", 403);
      }

      const ops = (body.orderedIds as string[]).map((id, idx) => ({
        updateOne: {
          filter: {
            _id: new ObjectId(id),
            ownerType: body.ownerType,
            ownerId,
          },
          update: { $set: { position: idx } },
        },
      }));
      if (ops.length) await Albums().bulkWrite(ops);
      return { ok: true };
    },
  );
};
