import { beforeAll, afterAll, beforeEach, describe, it, expect } from "vitest";
import { ObjectId } from "mongodb";
import {
  startTestServer,
  stopTestServer,
  resetDb,
  type TestContext,
} from "./helpers";
import {
  createUser,
  createGroup,
  createAlbum,
  buildUploadPayload,
} from "./factories";

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

const upload = (token: string, albumId: string) => {
  const { payload, headers } = buildUploadPayload(albumId);
  return ctx.app.inject({
    method: "POST",
    url: "/api/photos/upload",
    headers: { ...auth(token), ...headers },
    payload,
  });
};

describe("album lock / unlock", () => {
  it("lets a member upload while unlocked, then blocks once the owner locks", async () => {
    const owner = await createUser(ctx);
    const member = await createUser(ctx);
    const group = await createGroup(ctx, owner, { members: [member.id] });
    const album = await createAlbum(ctx, {
      ownerType: "group",
      ownerId: group.id,
    });

    // Unlocked: member can upload.
    const before = await upload(member.token, album.id);
    expect(before.statusCode).toBe(200);

    // Owner locks the album.
    const lock = await ctx.app.inject({
      method: "PATCH",
      url: `/api/albums/${album.id}/lock`,
      headers: auth(owner.token),
    });
    expect(lock.statusCode).toBe(200);
    expect(lock.json().locked).toBe(true);

    // Now uploads are blocked (423 Locked) — even for the member.
    const blocked = await upload(member.token, album.id);
    expect(blocked.statusCode).toBe(423);

    // ...and for the owner too: they must unlock first.
    const blockedOwner = await upload(owner.token, album.id);
    expect(blockedOwner.statusCode).toBe(423);
  });

  it("restores uploads after the owner unlocks", async () => {
    const owner = await createUser(ctx);
    const member = await createUser(ctx);
    const group = await createGroup(ctx, owner, { members: [member.id] });
    const album = await createAlbum(ctx, {
      ownerType: "group",
      ownerId: group.id,
      locked: true,
    });

    const blocked = await upload(member.token, album.id);
    expect(blocked.statusCode).toBe(423);

    const unlock = await ctx.app.inject({
      method: "PATCH",
      url: `/api/albums/${album.id}/unlock`,
      headers: auth(owner.token),
    });
    expect(unlock.statusCode).toBe(200);
    expect(unlock.json().locked).toBe(false);

    const after = await upload(member.token, album.id);
    expect(after.statusCode).toBe(200);
  });

  it("forbids a non-owner member from locking the album", async () => {
    const owner = await createUser(ctx);
    const member = await createUser(ctx);
    const group = await createGroup(ctx, owner, { members: [member.id] });
    const album = await createAlbum(ctx, {
      ownerType: "group",
      ownerId: group.id,
    });

    const res = await ctx.app.inject({
      method: "PATCH",
      url: `/api/albums/${album.id}/lock`,
      headers: auth(member.token),
    });
    expect(res.statusCode).toBe(403);

    // The album must remain unlocked in the DB — the rejected request had
    // no side effect.
    const stored = await ctx.collections
      .Albums()
      .findOne({ _id: new ObjectId(album.id) });
    expect(stored!.locked).toBeFalsy();
  });

  it("reflects the locked flag in the album DTO", async () => {
    const owner = await createUser(ctx);
    const group = await createGroup(ctx, owner);
    const album = await createAlbum(ctx, {
      ownerType: "group",
      ownerId: group.id,
    });

    const initial = await ctx.app.inject({
      method: "GET",
      url: `/api/albums/${album.id}`,
      headers: auth(owner.token),
    });
    expect(initial.json().locked).toBe(false);

    await ctx.app.inject({
      method: "PATCH",
      url: `/api/albums/${album.id}/lock`,
      headers: auth(owner.token),
    });

    const locked = await ctx.app.inject({
      method: "GET",
      url: `/api/albums/${album.id}`,
      headers: auth(owner.token),
    });
    expect(locked.json().locked).toBe(true);
  });
});
