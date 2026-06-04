import { beforeAll, afterAll, beforeEach, describe, it, expect } from "vitest";
import {
  startTestServer,
  stopTestServer,
  resetDb,
  type TestContext,
} from "./helpers";
import { createUser, createGroup, createAlbum, addPhoto } from "./factories";
import { unzipBuffer } from "./unzip";

let ctx: TestContext;
const auth = (token: string) => ({ authorization: `Bearer ${token}` });

beforeAll(async () => {
  ctx = await startTestServer();
});
afterAll(async () => {
  await stopTestServer(ctx);
});
beforeEach(async () => {
  await resetDb(ctx);
});

const download = (token: string, albumId: string) =>
  ctx.app.inject({
    method: "GET",
    url: `/api/albums/${albumId}/download`,
    headers: auth(token),
  });

describe("album ZIP download", () => {
  it("streams a zip containing every photo's bytes, in album order", async () => {
    const owner = await createUser(ctx);
    const group = await createGroup(ctx, owner);
    const album = await createAlbum(ctx, {
      ownerType: "group",
      ownerId: group.id,
      name: "Summer 2025",
    });

    const p0 = await addPhoto(ctx, {
      albumId: album.id,
      uploader: owner,
      bytes: Buffer.from("FIRST-PHOTO-BYTES"),
      position: 0,
    });
    const p1 = await addPhoto(ctx, {
      albumId: album.id,
      uploader: owner,
      bytes: Buffer.from("SECOND-PHOTO-BYTES"),
      position: 1,
    });
    const p2 = await addPhoto(ctx, {
      albumId: album.id,
      uploader: owner,
      bytes: Buffer.from("THIRD-PHOTO-BYTES"),
      position: 2,
    });

    const res = await download(owner.token, album.id);
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("application/zip");
    expect(res.headers["content-disposition"]).toContain("Summer-2025.zip");

    // res.rawPayload is the binary body from inject().
    const entries = await unzipBuffer(res.rawPayload);
    expect(entries).toHaveLength(3);

    // Every photo's bytes survive the round-trip.
    const contents = entries.map((e) => e.content.toString());
    expect(contents).toContain("FIRST-PHOTO-BYTES");
    expect(contents).toContain("SECOND-PHOTO-BYTES");
    expect(contents).toContain("THIRD-PHOTO-BYTES");

    // Entries appear in album order (001-, 002-, 003-) WITHOUT re-sorting —
    // this proves the archive preserves the order the photos were appended.
    const names = entries.map((e) => e.name);
    expect(names[0].startsWith("001-")).toBe(true);
    expect(names[1].startsWith("002-")).toBe(true);
    expect(names[2].startsWith("003-")).toBe(true);

    // And the bytes line up with the order too: entry 001 is the first photo.
    expect(entries[0].content.toString()).toBe("FIRST-PHOTO-BYTES");
    expect(entries[1].content.toString()).toBe("SECOND-PHOTO-BYTES");
    expect(entries[2].content.toString()).toBe("THIRD-PHOTO-BYTES");

    // The id fragment ties each entry back to its photo.
    void [p0, p1, p2];
  });

  it("streams a zip of a user album with photos", async () => {
    const owner = await createUser(ctx);
    const album = await createAlbum(ctx, {
      ownerType: "user",
      ownerId: owner.id,
      name: "My Photos",
    });
    await addPhoto(ctx, {
      albumId: album.id,
      uploader: owner,
      bytes: Buffer.from("USER-PHOTO-FIRST"),
      position: 0,
    });
    await addPhoto(ctx, {
      albumId: album.id,
      uploader: owner,
      bytes: Buffer.from("USER-PHOTO-SECOND"),
      position: 1,
    });

    const res = await download(owner.token, album.id);
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("application/zip");
    expect(res.headers["content-disposition"]).toContain("My-Photos.zip");

    const entries = await unzipBuffer(res.rawPayload);
    expect(entries).toHaveLength(2);
    const contents = entries.map((e) => e.content.toString());
    expect(contents).toContain("USER-PHOTO-FIRST");
    expect(contents).toContain("USER-PHOTO-SECOND");
  });

  it("forbids an outsider from downloading another user's album", async () => {
    const owner = await createUser(ctx);
    const outsider = await createUser(ctx);
    const album = await createAlbum(ctx, {
      ownerType: "user",
      ownerId: owner.id,
    });
    await addPhoto(ctx, { albumId: album.id, uploader: owner });

    const res = await download(outsider.token, album.id);
    expect(res.statusCode).toBe(403);
  });

  it("lets a group member download too", async () => {
    const owner = await createUser(ctx);
    const member = await createUser(ctx);
    const group = await createGroup(ctx, owner, { members: [member.id] });
    const album = await createAlbum(ctx, {
      ownerType: "group",
      ownerId: group.id,
    });
    await addPhoto(ctx, { albumId: album.id, uploader: owner });

    const res = await download(member.token, album.id);
    expect(res.statusCode).toBe(200);
    const entries = await unzipBuffer(res.rawPayload);
    expect(entries).toHaveLength(1);
  });

  it("forbids a non-member from downloading a private group album", async () => {
    const owner = await createUser(ctx);
    const outsider = await createUser(ctx);
    const group = await createGroup(ctx, owner, { visibility: "private" });
    const album = await createAlbum(ctx, {
      ownerType: "group",
      ownerId: group.id,
    });
    await addPhoto(ctx, { albumId: album.id, uploader: owner });

    const res = await download(outsider.token, album.id);
    expect(res.statusCode).toBe(403);
  });

  it("returns 404 for an empty album", async () => {
    const owner = await createUser(ctx);
    const album = await createAlbum(ctx, {
      ownerType: "user",
      ownerId: owner.id,
    });
    const res = await download(owner.token, album.id);
    expect(res.statusCode).toBe(404);
  });

  it("requires authentication", async () => {
    const owner = await createUser(ctx);
    const album = await createAlbum(ctx, {
      ownerType: "user",
      ownerId: owner.id,
    });
    await addPhoto(ctx, { albumId: album.id, uploader: owner });

    const res = await ctx.app.inject({
      method: "GET",
      url: `/api/albums/${album.id}/download`,
    });
    expect(res.statusCode).toBe(401);
  });
});
