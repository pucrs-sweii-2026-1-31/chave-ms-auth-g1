import * as Joi from "joi";

const duration = Joi.string()
  .pattern(/^(\d+)(ms|s|m|h|d)$/)
  .required();

export const validationSchema = Joi.object({
  NODE_ENV: Joi.string().valid("development", "test", "production").default("development"),
  PORT: Joi.number().port().default(3001),
  DATABASE_URL: Joi.string().uri({ scheme: ["postgresql", "postgres"] }).required(),
  JWT_SECRET: Joi.string().min(32).required(),
  ACCESS_TOKEN_TTL: duration.default("15m"),
  REFRESH_TOKEN_TTL: duration.default("7d"),
  PASSWORD_RESET_TOKEN_TTL: duration.default("30m"),
  REFRESH_COOKIE_NAME: Joi.string().min(1).default("chave_refresh"),
  REFRESH_COOKIE_SECURE: Joi.boolean().truthy("true").falsy("false").default(false),
  FRONTEND_ORIGINS: Joi.string().min(1).default("http://localhost:3000,http://localhost:4001"),
  FRONTEND_RESET_PASSWORD_URL: Joi.string().uri().default("http://localhost:4001/reset-password"),
  SEED_ADMIN_EMAIL: Joi.string().email({ tlds: { allow: false } }).default("admin@chave.local"),
  SEED_ADMIN_PASSWORD: Joi.string().min(8).default("Admin123!"),
});
