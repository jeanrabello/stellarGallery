import { connectToMongoDatabase } from "./mongoDatabase";
import { ensureS3Bucket } from "./s3";

export const initializeLoaders = async () => {
  await connectToMongoDatabase();
  await ensureS3Bucket();
};
