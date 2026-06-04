import { MongoMemoryServer } from "mongodb-memory-server";
import { mockClient } from "aws-sdk-client-mock";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
} from "@aws-sdk/client-s3";
import { Readable } from "node:stream";
import type { FastifyInstance } from "fastify";

// In-memory store of S3 object bodies keyed by s3Key, so download tests can
// assert the archive really contains the bytes that were "uploaded".
export const s3Store = new Map<string, Buffer>();

let mongod: MongoMemoryServer | undefined;
let s3Mock: ReturnType<typeof mockClient> | undefined;

export interface TestContext {
  app: FastifyInstance;
  // Re-exported here so tests don't have to juggle dynamic imports.
  collections: typeof import("@src/shared/db/collections");
  mongo: typeof import("@src/loaders/mongoDatabase");
  jwt: import("@src/shared/services/JWTAuthService").JWTAuthService;
}

/**
 * Boot a fully wired API instance backed by an in-memory MongoDB and a mocked
 * S3. Must set env + mock BEFORE importing any config-dependent module, since
 * config/api.ts snapshots process.env at import time — hence the dynamic
 * imports below.
 */
export const startTestServer = async (): Promise<TestContext> => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongod.getUri();
  process.env.MONGO_DB_NAME = "stellar_test";
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = "test-jwt-secret";
  process.env.S3_BUCKET = "test-bucket";
  // Disable any public-base rewrite so signed URLs come back untouched.
  process.env.S3_PUBLIC_BASE_URL = "";

  // Mock S3 before the loaders touch it.
  s3Mock = mockClient(S3Client);
  s3Mock.on(HeadBucketCommand).resolves({});
  s3Mock.on(CreateBucketCommand).resolves({});
  s3Mock.on(PutObjectCommand).callsFake((input: any) => {
    const body = input.Body;
    s3Store.set(
      input.Key,
      Buffer.isBuffer(body) ? body : Buffer.from(body ?? ""),
    );
    return {};
  });
  s3Mock.on(GetObjectCommand).callsFake((input: any) => {
    const buf = s3Store.get(input.Key);
    if (!buf) {
      const err: any = new Error("NoSuchKey");
      err.name = "NoSuchKey";
      throw err;
    }
    return { Body: Readable.from(buf) };
  });

  const collections = await import("@src/shared/db/collections");
  const mongo = await import("@src/loaders/mongoDatabase");
  const { buildApp } = await import("@src/app");
  const { JWTAuthService } = await import(
    "@src/shared/services/JWTAuthService"
  );

  await mongo.connectToMongoDatabase();

  const app = buildApp({ logger: false });
  await app.ready();

  return {
    app: app as unknown as FastifyInstance,
    collections,
    mongo,
    jwt: new JWTAuthService(),
  };
};

export const stopTestServer = async (ctx: TestContext): Promise<void> => {
  await ctx.app.close();
  if (mongod) await mongod.stop();
  if (s3Mock) s3Mock.restore();
  s3Store.clear();
  mongod = undefined;
  s3Mock = undefined;
};

/** Wipe every collection between tests so cases stay isolated. */
export const resetDb = async (ctx: TestContext): Promise<void> => {
  const db = ctx.mongo.getMongoDb();
  const cols = await db.collections();
  await Promise.all(cols.map((c) => c.deleteMany({})));
  s3Store.clear();
};
