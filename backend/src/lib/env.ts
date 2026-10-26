import dotenv from "dotenv";
dotenv.config();

const NODE_ENV = process.env.NODE_ENV ?? "development";
const isProd = NODE_ENV === "production";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

/**
 * The dev fallbacks are in a public repo, so anyone could forge tokens with
 * them. Allowed locally, refused in production.
 */
// Every value printed in this repo (code fallbacks and .env.example placeholders).
const PUBLIC_VALUES = new Set(["dev-secret-change-me", "dev-internal-secret-change-me", "change-me-to-a-long-random-string"]);

function secret(name: string, devFallback: string): string {
  const v = process.env[name];
  if (isProd && (!v || v === devFallback || PUBLIC_VALUES.has(v))) {
    throw new Error(`${name} must be set to a private value in production (the default is public).`);
  }
  return v || devFallback;
}

export const env = {
  NODE_ENV,
  PORT: Number(process.env.PORT ?? 4000),
  DATABASE_URL: required("DATABASE_URL"),
  JWT_SECRET: secret("JWT_SECRET", "dev-secret-change-me"),
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN ?? "7d",
  // Comma-separated, so the live site and a local dev server can both be allowed.
  CORS_ORIGINS: (process.env.CORS_ORIGIN ?? "http://localhost:5173")
    .split(",")
    .map((o) => o.trim().replace(/\/+$/, ""))
    .filter(Boolean),
  AI_SERVICE_URL: (process.env.AI_SERVICE_URL ?? "http://localhost:8000").replace(/\/+$/, ""),
  INTERNAL_SERVICE_SECRET: secret("INTERNAL_SERVICE_SECRET", "dev-internal-secret-change-me"),
};
