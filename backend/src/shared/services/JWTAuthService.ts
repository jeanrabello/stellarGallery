import jwt, { SignOptions } from "jsonwebtoken";
import CustomError from "@src/shared/classes/CustomError";
import config from "@config/api";

export class JWTAuthService {
  generateToken(payload: any): string {
    return jwt.sign(payload, config.jwt.tokenSecret, {
      expiresIn: config.jwt.tokenExpiresIn,
    } as SignOptions);
  }

  verifyToken(token: string): any {
    try {
      if (token.includes("Bearer ")) token = token.split(" ")[1];
      return jwt.verify(token, config.jwt.tokenSecret);
    } catch {
      throw new CustomError("Invalid token", 401);
    }
  }

  generateRefreshToken(payload: any): string {
    return jwt.sign(payload, config.jwt.refreshTokenSecret, {
      expiresIn: config.jwt.refreshTokenExpiresIn,
    } as SignOptions);
  }

  verifyRefreshToken(token: string): any {
    try {
      if (token.includes("Bearer ")) token = token.split(" ")[1];
      return jwt.verify(token, config.jwt.refreshTokenSecret);
    } catch {
      throw new CustomError("Invalid refresh token", 401);
    }
  }

  getTokenExpirationTime(): number {
    const expiresIn = config.jwt.tokenExpiresIn;
    if (expiresIn.endsWith("m")) return parseInt(expiresIn) * 60;
    if (expiresIn.endsWith("h")) return parseInt(expiresIn) * 3600;
    if (expiresIn.endsWith("d")) return parseInt(expiresIn) * 86400;
    return 900;
  }
}
