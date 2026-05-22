import { z } from "zod";
import { ObjectId } from "mongodb";
import { FastifyTypedInstance } from "@src/shared/types/fastifyTypedInstance";
import { Users } from "@src/shared/db/collections";
import { hashPassword, comparePassword } from "@src/shared/utils";
import { JWTAuthService } from "@src/shared/services/JWTAuthService";
import CustomError from "@src/shared/classes/CustomError";
import config from "@config/api";

const auth = new JWTAuthService();

const signupSchema = z.object({
  email: z.string().email(),
  username: z.string().min(2).max(40),
  password: z.string().min(6).max(100),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const googleSchema = z.object({
  idToken: z.string().optional(),
  email: z.string().email().optional(),
  name: z.string().optional(),
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

export const authRoutes = async (app: FastifyTypedInstance) => {
  app.post(
    "/signup",
    { schema: { body: signupSchema, tags: ["auth"] } },
    async (req) => {
      const { email, username, password } = req.body as z.infer<
        typeof signupSchema
      >;
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
        passwordHash,
        createdAt: now,
      });
      const tokens = issueTokens({ _id: result.insertedId, email });
      return {
        user: {
          id: result.insertedId.toString(),
          email,
          username,
          createdAt: now,
        },
        ...tokens,
      };
    },
  );

  app.post(
    "/login",
    { schema: { body: loginSchema, tags: ["auth"] } },
    async (req) => {
      const { email, password } = req.body as z.infer<typeof loginSchema>;
      const user = await Users().findOne({ email });
      if (!user || !user.passwordHash)
        throw new CustomError("Invalid credentials", 401);
      const ok = await comparePassword(password, user.passwordHash);
      if (!ok) throw new CustomError("Invalid credentials", 401);
      return {
        user: {
          id: user._id!.toString(),
          email: user.email,
          username: user.username,
          avatarUrl: user.avatarUrl,
        },
        ...issueTokens({ _id: user._id!, email: user.email }),
      };
    },
  );

  // Google OAuth — mock when GOOGLE_MOCK_ENABLED=true (default).
  // Accepts either a mock payload {email, name, googleId} or an idToken (not verified in mock).
  app.post(
    "/google",
    { schema: { body: googleSchema, tags: ["auth"] } },
    async (req) => {
      const body = req.body as z.infer<typeof googleSchema>;

      let email = body.email;
      let name = body.name;
      let googleId = body.googleId;
      let avatarUrl = body.avatarUrl;

      if (!email && body.idToken && config.google.mockEnabled) {
        // Mock: decode base64 payload from a fake idToken if it looks like a JWT.
        try {
          const parts = body.idToken.split(".");
          if (parts.length >= 2) {
            const payload = JSON.parse(
              Buffer.from(parts[1], "base64").toString("utf-8"),
            );
            email = payload.email;
            name = payload.name;
            googleId = payload.sub;
            avatarUrl = payload.picture;
          }
        } catch {
          // ignore
        }
      }

      if (!email) {
        // Fallback mock identity for dev convenience.
        email = "demo.google@stellar.local";
        name = "Demo Google User";
        googleId = "google-demo-1";
      }

      let user = await Users().findOne({ email });
      if (!user) {
        const username =
          (name || email.split("@")[0])
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .slice(0, 30) +
          "-" +
          Math.floor(Math.random() * 1000);
        const res = await Users().insertOne({
          email,
          username,
          googleId,
          avatarUrl,
          createdAt: new Date(),
        });
        user = (await Users().findOne({ _id: res.insertedId }))!;
      }
      return {
        user: {
          id: user._id!.toString(),
          email: user.email,
          username: user.username,
          avatarUrl: user.avatarUrl,
        },
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
