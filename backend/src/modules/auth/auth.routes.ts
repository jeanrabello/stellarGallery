import { z } from "zod";
import { ObjectId } from "mongodb";
import { OAuth2Client } from "google-auth-library";
import { FastifyTypedInstance } from "@src/shared/types/fastifyTypedInstance";
import { Users, UserDoc } from "@src/shared/db/collections";
import { hashPassword, comparePassword } from "@src/shared/utils";
import { JWTAuthService } from "@src/shared/services/JWTAuthService";
import CustomError from "@src/shared/classes/CustomError";
import config from "@config/api";

let googleOAuthClient: OAuth2Client | null = null;
const getGoogleOAuthClient = (): OAuth2Client => {
  if (!googleOAuthClient) {
    googleOAuthClient = new OAuth2Client(config.google.clientId);
  }
  return googleOAuthClient;
};

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
  accessToken: z.string().optional(),
  email: z.string().email().optional(),
  name: z.string().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  googleId: z.string().optional(),
  avatarUrl: z.string().url().optional(),
});

interface GoogleProfile {
  email: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  sub?: string;
  picture?: string;
}

const fetchGoogleUserInfo = async (
  accessToken: string,
): Promise<GoogleProfile> => {
  const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new CustomError(
      `Invalid Google access_token: ${detail || res.statusText}`,
      401,
    );
  }
  const profile = (await res.json()) as GoogleProfile;
  if (!profile.email)
    throw new CustomError("Google userinfo has no email", 401);
  return profile;
};

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

  // Google OAuth — verifies a real id_token via google-auth-library when
  // GOOGLE_CLIENT_ID is configured. Falls back to a permissive mock that
  // decodes the JWT payload without signature verification when
  // GOOGLE_MOCK_ENABLED=true (dev only).
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

      const hasRealConfig = !!config.google.clientId;
      const useMock = !hasRealConfig && config.google.mockEnabled;

      if (body.accessToken) {
        // OAuth2 token client (popup flow). Resolve profile via userinfo.
        const profile = await fetchGoogleUserInfo(body.accessToken);
        email = profile.email;
        name = profile.name;
        firstName = profile.given_name;
        lastName = profile.family_name;
        googleId = profile.sub;
        avatarUrl = profile.picture;
      } else if (body.idToken && hasRealConfig) {
        // Real verification path.
        let ticket;
        try {
          ticket = await getGoogleOAuthClient().verifyIdToken({
            idToken: body.idToken,
            audience: config.google.clientId,
          });
        } catch (err: any) {
          throw new CustomError(
            `Invalid Google id_token: ${err?.message || "verification failed"}`,
            401,
          );
        }
        const payload = ticket.getPayload();
        if (!payload?.email)
          throw new CustomError("Google id_token has no email", 401);
        email = payload.email;
        name = payload.name;
        firstName = payload.given_name;
        lastName = payload.family_name;
        googleId = payload.sub;
        avatarUrl = payload.picture;
      } else if (!email && body.idToken && useMock) {
        // Dev fallback: decode JWT payload without verifying signature.
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
      } else if (!body.idToken && !hasRealConfig && !useMock) {
        throw new CustomError(
          "Google sign-in is not configured on this server",
          400,
        );
      }

      if (!email && useMock) {
        email = "demo.google@stellar.local";
        name = "Demo Google User";
        firstName = "Demo";
        lastName = "Google";
        googleId = "google-demo-1";
      }
      if (!email) throw new CustomError("Missing Google account email", 400);

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
