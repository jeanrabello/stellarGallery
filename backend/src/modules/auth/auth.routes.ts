import { z } from "zod";
import { ObjectId } from "mongodb";
import jwt from "jsonwebtoken";
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

const USERNAME_RE = /^[a-z0-9](?:[a-z0-9._-]{1,38}[a-z0-9])?$/;
const usernameFormatValid = (u: string): boolean =>
  USERNAME_RE.test(u.toLowerCase());

const suggestUsername = (seed: string): string => {
  const base =
    seed
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 30) || "user";
  return `${base}-${Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, "0")}`;
};

const checkUsernameAvailable = async (
  username: string,
): Promise<{ available: boolean; reason?: "invalid" | "taken" }> => {
  if (!usernameFormatValid(username))
    return { available: false, reason: "invalid" };
  const taken = await Users().findOne({ username: username.toLowerCase() });
  return taken ? { available: false, reason: "taken" } : { available: true };
};

const GOOGLE_SIGNUP_TICKET_AUDIENCE = "google-signup";
const GOOGLE_SIGNUP_TICKET_TTL = "10m";

interface GoogleSignupTicketPayload extends GoogleProfile {
  aud: typeof GOOGLE_SIGNUP_TICKET_AUDIENCE;
}

const issueGoogleSignupTicket = (profile: GoogleProfile): string =>
  jwt.sign(
    { ...profile, aud: GOOGLE_SIGNUP_TICKET_AUDIENCE },
    config.jwt.tokenSecret,
    { expiresIn: GOOGLE_SIGNUP_TICKET_TTL },
  );

const verifyGoogleSignupTicket = (ticket: string): GoogleProfile => {
  let decoded: Partial<GoogleSignupTicketPayload>;
  try {
    decoded = jwt.verify(
      ticket,
      config.jwt.tokenSecret,
    ) as Partial<GoogleSignupTicketPayload>;
  } catch {
    throw new CustomError("Invalid or expired signup ticket", 401);
  }
  if (decoded?.aud !== GOOGLE_SIGNUP_TICKET_AUDIENCE || !decoded?.email)
    throw new CustomError("Invalid signup ticket", 401);
  return {
    email: decoded.email,
    name: decoded.name,
    given_name: decoded.given_name,
    family_name: decoded.family_name,
    sub: decoded.sub,
    picture: decoded.picture,
  };
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

      const existing = await Users().findOne({ email });
      if (existing) {
        return {
          user: publicUser(existing),
          ...issueTokens({ _id: existing._id!, email: existing.email }),
        };
      }

      // First-time Google sign-in: do NOT create the user yet. Hand back a
      // short-lived ticket carrying the verified profile and let the client
      // collect a username, then call /auth/google/complete.
      const profile: GoogleProfile = {
        email,
        name,
        given_name: firstName,
        family_name: lastName,
        sub: googleId,
        picture: avatarUrl,
      };
      return {
        needsUsername: true,
        ticket: issueGoogleSignupTicket(profile),
        suggestedUsername: suggestUsername(name || email.split("@")[0]),
        profile: {
          email,
          firstName,
          lastName,
          displayName: [firstName, lastName].filter(Boolean).join(" ") || name,
          avatarUrl,
        },
      };
    },
  );

  app.get(
    "/username-available",
    {
      schema: {
        querystring: z.object({ username: z.string() }),
        tags: ["auth"],
      },
    },
    async (req) => {
      const { username } = req.query as { username: string };
      return checkUsernameAvailable(username);
    },
  );

  app.post(
    "/google/complete",
    {
      schema: {
        body: z.object({
          ticket: z.string(),
          username: z.string().min(2).max(40),
        }),
        tags: ["auth"],
      },
    },
    async (req) => {
      const { ticket, username } = req.body as {
        ticket: string;
        username: string;
      };
      const profile = verifyGoogleSignupTicket(ticket);
      const normalized = username.toLowerCase().trim();
      const availability = await checkUsernameAvailable(normalized);
      if (!availability.available)
        throw new CustomError(
          availability.reason === "invalid"
            ? "Username has an invalid format"
            : "Username is already taken",
          409,
        );

      // Email might have been claimed by another flow in the meantime.
      const emailTaken = await Users().findOne({ email: profile.email });
      if (emailTaken)
        throw new CustomError("Email already registered", 409);

      const res = await Users().insertOne({
        email: profile.email,
        username: normalized,
        firstName: profile.given_name,
        lastName: profile.family_name,
        googleId: profile.sub,
        avatarUrl: profile.picture,
        createdAt: new Date(),
      });
      const user = (await Users().findOne({ _id: res.insertedId }))!;
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
