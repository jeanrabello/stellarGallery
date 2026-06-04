import { describe, it, expect } from "vitest";
import { ObjectId } from "mongodb";
import { Readable } from "node:stream";
import {
  archiveEntryName,
  streamAlbumZip,
} from "@modules/albums/albumDownload";
import type { PhotoDoc } from "@src/shared/db/collections";
import { unzipBuffer } from "./unzip";

const makePhoto = (over: Partial<PhotoDoc> = {}): PhotoDoc => ({
  _id: new ObjectId(),
  albumId: new ObjectId(),
  uploaderId: new ObjectId(),
  uploaderName: "Someone",
  s3Key: "albums/x/photo.jpg",
  contentType: "image/jpeg",
  size: 10,
  position: 0,
  status: "active",
  createdAt: new Date(0),
  ...over,
});

const collectZip = (archive: NodeJS.ReadableStream): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    archive.on("data", (c) => chunks.push(c as Buffer));
    archive.on("end", () => resolve(Buffer.concat(chunks)));
    archive.on("error", reject);
  });

describe("archiveEntryName", () => {
  it("numbers entries by position and keeps the s3 key extension", () => {
    const photo = makePhoto({ s3Key: "albums/x/abc.png" });
    const name = archiveEntryName(photo, 4);
    expect(name.startsWith("005-")).toBe(true);
    expect(name.endsWith(".png")).toBe(true);
  });

  it("falls back to the content type when the key has no extension", () => {
    const photo = makePhoto({ s3Key: "albums/x/abc", contentType: "image/webp" });
    expect(archiveEntryName(photo, 0).endsWith(".webp")).toBe(true);
  });

  it("produces unique names for distinct photos", () => {
    const a = makePhoto();
    const b = makePhoto();
    expect(archiveEntryName(a, 0)).not.toBe(archiveEntryName(b, 0));
  });
});

describe("streamAlbumZip", () => {
  it("packs each photo's bytes pulled from the fetcher", async () => {
    const photos = [
      makePhoto({ s3Key: "k1" }),
      makePhoto({ s3Key: "k2" }),
    ];
    const store: Record<string, string> = {
      k1: "alpha-content",
      k2: "beta-content",
    };
    const fetcher = async (key: string) => Readable.from(Buffer.from(store[key]));

    const archive = streamAlbumZip(photos, fetcher);
    const zip = await collectZip(archive);
    const entries = await unzipBuffer(zip);

    expect(entries).toHaveLength(2);
    const contents = entries.map((e) => e.content.toString()).sort();
    expect(contents).toEqual(["alpha-content", "beta-content"]);
  });

  it("surfaces a fetch failure as an archive error", async () => {
    const photos = [makePhoto({ s3Key: "missing" })];
    const fetcher = async () => {
      throw new Error("boom");
    };
    const archive = streamAlbumZip(photos, fetcher);
    await expect(collectZip(archive)).rejects.toThrow();
  });
});
