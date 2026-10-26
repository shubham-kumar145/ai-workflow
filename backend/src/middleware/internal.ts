import { NextFunction, Request, Response } from "express";
import { env } from "../lib/env";

/**
 * Guards /internal/*. Only the Python AI service holds this secret.
 * It must be byte-identical in backend/.env and ai-service/.env.
 */
export function requireInternalSecret(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const secret = req.headers["x-internal-secret"];
  if (typeof secret !== "string" || secret !== env.INTERNAL_SERVICE_SECRET) {
    return res.status(401).json({ error: "Bad internal service secret" });
  }
  next();
}
