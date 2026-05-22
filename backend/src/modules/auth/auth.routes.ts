import { z } from "zod";
import { ObjectId } from "mongodb";
import { FastifyTypedInstance } from "@src/shared/types/fastifyTypedInstance";
import { Users, UserDoc } from "@src/shared/db/collections";
import { hashPassword, comparePassword } from "@src/shared/utils";
import { JWTAuthService } from "@src/shared/services/JWTAuthService";
import CustomError from "@src/shared/classes/CustomError";
import config from "@config/api";

const auth = new JWTAuthService();

const signupSchema = z.object({
  email: z.string().email(),
  username: z.string().min(2).max(40),
  firstName: z.string().min(1).max(60),
  lastName: z.string().min(1).max(60),
  password: z.string().min(6).max(100),
});

const loginSchema = z.object({
  identifier: z.string().min(1),
  password: z.string().min(1),
});

const googleSchema = z.object({
  idToken: z.string().optional(),
  email: z.string().email().optional(),
  name: z.string().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  googleId: z.string().optional(),
  avatarUrl: z.string().url().optional(),
});

const issueTokens = (user: { _id: ObjectId; email: string }) => {
  const payload = { id: user._id.toString(), email: user.email };
  return {
    accessToken: auth.generateToken(payload),
    refreshToken: auth.generateRefreshToken(payload),
    expiresIn: auth.getTokenExpirationTime(),
  };
};

const publicUser = (u: UserDoc) => ({
  id: u._id!.toString(),
  email: u.email,
  username: u.username,
  firstName: u.firstName,
  lastName: u.lastName,
  displayName:
    [u.firstName, u.lastName].filter(Boolean).join(" ") || u.username,
  avatarUrl: u.avatarUrl,
});

export const authRoutes = async (app: FastifyTypedInstance) => {
  app.post(
    "/signup",
    { schema: { body: signupSchema, tags: ["auth"] } },
    async (req) => {
      const { email, username, password, firstName, lastName } =
        req.body as z.infer<typeof signupSchema>;
      const exists = await Users().findOne({
        $or: [{ email }, { username }],
      });
      if (exists)
        throw new CustomError("Email or username already registered", 409);

      const passwordHash = await hashPassword(password);
      const now = new Date();
      const result = await Users().insertOne({
        email,
        username,
        firstName,
        lastName,
        passwordHash,
        createdAt: now,
      });
      const user = (await Users().findOne({ _id: result.insertedId }))!;
      return {
        user: publicUser(user),
        ...issueTokens({ _id: user._id!, email }),
      };
    },
  );

  app.post(
    "/login",
    { schema: { body: loginSchema, tags: ["auth"] } },
    async (req) => {
      const { identifier, password } = req.body as z.infer<typeof loginSchema>;
      const user = await Users().findOne({
        $or: [{ email: identifier }, { username: identifier }],
      });
      if (!user || !user.passwordHash)
        throw new CustomError("Invalid credentials", 401);
      const ok = await comparePassword(password, user.passwordHash);
      if (!ok) throw new CustomError("Invalid credentials", 401);
      return {
        user: publicUser(user),
        ...issueTokens({ _id: user._id!, email: user.email }),
      };
    },
  );

  // Google OAuth — mock when GOOGLE_MOCK_ENABLED=true (default).
  app.post(
    "/google",
    { schema: { body: googleSchema, tags: ["auth"] } },
    async (req) => {
      const body = req.body as z.infer<typeof googleSchema>;

      let email = body.email;
      let name = body.name;
      let firstName = body.firstName;
      let lastName = body.lastName;
      let googleId = body.googleId;
      let avatarUrl = body.avatarUrl;

      if (!email && body.idToken && config.google.mockEnabled) {
        try {
          const parts = body.idToken.split(".");
          if (parts.length >= 2) {
            const payload = JSON.parse(
              Buffer.from(parts[1], "base64").toString("utf-8"),
            );
            email = payload.email;
            name = payload.name;
            firstName = payload.given_name;
            lastName = payload.family_name;
            googleId = payload.sub;
            avatarUrl = payload.picture;
          }
        } catch {
          /* ignore */
        }
      }

      if (!email) {
        email = "demo.google@stellar.local";
        name = "Demo Google User";
        firstName = "Demo";
        lastName = "Google";
        googleId = "google-demo-1";
      }

      if ((!firstName || !lastName) && name) {
        const parts = name.split(" ");
        firstName = firstName || parts[0];
        lastName = lastName || parts.slice(1).join(" ") || "Google";
      }

      let user = await Users().findOne({ email });
      if (!user) {
        const baseUsername =
          (name || email.split("@")[0])
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .slice(0, 30) +
          "-" +
          Math.floor(Math.random() * 1000);
        const res = await Users().insertOne({
          email,
          username: baseUsername,
          firstName,
          lastName,
          googleId,
          avatarUrl,
          createdAt: new Date(),
        });
        user = (await Users().findOne({ _id: res.insertedId }))!;
      }
      return {
        user: publicUser(user),
        ...issueTokens({ _id: user._id!, email: user.email }),
      };
    },
  );

  app.post(
    "/refresh",
    {
      schema: {
        body: z.object({ refreshToken: z.string() }),
        tags: ["auth"],
      },
    },
    async (req) => {
      const { refreshToken } = req.body as { refreshToken: string };
      const decoded = auth.verifyRefreshToken(refreshToken);
      if (!decoded?.id || !decoded?.email)
        throw new CustomError("Invalid refresh token", 401);
      return {
        ...issueTokens({
          _id: new ObjectId(decoded.id),
          email: decoded.email,
        }),
      };
    },
  );
};
