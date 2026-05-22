import { z } from "zod";
import { ObjectId } from "mongodb";
import { randomBytes } from "crypto";
import { FastifyTypedInstance } from "@src/shared/types/fastifyTypedInstance";
import { Groups, Invites, Users } from "@src/shared/db/collections";
import { getCurrentUser } from "@src/shared/middlewares/auth";
import CustomError from "@src/shared/classes/CustomError";
import config from "@config/api";

const sendSchema = z.object({
  groupId: z.string(),
  email: z.string().email(),
});

export const inviteRoutes = async (app: FastifyTypedInstance) => {
  app.post(
    "/send",
    {
      preHandler: app.authenticate,
      schema: { body: sendSchema, tags: ["invites"] },
    },
    async (req) => {
      const me = getCurrentUser(req);
      const { groupId, email } = req.body as z.infer<typeof sendSchema>;
      const g = await Groups().findOne({ _id: new ObjectId(groupId) });
      if (!g) throw new CustomError("Group not found", 404);
      const isMember = g.members.some((m) => m.toString() === me.id);
      if (!isMember) throw new CustomError("Forbidden", 403);

      const token = randomBytes(16).toString("hex");
      const doc = {
        groupId: g._id!,
        email,
        invitedBy: new ObjectId(me.id),
        token,
        status: "pending" as const,
        createdAt: new Date(),
      };
      await Invites().insertOne(doc as any);

      const inviteLink = `${config.app.frontendUrl}/invites/accept?token=${token}`;
      // Mock email send — log only.
      console.log(
        `[INVITE-EMAIL-MOCK] To: ${email} | Group: ${g.name} | Link: ${inviteLink}`,
      );
      return {
        ok: true,
        token,
        inviteLink,
        mockedEmail: true,
        joinCode: g.joinCode,
      };
    },
  );

  // List invites I sent / received (by my email)
  app.get(
    "/mine",
    { preHandler: app.authenticate, schema: { tags: ["invites"] } },
    async (req) => {
      const me = getCurrentUser(req);
      const received = await Invites()
        .find({ email: me.email, status: "pending" })
        .sort({ createdAt: -1 })
        .toArray();
      const enriched = await Promise.all(
        received.map(async (i) => {
          const g = await Groups().findOne({ _id: i.groupId });
          return {
            id: i._id!.toString(),
            token: i.token,
            email: i.email,
            status: i.status,
            createdAt: i.createdAt,
            group: g
              ? { id: g._id!.toString(), name: g.name }
              : null,
          };
        }),
      );
      return enriched;
    },
  );

  app.post(
    "/accept",
    {
      preHandler: app.authenticate,
      schema: {
        body: z.object({ token: z.string() }),
        tags: ["invites"],
      },
    },
    async (req) => {
      const me = getCurrentUser(req);
      const { token } = req.body as { token: string };
      const inv = await Invites().findOne({ token, status: "pending" });
      if (!inv) throw new CustomError("Invalid or expired invite", 404);
      const user = await Users().findOne({ _id: new ObjectId(me.id) });
      if (!user) throw new CustomError("User not found", 404);
      // accept regardless of email match: but if email differs, log it.
      await Groups().updateOne(
        { _id: inv.groupId },
        { $addToSet: { members: user._id! } },
      );
      await Invites().updateOne(
        { _id: inv._id! },
        { $set: { status: "accepted", acceptedAt: new Date() } },
      );
      return { ok: true, groupId: inv.groupId.toString() };
    },
  );
};
