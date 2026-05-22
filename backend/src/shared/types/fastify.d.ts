import "fastify";

export interface AuthenticatedUser {
  id: string;
  email: string;
  iat?: number;
  exp?: number;
}

declare module "fastify" {
  interface FastifyRequest {
    user?: AuthenticatedUser;
  }
}
