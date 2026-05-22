import { z } from "zod";
import { ObjectId } from "mongodb";
import { randomBytes } from "crypto";
import { FastifyTypedInstance } from "@src/shared/types/fastifyTypedInstance";
import {
  Groups,
  Invites,
  Users,
  activeFilter,
} from "@src/shared/db/collections";
import { getCurrentUser } from "@src/shared/middlewares/auth";
import { getEmailService } from "@src/shared/services/email";
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
      const g = await Groups().findOne({
        _id: new ObjectId(groupId),
        ...activeFilter,
      });
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
      const inviter = await Users().findOne({ _id: new ObjectId(me.id) });
      const inviterName =
        [inviter?.firstName, inviter?.lastName]
          .filter(Boolean)
          .join(" ")
          .trim() ||
        inviter?.username ||
        me.email;

      let sent = false;
      try {
        const result = await getEmailService().send({
          kind: "group-invite",
          payload: {
            to: email,
            groupName: g.name,
            inviterName,
            inviteLink,
            joinCode: g.joinCode,
          },
        });
        sent = result.sent;
      } catch (err: any) {
        // Keep the invite record even if delivery fails so the user can still
        // share the link manually from the dialog.
        req.log.error({ err }, "failed to send invite email");
      }

      return {
        ok: true,
        token,
        inviteLink,
        emailSent: sent,
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
          const g = await Groups().findOne({
            _id: i.groupId,
            ...activeFilter,
          });
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
      const g = await Groups().findOne({ _id: inv.groupId, ...activeFilter });
      if (!g) throw new CustomError("Group not found", 404);
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
