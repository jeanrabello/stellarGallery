import { Config, Environment } from "./types";

const environment = (process.env.NODE_ENV || "development") as Environment;

const getConfig = (): Config => ({
  app: {
    name: process.env.APP_NAME || "StellarGalleryAPI",
    port: Number(process.env.APP_PORT) || 3001,
    env: environment,
    host: process.env.APP_HOST || "0.0.0.0",
    url: process.env.BASE_URL || "http://0.0.0.0:3001",
    frontendUrl: process.env.FRONTEND_URL || "http://localhost:3000",
  },
  swagger: { enabled: environment !== "production" },
  db: {
    uri: process.env.MONGO_URI || "",
    dbName: process.env.MONGO_DB_NAME || "stellarGallery",
    user: process.env.MONGO_INITDB_ROOT_USERNAME || "root",
    password: process.env.MONGO_INITDB_ROOT_PASSWORD || "root",
    host: process.env.MONGO_HOST || "127.0.0.1",
  },
  jwt: {
    tokenSecret: process.env.JWT_SECRET || "stellar-secret-change-me",
    tokenExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
    refreshTokenSecret:
      process.env.JWT_REFRESH_SECRET || "stellar-refresh-secret",
    refreshTokenExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "30d",
  },
  security: {
    bcryptSaltRounds: Number(process.env.BCRYPT_SALT_ROUNDS) || 10,
  },
  rateLimit: {
    enabled: false,
    max: Number(process.env.RATE_LIMIT_MAX) || 200,
    timeWindow: Number(process.env.RATE_LIMIT_TIME_WINDOW) || 60_000,
    disableLimitSecret: process.env.RATE_LIMIT_DISABLE_SECRET || "secret-key",
  },
  s3: {
    endpoint: process.env.S3_ENDPOINT || "http://localhost:4566",
    region: process.env.S3_REGION || "us-east-1",
    accessKeyId: process.env.S3_ACCESS_KEY_ID || "test",
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || "test",
    bucket: process.env.S3_BUCKET || "stellar-gallery",
    publicBaseUrl:
      process.env.S3_PUBLIC_BASE_URL ||
      "http://localhost:4566/stellar-gallery",
    forcePathStyle: (process.env.S3_FORCE_PATH_STYLE || "true") === "true",
  },
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    mockEnabled: (process.env.GOOGLE_MOCK_ENABLED || "true") === "true",
  },
  email: {
    enabled: (process.env.EMAIL_ENABLED || "true") === "true",
    from:
      process.env.EMAIL_FROM ||
      "Stellar Gallery <no-reply@stellar-gallery.local>",
    region: process.env.SES_REGION || process.env.AWS_REGION || "us-east-1",
    endpoint: process.env.SES_ENDPOINT || undefined,
    accessKeyId: process.env.SES_ACCESS_KEY_ID || undefined,
    secretAccessKey: process.env.SES_SECRET_ACCESS_KEY || undefined,
  },
});

const config = getConfig();

export default config;
