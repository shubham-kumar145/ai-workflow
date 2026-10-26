import jwt from "jsonwebtoken";
import { env } from "./env";

export interface JwtPayload {
  sub: string;
  email: string;
  role: "CLIENT" | "ADMIN";
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
  } as jwt.SignOptions);
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, env.JWT_SECRET) as JwtPayload;
}
