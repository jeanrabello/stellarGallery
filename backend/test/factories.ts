import { ObjectId } from "mongodb";
import type { TestContext } from "./helpers";
import { s3Store } from "./helpers";

let counter = 0;
const uniq = () => `${Date.now()}-${counter++}`;

export interface SeededUser {
  id: string;
  email: string;
  username: string;
  token: string;
}

export const createUser = async (
  ctx: TestContext,
  overrides: Partial<{ email: string; username: string }> = {},
): Promise<SeededUser> => {
  const id = new ObjectId();
  const email = overrides.email || `user-${uniq()}@test.dev`;
  const username = overrides.username || `user-${uniq()}`;
  await ctx.collections.Users().insertOne({
    _id: id,
    email,
    username,
    firstName: "Test",
    lastName: "User",
    createdAt: new Date(),
  });
  const token = ctx.jwt.generateToken({ id: id.toString(), email });
  return { id: id.toString(), email, username, token };
};

export const createGroup = async (
  ctx: TestContext,
  owner: SeededUser,
  opts: Partial<{
    visibility: "public" | "private";
    members: string[];
  }> = {},
): Promise<{ id: string }> => {
  const id = new ObjectId();
  const memberIds = [
    new ObjectId(owner.id),
    ...(opts.members || []).map((m) => new ObjectId(m)),
  ];
  await ctx.collections.Groups().insertOne({
    _id: id,
    name: `group-${uniq()}`,
    visibility: opts.visibility || "private",
    ownerId: new ObjectId(owner.id),
    members: memberIds,
    joinCode: `JOIN${counter}`,
    status: "active",
    createdAt: new Date(),
  });
  return { id: id.toString() };
};

export const createAlbum = async (
  ctx: TestContext,
  opts: {
    ownerType: "user" | "group";
    ownerId: string;
    locked?: boolean;
    name?: string;
  },
): Promise<{ id: string }> => {
  const id = new ObjectId();
  await ctx.collections.Albums().insertOne({
    _id: id,
    name: opts.name || `album-${uniq()}`,
    ownerType: opts.ownerType,
    ownerId: new ObjectId(opts.ownerId),
    position: 0,
    locked: opts.locked,
    status: "active",
    createdAt: new Date(),
  });
  return { id: id.toString() };
};

/** Insert a photo doc AND seed its bytes into the mocked S3 store. */
export const addPhoto = async (
  ctx: TestContext,
  opts: {
    albumId: string;
    uploader: SeededUser;
    bytes?: Buffer;
    contentType?: string;
    position?: number;
  },
): Promise<{ id: string; s3Key: string; bytes: Buffer }> => {
  const id = new ObjectId();
  const bytes = opts.bytes || Buffer.from(`photo-${uniq()}-content`);
  const s3Key = `albums/${opts.albumId}/${id.toString()}.jpg`;
  s3Store.set(s3Key, bytes);
  await ctx.collections.Photos().insertOne({
    _id: id,
    albumId: new ObjectId(opts.albumId),
    uploaderId: new ObjectId(opts.uploader.id),
    uploaderName: opts.uploader.username,
    s3Key,
    contentType: opts.contentType || "image/jpeg",
    size: bytes.length,
    position: opts.position ?? 0,
    status: "active",
    createdAt: new Date(),
  });
  return { id: id.toString(), s3Key, bytes };
};

/** Multipart body builder for the photo upload endpoint via app.inject. */
export const buildUploadPayload = (
  albumId: string,
  fileContent = "fake-image-bytes",
  comment = "",
): { payload: Buffer; headers: Record<string, string> } => {
  const boundary = "----testboundary" + Math.abs(hashish(albumId));
  const parts: string[] = [];
  parts.push(`--${boundary}\r\n`);
  parts.push(`Content-Disposition: form-data; name="albumId"\r\n\r\n`);
  parts.push(`${albumId}\r\n`);
  if (comment) {
    parts.push(`--${boundary}\r\n`);
    parts.push(`Content-Disposition: form-data; name="comment"\r\n\r\n`);
    parts.push(`${comment}\r\n`);
  }
  parts.push(`--${boundary}\r\n`);
  parts.push(
    `Content-Disposition: form-data; name="file"; filename="photo.jpg"\r\n`,
  );
  parts.push(`Content-Type: image/jpeg\r\n\r\n`);
  parts.push(`${fileContent}\r\n`);
  parts.push(`--${boundary}--\r\n`);
  return {
    payload: Buffer.from(parts.join("")),
    headers: {
      "content-type": `multipart/form-data; boundary=${boundary}`,
    },
  };
};

// Deterministic small hash so boundaries differ per album without Math.random.
const hashish = (s: string): number => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
};
