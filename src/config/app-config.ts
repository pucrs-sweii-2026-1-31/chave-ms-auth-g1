import { ConfigService } from "@nestjs/config";
import { CookieOptions } from "express";

const DURATION_PATTERN = /^(\d+)(ms|s|m|h|d)$/;

const DURATION_MULTIPLIERS: Record<string, number> = {
  ms: 1,
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
};

export function parseDurationToMs(value: string): number {
  const match = DURATION_PATTERN.exec(value);
  if (!match) {
    throw new Error(`Invalid duration value: ${value}`);
  }

  const amount = Number(match[1]);
  const unit = match[2];
  return amount * DURATION_MULTIPLIERS[unit];
}

export function getFrontendOrigins(config: ConfigService): string[] {
  return config
    .getOrThrow<string>("FRONTEND_ORIGINS")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function getRefreshCookieName(config: ConfigService): string {
  return config.getOrThrow<string>("REFRESH_COOKIE_NAME");
}

export function getRefreshCookieOptions(config: ConfigService): CookieOptions {
  const secure = config.getOrThrow<boolean>("REFRESH_COOKIE_SECURE");
  const refreshTtl = parseDurationToMs(config.getOrThrow<string>("REFRESH_TOKEN_TTL"));

  return {
    httpOnly: true,
    secure,
    sameSite: secure ? "none" : "lax",
    path: "/auth",
    maxAge: refreshTtl,
  };
}

export function getAccessTokenTtl(config: ConfigService): string {
  return config.getOrThrow<string>("ACCESS_TOKEN_TTL");
}

export function getRefreshTokenTtlMs(config: ConfigService): number {
  return parseDurationToMs(config.getOrThrow<string>("REFRESH_TOKEN_TTL"));
}

export function getPasswordResetTokenTtlMs(config: ConfigService): number {
  return parseDurationToMs(config.getOrThrow<string>("PASSWORD_RESET_TOKEN_TTL"));
}

export function addMs(date: Date, ms: number): Date {
  return new Date(date.getTime() + ms);
}
