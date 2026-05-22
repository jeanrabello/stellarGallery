import {
  CreateBucketCommand,
  HeadBucketCommand,
  PutBucketPolicyCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import config from "@config/api";

let s3Client: S3Client;

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

export const ensureS3Bucket = async () => {
  const client = getS3Client();
  const Bucket = config.s3.bucket;
  try {
    await client.send(new HeadBucketCommand({ Bucket }));
    console.log(`S3 bucket "${Bucket}" already exists`);
  } catch {
    try {
      await client.send(new CreateBucketCommand({ Bucket }));
      console.log(`Created S3 bucket "${Bucket}"`);
    } catch (err: any) {
      console.warn(`Could not create bucket ${Bucket}:`, err?.message || err);
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
};
