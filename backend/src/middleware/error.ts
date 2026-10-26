import { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { InvalidTransitionError } from "../lib/events";

export function notFound(_req: Request, res: Response) {
  res.status(404).json({ error: "Not found" });
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  if (err instanceof ZodError) {
    const first = err.issues[0];
    const where = first?.path.length ? `${first.path.join(".")}: ` : "";
    return res.status(400).json({
      error: first ? `Validation failed — ${where}${first.message}` : "Validation failed",
      issues: err.issues,
    });
  }
  if (err instanceof InvalidTransitionError) {
    return res.status(409).json({ error: err.message });
  }
  const message = err instanceof Error ? err.message : "Internal server error";
  console.error("[error]", err);
  res.status(500).json({ error: message });
}
