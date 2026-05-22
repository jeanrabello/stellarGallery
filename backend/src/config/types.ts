export type Environment = "development" | "production" | "test";

export interface Config {
  app: {
    name: string;
    port: number;
    env: Environment;
    host: string;
    url: string;
    frontendUrl: string;
  };
  swagger: { enabled: boolean };
  db: {
    uri: string;
    dbName: string;
    user: string;
    password: string;
    host: string;
  };
  security: { bcryptSaltRounds: number };
  jwt: {
    tokenSecret: string;
    tokenExpiresIn: string;
    refreshTokenSecret: string;
    refreshTokenExpiresIn: string;
  };
  rateLimit: {
    enabled: boolean;
    max: number;
    timeWindow: number;
    disableLimitSecret: string;
  };
  s3: {
    endpoint: string;
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
    bucket: string;
    publicBaseUrl: string;
    forcePathStyle: boolean;
  };
  google: {
    clientId: string;
    clientSecret: string;
    mockEnabled: boolean;
  };
  email: {
    enabled: boolean;
    apiKey: string;
    from: string;
  };
}
