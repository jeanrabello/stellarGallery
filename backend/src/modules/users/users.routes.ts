import { ObjectId } from "mongodb";
import { FastifyTypedInstance } from "@src/shared/types/fastifyTypedInstance";
import { Users } from "@src/shared/db/collections";
import { getCurrentUser } from "@src/shared/middlewares/auth";
import CustomError from "@src/shared/classes/CustomError";

export const meRoutes = async (app: FastifyTypedInstance) => {
  app.get(
    "/me",
    { preHandler: app.authenticate, schema: { tags: ["users"] } },
    async (req) => {
      const me = getCurrentUser(req);
      const user = await Users().findOne({ _id: new ObjectId(me.id) });
      if (!user) throw new CustomError("User not found", 404);
      const displayName =
        [user.firstName, user.lastName].filter(Boolean).join(" ") ||
        user.username;
      return {
        id: user._id!.toString(),
        email: user.email,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        displayName,
        avatarUrl: user.avatarUrl,
        createdAt: user.createdAt,
      };
    },
  );
};
