import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import CustomError from "@src/shared/classes/CustomError";
import { JWTAuthService } from "@src/shared/services/JWTAuthService";

export default async function authMiddleware(app: FastifyInstance) {
  const authService = new JWTAuthService();

  const authenticateToken = async (
    request: FastifyRequest,
    _reply: FastifyReply,
  ): Promise<void> => {
    const authorization = request.headers.authorization;
    if (!authorization || !authorization.startsWith("Bearer ")) {
      throw new CustomError("Authorization required", 401);
    }
    const token = authorization.substring(7).trim();
    if (!token) throw new CustomError("Token not found", 401);

    const decoded = authService.verifyToken(token);
    if (!decoded?.id || !decoded?.email) {
      throw new CustomError("Invalid token", 401);
    }
    request.user = {
      id: decoded.id,
      email: decoded.email,
      iat: decoded.iat,
      exp: decoded.exp,
    };
  };

  app.decorate("authenticate", authenticateToken);
}

export function getCurrentUser(request: FastifyRequest) {
  if (!request.user) throw new CustomError("Authorization required", 401);
  return request.user;
}
