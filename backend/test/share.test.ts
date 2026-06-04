import { beforeAll, afterAll, beforeEach, describe, it, expect } from "vitest";
import { ObjectId } from "mongodb";
import {
  startTestServer,
  stopTestServer,
  resetDb,
  type TestContext,
} from "./helpers";
import { createUser, createGroup, createAlbum, addPhoto } from "./factories";

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

describe("share tokens — group albums", () => {
  it("lets the group owner mint a share token for a group album", async () => {
    const owner = await createUser(ctx);
    const group = await createGroup(ctx, owner);
    const album = await createAlbum(ctx, {
      ownerType: "group",
      ownerId: group.id,
    });

    const res = await ctx.app.inject({
      method: "POST",
      url: "/api/share-tokens",
      headers: auth(owner.token),
      payload: { albumId: album.id, name: "blog" },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.token).toBeTruthy();
    expect(body.albumId).toBe(album.id);
    expect(body.url).toContain(`/api/public/albums/${album.id}`);
    expect(body.url).toContain(`token=${body.token}`);

    // It was actually persisted, scoped to the group owner.
    const stored = await ctx.collections
      .ShareTokens()
      .findOne({ token: body.token });
    expect(stored).toBeTruthy();
    expect(stored!.ownerId.toString()).toBe(owner.id);
  });

  it("forbids a regular group member from minting a token", async () => {
    const owner = await createUser(ctx);
    const member = await createUser(ctx);
    const group = await createGroup(ctx, owner, { members: [member.id] });
    const album = await createAlbum(ctx, {
      ownerType: "group",
      ownerId: group.id,
    });

    const res = await ctx.app.inject({
      method: "POST",
      url: "/api/share-tokens",
      headers: auth(member.token),
      payload: { albumId: album.id },
    });

    expect(res.statusCode).toBe(403);
  });

  it("forbids a complete outsider from minting a token", async () => {
    const owner = await createUser(ctx);
    const outsider = await createUser(ctx);
    const group = await createGroup(ctx, owner);
    const album = await createAlbum(ctx, {
      ownerType: "group",
      ownerId: group.id,
    });

    const res = await ctx.app.inject({
      method: "POST",
      url: "/api/share-tokens",
      headers: auth(outsider.token),
      payload: { albumId: album.id },
    });

    expect(res.statusCode).toBe(403);
  });

  it("still only lets the owner share their own user album", async () => {
    const owner = await createUser(ctx);
    const other = await createUser(ctx);
    const album = await createAlbum(ctx, {
      ownerType: "user",
      ownerId: owner.id,
    });

    const ok = await ctx.app.inject({
      method: "POST",
      url: "/api/share-tokens",
      headers: auth(owner.token),
      payload: { albumId: album.id },
    });
    expect(ok.statusCode).toBe(200);

    const denied = await ctx.app.inject({
      method: "POST",
      url: "/api/share-tokens",
      headers: auth(other.token),
      payload: { albumId: album.id },
    });
    expect(denied.statusCode).toBe(403);
  });
});

describe("public consumption of a shared group album", () => {
  it("returns the album + photo URLs for a valid token (no login)", async () => {
    const owner = await createUser(ctx);
    const group = await createGroup(ctx, owner);
    const album = await createAlbum(ctx, {
      ownerType: "group",
      ownerId: group.id,
      name: "Trip",
    });
    await addPhoto(ctx, { albumId: album.id, uploader: owner, position: 0 });
    await addPhoto(ctx, { albumId: album.id, uploader: owner, position: 1 });

    const minted = await ctx.app.inject({
      method: "POST",
      url: "/api/share-tokens",
      headers: auth(owner.token),
      payload: { albumId: album.id },
    });
    const { token } = minted.json();

    // Query-param form, no Authorization header.
    const pub = await ctx.app.inject({
      method: "GET",
      url: `/api/public/albums/${album.id}?token=${token}`,
    });
    expect(pub.statusCode).toBe(200);
    const body = pub.json();
    expect(body.album.id).toBe(album.id);
    expect(body.album.name).toBe("Trip");
    // For a group album the public response resolves the GROUP OWNER as the
    // displayed owner (album.ownerId is a group id, not a user id).
    expect(body.album.owner).toBeTruthy();
    expect(body.album.owner.username).toBe(owner.username);
    expect(body.photos).toHaveLength(2);
    for (const p of body.photos) expect(p.url).toBeTruthy();

    // Header form also works.
    const viaHeader = await ctx.app.inject({
      method: "GET",
      url: `/api/public/albums/${album.id}`,
      headers: { "x-share-token": token },
    });
    expect(viaHeader.statusCode).toBe(200);
  });

  it("rejects a missing or revoked token", async () => {
    const owner = await createUser(ctx);
    const group = await createGroup(ctx, owner);
    const album = await createAlbum(ctx, {
      ownerType: "group",
      ownerId: group.id,
    });
    await addPhoto(ctx, { albumId: album.id, uploader: owner });

    const minted = await ctx.app.inject({
      method: "POST",
      url: "/api/share-tokens",
      headers: auth(owner.token),
      payload: { albumId: album.id },
    });
    const { id, token } = minted.json();

    const noToken = await ctx.app.inject({
      method: "GET",
      url: `/api/public/albums/${album.id}`,
    });
    expect(noToken.statusCode).toBe(401);

    // Revoke, then the same token must stop working.
    const revoke = await ctx.app.inject({
      method: "DELETE",
      url: `/api/share-tokens/${id}`,
      headers: auth(owner.token),
    });
    expect(revoke.statusCode).toBe(200);

    const afterRevoke = await ctx.app.inject({
      method: "GET",
      url: `/api/public/albums/${album.id}?token=${token}`,
    });
    expect(afterRevoke.statusCode).toBe(401);
  });

  it("stops serving a group album once its group is soft-deleted", async () => {
    const owner = await createUser(ctx);
    const group = await createGroup(ctx, owner);
    const album = await createAlbum(ctx, {
      ownerType: "group",
      ownerId: group.id,
    });
    await addPhoto(ctx, { albumId: album.id, uploader: owner });

    const minted = await ctx.app.inject({
      method: "POST",
      url: "/api/share-tokens",
      headers: auth(owner.token),
      payload: { albumId: album.id },
    });
    const { token } = minted.json();

    // Works while the group is active.
    const before = await ctx.app.inject({
      method: "GET",
      url: `/api/public/albums/${album.id}?token=${token}`,
    });
    expect(before.statusCode).toBe(200);

    // Soft-delete the group: the still-valid token must no longer leak it.
    await ctx.collections
      .Groups()
      .updateOne(
        { _id: new ObjectId(group.id) },
        { $set: { status: "deleted", deletedAt: new Date() } },
      );

    const after = await ctx.app.inject({
      method: "GET",
      url: `/api/public/albums/${album.id}?token=${token}`,
    });
    expect(after.statusCode).toBe(404);
  });
});
