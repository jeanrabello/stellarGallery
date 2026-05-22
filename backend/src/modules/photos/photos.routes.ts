import { z } from "zod";
import { ObjectId } from "mongodb";
import { randomBytes } from "crypto";
import { PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { FastifyTypedInstance } from "@src/shared/types/fastifyTypedInstance";
import {
  Albums,
  Groups,
  Photos,
  Users,
  PhotoDoc,
  AlbumDoc,
} from "@src/shared/db/collections";
import { getCurrentUser } from "@src/shared/middlewares/auth";
import { getS3Client } from "@src/loaders/s3";
import CustomError from "@src/shared/classes/CustomError";
import config from "@config/api";

const ensureAlbumWriteAccess = async (album: AlbumDoc, userId: string) => {
  if (album.ownerType === "user") {
    if (album.ownerId.toString() !== userId)
      throw new CustomError("Forbidden", 403);
    return;
  }
  const g = await Groups().findOne({ _id: album.ownerId });
  if (!g) throw new CustomError("Group not found", 404);
  if (!g.members.some((m) => m.toString() === userId))
    throw new CustomError("Forbidden", 403);
};

const toDto = (p: PhotoDoc) => ({
  id: p._id!.toString(),
  albumId: p.albumId.toString(),
  uploaderId: p.uploaderId.toString(),
  uploaderName: p.uploaderName,
  comment: p.comment,
  url: p.url,
  contentType: p.contentType,
  size: p.size,
  position: p.position,
  createdAt: p.createdAt,
});

export const photoRoutes = async (app: FastifyTypedInstance) => {
  // List photos of an album
  app.get(
    "/album/:albumId",
    {
      preHandler: app.authenticate,
      schema: {
        params: z.object({ albumId: z.string() }),
        tags: ["photos"],
      },
    },
    async (req) => {
      const me = getCurrentUser(req);
      const { albumId } = req.params as { albumId: string };
      const album = await Albums().findOne({ _id: new ObjectId(albumId) });
      if (!album) throw new CustomError("Album not found", 404);

      // read access (group public allowed)
      if (album.ownerType === "user") {
        if (album.ownerId.toString() !== me.id)
          throw new CustomError("Forbidden", 403);
      } else {
        const g = await Groups().findOne({ _id: album.ownerId });
        if (!g) throw new CustomError("Group not found", 404);
        const isMember = g.members.some((m) => m.toString() === me.id);
        if (!isMember && g.visibility !== "public")
          throw new CustomError("Forbidden", 403);
      }

      const list = await Photos()
        .find({ albumId: album._id! })
        .sort({ position: 1, createdAt: 1 })
        .toArray();
      return list.map(toDto);
    },
  );

  // Upload (multipart) — fields: albumId, comment (optional), file
  app.post(
    "/upload",
    { preHandler: app.authenticate, schema: { tags: ["photos"] } },
    async (req) => {
      const me = getCurrentUser(req);

      const parts = req.parts();
      let albumId: string | undefined;
      let comment: string | undefined;
      let fileBuffer: Buffer | undefined;
      let filename = "upload.bin";
      let contentType = "application/octet-stream";

      for await (const part of parts) {
        if (part.type === "field") {
          if (part.fieldname === "albumId") albumId = String(part.value);
          if (part.fieldname === "comment") comment = String(part.value);
        } else if (part.type === "file") {
          filename = part.filename || filename;
          contentType = part.mimetype || contentType;
          const chunks: Buffer[] = [];
          for await (const chunk of part.file) chunks.push(chunk as Buffer);
          fileBuffer = Buffer.concat(chunks);
        }
      }

      if (!albumId) throw new CustomError("albumId required", 400);
      if (!fileBuffer) throw new CustomError("file required", 400);

      const album = await Albums().findOne({ _id: new ObjectId(albumId) });
      if (!album) throw new CustomError("Album not found", 404);
      await ensureAlbumWriteAccess(album, me.id);

      const uploader = await Users().findOne({ _id: new ObjectId(me.id) });
      const uploaderName = uploader?.username || me.email;

      const ext = filename.includes(".") ? filename.split(".").pop() : "bin";
      const s3Key = `albums/${album._id!.toString()}/${Date.now()}-${randomBytes(6).toString(
        "hex",
      )}.${ext}`;

      const s3 = getS3Client();
      await s3.send(
        new PutObjectCommand({
          Bucket: config.s3.bucket,
          Key: s3Key,
          Body: fileBuffer,
          ContentType: contentType,
        }),
      );

      const url = `${config.s3.publicBaseUrl}/${s3Key}`;

      const lastPos = await Photos()
        .find({ albumId: album._id! })
        .sort({ position: -1 })
        .limit(1)
        .toArray();
      const position = lastPos.length ? lastPos[0].position + 1 : 0;

      const doc: PhotoDoc = {
        albumId: album._id!,
        uploaderId: new ObjectId(me.id),
        uploaderName,
        comment,
        s3Key,
        url,
        contentType,
        size: fileBuffer.length,
        position,
        createdAt: new Date(),
      };
      const r = await Photos().insertOne(doc as any);
      return toDto({ ...doc, _id: r.insertedId });
    },
  );

  app.delete(
    "/:id",
    {
      preHandler: app.authenticate,
      schema: {
        params: z.object({ id: z.string() }),
        tags: ["photos"],
      },
    },
    async (req) => {
      const me = getCurrentUser(req);
      const { id } = req.params as { id: string };
      const p = await Photos().findOne({ _id: new ObjectId(id) });
      if (!p) throw new CustomError("Photo not found", 404);
      const a = await Albums().findOne({ _id: p.albumId });
      if (!a) throw new CustomError("Album not found", 404);
      // Only uploader or album owner (user or group owner) can delete
      const isUploader = p.uploaderId.toString() === me.id;
      let isOwner = false;
      if (a.ownerType === "user") {
        isOwner = a.ownerId.toString() === me.id;
      } else {
        const g = await Groups().findOne({ _id: a.ownerId });
        isOwner = g?.ownerId.toString() === me.id;
      }
      if (!isUploader && !isOwner)
        throw new CustomError("Forbidden", 403);

      try {
        await getS3Client().send(
          new DeleteObjectCommand({
            Bucket: config.s3.bucket,
            Key: p.s3Key,
          }),
        );
      } catch {
        // ignore
      }
      await Photos().deleteOne({ _id: p._id! });
      return { ok: true };
    },
  );
};
