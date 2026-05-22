import {
  CreateBucketCommand,
  HeadBucketCommand,
  PutBucketPolicyCommand,
  S3Client,
} from "@aws-sdk/client-s3";
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

  try {
    const policy = {
      Version: "2012-10-17",
      Statement: [
        {
          Sid: "PublicRead",
          Effect: "Allow",
          Principal: "*",
          Action: ["s3:GetObject"],
          Resource: [`arn:aws:s3:::${Bucket}/*`],
        },
      ],
    };
    await client.send(
      new PutBucketPolicyCommand({
        Bucket,
        Policy: JSON.stringify(policy),
      }),
    );
  } catch (err: any) {
    console.warn("Could not set bucket policy:", err?.message || err);
  }
  return true;
};

// Used by loaders on boot — does not throw if LocalStack is still warming up.
export const ensureS3Bucket = async () => {
  bucketReady = await tryCreateBucket();
};

// Called lazily before every upload. Retries once if the bucket wasn't ready at boot.
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
