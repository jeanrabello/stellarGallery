import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Readable } from "node:stream";
import config from "@config/api";

let s3Client: S3Client;
let bucketReady = false;
let bucketCheckInFlight: Promise<void> | null = null;

export const getS3Client = (): S3Client => {
  if (!s3Client) {
    s3Client = new S3Client({
      endpoint: config.s3.endpoint,
      region: config.s3.region,
      credentials: {
        accessKeyId: config.s3.accessKeyId,
        secretAccessKey: config.s3.secretAccessKey,
      },
      forcePathStyle: config.s3.forcePathStyle,
    });
  }
  return s3Client;
};

const tryCreateBucket = async (): Promise<boolean> => {
  const client = getS3Client();
  const Bucket = config.s3.bucket;
  try {
    await client.send(new HeadBucketCommand({ Bucket }));
    return true;
  } catch {
    try {
      await client.send(new CreateBucketCommand({ Bucket }));
      console.log(`Created S3 bucket "${Bucket}"`);
    } catch (err: any) {
      console.warn(`Could not create bucket ${Bucket}:`, err?.message || err);
      return false;
    }
  }
  // Bucket stays PRIVATE — every read happens through presigned URLs.
  return true;
};

export const ensureS3Bucket = async () => {
  bucketReady = await tryCreateBucket();
};

export const ensureBucketReady = async (): Promise<void> => {
  if (bucketReady) return;
  if (!bucketCheckInFlight) {
    bucketCheckInFlight = tryCreateBucket().then((ok) => {
      bucketReady = ok;
      bucketCheckInFlight = null;
    });
  }
  await bucketCheckInFlight;
};

// Per-request memoization to avoid re-signing the same key multiple times
// inside a single response. Keyed by (s3Key + ttl). Hot keys also benefit
// across requests — TTL of the cache itself is short.
const signedCache = new Map<string, { url: string; expiresAt: number }>();

const signKey = async (
  s3Key: string,
  expiresInSeconds = config.s3.signedUrlTtlSeconds,
): Promise<string> => {
  const cacheKey = `${s3Key}::${expiresInSeconds}`;
  const now = Date.now();
  const cached = signedCache.get(cacheKey);
  // Reuse only if there's still more than 30s of validity left — avoids
  // handing out a URL that's about to expire.
  if (cached && cached.expiresAt - now > 30_000) return cached.url;

  const url = await getSignedUrl(
    getS3Client(),
    new GetObjectCommand({ Bucket: config.s3.bucket, Key: s3Key }),
    { expiresIn: expiresInSeconds },
  );

  // LocalStack returns URLs with the internal docker hostname when the SDK
  // is talking to http://localstack:4566. Rewrite to the externally
  // reachable host so the browser can fetch the image.
  const externalUrl = rewriteHostForBrowser(url);

  signedCache.set(cacheKey, {
    url: externalUrl,
    expiresAt: now + expiresInSeconds * 1000,
  });
  return externalUrl;
};

const rewriteHostForBrowser = (url: string): string => {
  const publicBase = config.s3.publicBaseUrl?.trim();
  if (!publicBase) return url;
  // publicBaseUrl is like "http://localhost:4566/stellar-gallery" — extract
  // just the origin so we can swap the SDK's internal one for it.
  try {
    const publicOrigin = new URL(publicBase).origin;
    const parsed = new URL(url);
    return `${publicOrigin}${parsed.pathname}${parsed.search}`;
  } catch {
    return url;
  }
};

/** Generate a short-lived signed URL for an S3 object. */
export const signedObjectUrl = async (
  s3Key: string,
  expiresInSeconds?: number,
): Promise<string> => signKey(s3Key, expiresInSeconds);

/** Sign many keys in parallel; preserves order. */
export const signedObjectUrls = async (
  s3Keys: string[],
  expiresInSeconds?: number,
): Promise<string[]> =>
  Promise.all(s3Keys.map((k) => signKey(k, expiresInSeconds)));

/**
 * Fetch an S3 object as a Node Readable stream. Used by the album ZIP
 * download so photos are piped straight from S3 into the archive without
 * ever being fully buffered in memory. The SDK returns the body as a
 * Readable when running under Node.
 */
export const getObjectStream = async (s3Key: string): Promise<Readable> => {
  const res = await getS3Client().send(
    new GetObjectCommand({ Bucket: config.s3.bucket, Key: s3Key }),
  );
  const body = res.Body;
  if (!body) {
    throw new Error(`S3 object has no body: ${s3Key}`);
  }
  return body as unknown as Readable;
};
