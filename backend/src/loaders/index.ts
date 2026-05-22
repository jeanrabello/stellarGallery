import { connectToMongoDatabase } from "./mongoDatabase";
import { ensureS3Bucket } from "./s3";
import { ensureSesIdentity } from "./ses";

export const initializeLoaders = async () => {
  await connectToMongoDatabase();
  await ensureS3Bucket();
  await ensureSesIdentity();
};
