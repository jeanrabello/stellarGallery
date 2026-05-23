import { z } from "zod";
import { ObjectId } from "mongodb";
import { FastifyTypedInstance } from "@src/shared/types/fastifyTypedInstance";
import {
  Albums,
  AlbumDoc,
  Groups,
  Photos,
  activeFilter,
} from "@src/shared/db/collections";
import { getCurrentUser } from "@src/shared/middlewares/auth";
import { signedObjectUrl } from "@src/loaders/s3";
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

const setCoverSchema = z.object({
  photoId: z.string(),
});

const albumToDto = (
  a: AlbumDoc & { coverUrl?: string | null },
) => ({
  id: a._id!.toString(),
  name: a.name,
  description: a.description,
  ownerType: a.ownerType,
  ownerId: a.ownerId.toString(),
  position: a.position,
  coverUrl: a.coverUrl ?? null,
  coverPhotoId: a.coverPhotoId ? a.coverPhotoId.toString() : null,
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
  const g = await Groups().findOne({ _id: album.ownerId, ...activeFilter });
  if (!g) throw new CustomError("Group not found", 404);
  const isMember = g.members.some((m) => m.toString() === userId);
  if (!isMember && g.visibility !== "public")
    throw new CustomError("Forbidden", 403);
};

// For each album: cover = chosen coverPhotoId (if still active) OR first active photo.
// We sign the corresponding S3 key on demand instead of returning a raw URL.
const decorateCovers = async (
  albums: AlbumDoc[],
): Promise<(AlbumDoc & { coverUrl: string | null })[]> => {
  if (albums.length === 0) return [];
  const ids = albums.map((a) => a._id!);

  const chosenIds = albums
    .map((a) => a.coverPhotoId)
    .filter((x): x is ObjectId => !!x);

  const chosenPhotos = chosenIds.length
    ? await Photos()
        .find({ _id: { $in: chosenIds }, ...activeFilter })
        .toArray()
    : [];
  const chosenKeyById = new Map(
    chosenPhotos.map((p) => [p._id!.toString(), p.s3Key]),
  );

  const firstPhotos = await Photos()
    .aggregate([
      { $match: { albumId: { $in: ids }, ...activeFilter } },
      { $sort: { position: 1, createdAt: 1 } },
      {
        $group: {
          _id: "$albumId",
          firstS3Key: { $first: "$s3Key" },
        },
      },
    ])
    .toArray();
  const firstKeyByAlbum = new Map(
    firstPhotos.map((p: any) => [p._id.toString(), p.firstS3Key]),
  );

  return Promise.all(
    albums.map(async (a) => {
      const chosenKey =
        a.coverPhotoId && chosenKeyById.get(a.coverPhotoId.toString());
      const key =
        chosenKey || firstKeyByAlbum.get(a._id!.toString()) || null;
      const coverUrl = key ? await signedObjectUrl(key) : null;
      return { ...a, coverUrl };
    }),
  );
};

export const albumRoutes = async (app: FastifyTypedInstance) => {
  // My private albums
  app.get(
    "/mine",
    { preHandler: app.authenticate, schema: { tags: ["albums"] } },
    async (req) => {
      const me = getCurrentUser(req);
      const list = await Albums()
        .find({
          ownerType: "user",
          ownerId: new ObjectId(me.id),
          ...activeFilter,
        })
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
      const g = await Groups().findOne({
        _id: new ObjectId(groupId),
        ...activeFilter,
      });
      if (!g) throw new CustomError("Group not found", 404);
      const isMember = g.members.some((m) => m.toString() === me.id);
      if (!isMember && g.visibility !== "public")
        throw new CustomError("Forbidden", 403);

      const list = await Albums()
        .find({
          ownerType: "group",
          ownerId: new ObjectId(groupId),
          ...activeFilter,
        })
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
        const g = await Groups().findOne({
          _id: new ObjectId(body.groupId),
          ...activeFilter,
        });
        if (!g) throw new CustomError("Group not found", 404);
        const isMember = g.members.some((m) => m.toString() === me.id);
        if (!isMember) throw new CustomError("Forbidden", 403);
        ownerId = g._id!;
      }

      const lastPos = await Albums()
        .find({ ownerType: body.ownerType, ownerId, ...activeFilter })
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
        status: "active",
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
      const a = await Albums().findOne({
        _id: new ObjectId(id),
        ...activeFilter,
      });
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
      const a = await Albums().findOne({
        _id: new ObjectId(id),
        ...activeFilter,
      });
      if (!a) throw new CustomError("Album not found", 404);
      await ensureUserCanAccessAlbum(a, me.id);
      if (a.ownerType === "group") {
        const g = await Groups().findOne({ _id: a.ownerId, ...activeFilter });
        if (!g || g.ownerId.toString() !== me.id)
          throw new CustomError("Only group owner can delete", 403);
      }
      const now = new Date();
      await Photos().updateMany(
        { albumId: a._id! },
        { $set: { status: "deleted", deletedAt: now } },
      );
      await Albums().updateOne(
        { _id: a._id! },
        { $set: { status: "deleted", deletedAt: now } },
      );
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
        const g = await Groups().findOne({ _id: ownerId, ...activeFilter });
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
            ...activeFilter,
          },
          update: { $set: { position: idx } },
        },
      }));
      if (ops.length) await Albums().bulkWrite(ops);
      return { ok: true };
    },
  );

  // Set album cover photo
  app.patch(
    "/:id/cover",
    {
      preHandler: app.authenticate,
      schema: {
        params: z.object({ id: z.string() }),
        body: setCoverSchema,
        tags: ["albums"],
      },
    },
    async (req) => {
      const me = getCurrentUser(req);
      const { id } = req.params as { id: string };
      const { photoId } = req.body as z.infer<typeof setCoverSchema>;
      const a = await Albums().findOne({
        _id: new ObjectId(id),
        ...activeFilter,
      });
      if (!a) throw new CustomError("Album not found", 404);
      await ensureUserCanAccessAlbum(a, me.id);

      const photo = await Photos().findOne({
        _id: new ObjectId(photoId),
        albumId: a._id!,
        ...activeFilter,
      });
      if (!photo) throw new CustomError("Photo not in this album", 404);

      await Albums().updateOne(
        { _id: a._id! },
        { $set: { coverPhotoId: photo._id! } },
      );
      const updated = { ...a, coverPhotoId: photo._id! };
      const [decorated] = await decorateCovers([updated]);
      return albumToDto(decorated);
    },
  );
};
