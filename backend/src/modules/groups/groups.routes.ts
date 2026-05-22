import { z } from "zod";
import { ObjectId } from "mongodb";
import { randomBytes } from "crypto";
import { FastifyTypedInstance } from "@src/shared/types/fastifyTypedInstance";
import { Groups, Users } from "@src/shared/db/collections";
import { getCurrentUser } from "@src/shared/middlewares/auth";
import CustomError from "@src/shared/classes/CustomError";

const createSchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(500).optional(),
  visibility: z.enum(["public", "private"]).default("private"),
});

const idParam = z.object({ id: z.string() });

const genCode = () => randomBytes(4).toString("hex").toUpperCase();

const toDto = (g: any, currentUserId: string) => {
  const memberIds = g.members.map((m: ObjectId) => m.toString());
  return {
    id: g._id.toString(),
    name: g.name,
    description: g.description,
    visibility: g.visibility,
    joinCode: g.joinCode,
    ownerId: g.ownerId.toString(),
    isOwner: g.ownerId.toString() === currentUserId,
    isMember: memberIds.includes(currentUserId),
    members: memberIds,
    memberCount: memberIds.length,
    createdAt: g.createdAt,
  };
};

export const groupRoutes = async (app: FastifyTypedInstance) => {
  app.get(
    "/",
    { preHandler: app.authenticate, schema: { tags: ["groups"] } },
    async (req) => {
      const me = getCurrentUser(req);
      const uid = new ObjectId(me.id);
      const list = await Groups()
        .find({ members: uid })
        .sort({ createdAt: -1 })
        .toArray();
      return list.map((g) => toDto(g, me.id));
    },
  );

  app.post(
    "/",
    {
      preHandler: app.authenticate,
      schema: { body: createSchema, tags: ["groups"] },
    },
    async (req) => {
      const me = getCurrentUser(req);
      const { name, description, visibility } = req.body as z.infer<
        typeof createSchema
      >;
      const ownerId = new ObjectId(me.id);
      const doc = {
        name,
        description,
        visibility,
        ownerId,
        members: [ownerId],
        joinCode: genCode(),
        createdAt: new Date(),
      };
      const r = await Groups().insertOne(doc as any);
      return toDto({ ...doc, _id: r.insertedId }, me.id);
    },
  );

  app.get(
    "/:id",
    {
      preHandler: app.authenticate,
      schema: { params: idParam, tags: ["groups"] },
    },
    async (req) => {
      const me = getCurrentUser(req);
      const { id } = req.params as z.infer<typeof idParam>;
      const g = await Groups().findOne({ _id: new ObjectId(id) });
      if (!g) throw new CustomError("Group not found", 404);
      const isMember = g.members.some((m) => m.toString() === me.id);
      if (!isMember && g.visibility !== "public")
        throw new CustomError("Forbidden", 403);

      // expand members
      const memberDocs = await Users()
        .find({ _id: { $in: g.members } })
        .project({ passwordHash: 0 })
        .toArray();

      return {
        ...toDto(g, me.id),
        membersDetail: memberDocs.map((u: any) => ({
          id: u._id.toString(),
          username: u.username,
          firstName: u.firstName,
          lastName: u.lastName,
          displayName:
            [u.firstName, u.lastName].filter(Boolean).join(" ") || u.username,
          email: u.email,
          avatarUrl: u.avatarUrl,
        })),
      };
    },
  );

  app.post(
    "/join",
    {
      preHandler: app.authenticate,
      schema: {
        body: z.object({ joinCode: z.string().min(1) }),
        tags: ["groups"],
      },
    },
    async (req) => {
      const me = getCurrentUser(req);
      const { joinCode } = req.body as { joinCode: string };
      const g = await Groups().findOne({ joinCode: joinCode.toUpperCase() });
      if (!g) throw new CustomError("Invalid join code", 404);
      const uid = new ObjectId(me.id);
      if (g.members.some((m) => m.toString() === me.id))
        return toDto(g, me.id);
      await Groups().updateOne(
        { _id: g._id },
        { $addToSet: { members: uid } },
      );
      const updated = await Groups().findOne({ _id: g._id });
      return toDto(updated, me.id);
    },
  );

  app.post(
    "/:id/leave",
    {
      preHandler: app.authenticate,
      schema: { params: idParam, tags: ["groups"] },
    },
    async (req) => {
      const me = getCurrentUser(req);
      const { id } = req.params as z.infer<typeof idParam>;
      const uid = new ObjectId(me.id);
      const g = await Groups().findOne({ _id: new ObjectId(id) });
      if (!g) throw new CustomError("Group not found", 404);
      if (g.ownerId.toString() === me.id)
        throw new CustomError("Owner cannot leave its own group", 400);
      await Groups().updateOne({ _id: g._id }, { $pull: { members: uid } });
      return { ok: true };
    },
  );
};
