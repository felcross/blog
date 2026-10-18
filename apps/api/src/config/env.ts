import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z.string().url(),
  ADMIN_EMAIL: z.string().email(),
  WEB_URL: z.string().url(),
  SESSION_SECRET: z.string().min(16),
  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().int().positive(),
  SMTP_FROM: z.string().min(1),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  REDIS_URL: z.string().url().default("redis://localhost:6379"),
  EMAIL_WORKER_CONCURRENCY: z.coerce.number().int().positive().default(5),
  EMAIL_BACKOFF_MS: z.coerce.number().int().positive().default(5000),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error("Invalid environment variables:");
    for (const issue of parsed.error.issues) {
      console.error(`  ${issue.path.join(".")}: ${issue.message}`);
    }
    process.exit(1);
  }
  return parsed.data;
}

export const env = loadEnv();
