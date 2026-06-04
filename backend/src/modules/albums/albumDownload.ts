import archiver from "archiver";
import { Readable } from "node:stream";
import { PhotoDoc } from "@src/shared/db/collections";

/** Maps a few common image content types to a file extension. */
const EXT_BY_CONTENT_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/heic": "heic",
  "image/svg+xml": "svg",
  "image/bmp": "bmp",
  "image/tiff": "tiff",
};

/**
 * Pick an extension for a photo, preferring the original S3 key's extension
 * and falling back to the content type, then "bin".
 */
const extensionFor = (photo: PhotoDoc): string => {
  const keyExt = photo.s3Key.includes(".")
    ? photo.s3Key.split(".").pop()!.toLowerCase()
    : "";
  if (keyExt && /^[a-z0-9]{1,5}$/.test(keyExt)) return keyExt;
  return EXT_BY_CONTENT_TYPE[photo.contentType?.toLowerCase()] || "bin";
};

/**
 * Stable, collision-free name for a photo inside the archive. Photos are
 * numbered by their order in the album so the archive mirrors the gallery,
 * and a short id suffix guarantees uniqueness even if two photos share a
 * name. Includes the uploader's comment as a hint when present.
 */
export const archiveEntryName = (photo: PhotoDoc, index: number): string => {
  const seq = String(index + 1).padStart(3, "0");
  const idFragment = photo._id ? photo._id.toString().slice(-6) : seq;
  return `${seq}-${idFragment}.${extensionFor(photo)}`;
};

export type ObjectStreamFetcher = (s3Key: string) => Promise<Readable>;

/**
 * Build a ZIP archive of the given photos, streaming each object straight
 * from storage into the archive. The returned archiver stream can be handed
 * to Fastify's `reply.send()` — it produces bytes lazily, so memory stays
 * bounded regardless of album size.
 *
 * `fetchStream` is injected (rather than importing the S3 loader directly)
 * so the archive logic can be unit-tested against in-memory streams.
 */
export const streamAlbumZip = (
  photos: PhotoDoc[],
  fetchStream: ObjectStreamFetcher,
): archiver.Archiver => {
  const archive = archiver("zip", { zlib: { level: 9 } });

  // Append entries sequentially. archiver buffers the queue internally, but
  // we await each fetch so a failed S3 read surfaces as an archive error
  // instead of a silently truncated zip.
  const pump = (async () => {
    try {
      for (let i = 0; i < photos.length; i++) {
        const photo = photos[i];
        const stream = await fetchStream(photo.s3Key);
        archive.append(stream, { name: archiveEntryName(photo, i) });
      }
      await archive.finalize();
    } catch (err) {
      // Propagate to consumers piping the archive (Fastify aborts the
      // response). Without this the stream would hang on a failed fetch.
      archive.abort();
      archive.emit("error", err);
    }
  })();

  // Defensive: even if emitting the error above throws (e.g. no 'error'
  // listener attached yet), never leave an unhandled rejection dangling.
  pump.catch(() => {
    /* already surfaced via archive 'error' */
  });

  return archive;
};
