# chave-ms-auth

Authentication and authorization microservice for the Chave P1 system.

## Stack

- NestJS + TypeScript
- Prisma + PostgreSQL
- JWT access tokens
- Rotating httpOnly-cookie refresh tokens
- RBAC with `admin`, `staff`, `user`, `gestor`, and `participante`
- Swagger/OpenAPI at `/docs`

## Local Setup

```bash
cp .env.example .env
npm ci
npm run prisma:generate
npx prisma migrate deploy
npm run seed
npm run start:dev
```

The API listens on `http://localhost:3001` by default.

## Environment

| Variable | Description | Development default |
|---|---|---|
| `NODE_ENV` | Runtime environment | `development` |
| `PORT` | HTTP port | `3001` |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://chave:chave_secret@localhost:5432/chave_auth?schema=public` |
| `JWT_SECRET` | Access-token signing secret, minimum 32 chars | see `.env.example` |
| `ACCESS_TOKEN_TTL` | JWT lifetime | `15m` |
| `REFRESH_TOKEN_TTL` | Refresh/session lifetime | `7d` |
| `PASSWORD_RESET_TOKEN_TTL` | Reset token lifetime | `30m` |
| `REFRESH_COOKIE_NAME` | httpOnly refresh cookie name | `chave_refresh` |
| `REFRESH_COOKIE_SECURE` | Set secure/sameSite=None cookies | `false` |
| `FRONTEND_ORIGINS` | Comma-separated CORS allowlist | `http://localhost:3000,http://localhost:4001` |
| `FRONTEND_RESET_PASSWORD_URL` | Reset-password screen URL | `http://localhost:4001/reset-password` |
| `SEED_ADMIN_EMAIL` | Seeded admin email | `admin@chave.local` |
| `SEED_ADMIN_PASSWORD` | Seeded admin password | `Admin123!` |

## API Surface

Swagger UI is available at `GET /docs`.

Authentication:

| Method | Route | Notes |
|---|---|---|
| `POST` | `/auth/register` | Creates a user, assigns `user`, returns an access token, sets refresh cookie |
| `POST` | `/auth/login` | Returns an access token and sets refresh cookie |
| `POST` | `/auth/refresh` | Rotates refresh cookie and access token |
| `POST` | `/auth/logout` | Revokes the current session |
| `POST` | `/auth/logout-all` | Revokes all sessions for the current user |
| `GET` | `/auth/me` | Current authenticated user |
| `POST` | `/auth/introspect` | Gateway-style access-token validation |
| `POST` | `/auth/forgot-password` | Generates a reset token; non-production responses include it for local testing |
| `POST` | `/auth/reset-password` | Resets password and revokes sessions |
| `POST` | `/auth/change-password` | Requires the current password and revokes sessions |

Users:

| Method | Route | Notes |
|---|---|---|
| `GET` | `/users/me` | Profile |
| `PATCH` | `/users/me` | Update profile |
| `GET` | `/users` | Admin-only |
| `GET` | `/users/:id` | Admin-only |
| `PATCH` | `/users/:id/roles` | Admin-only role replacement |
| `PATCH` | `/users/:id/status` | Admin-only activation/deactivation |

Operational:

| Method | Route | Notes |
|---|---|---|
| `GET` | `/health` | Health status |

## Security Notes

- Passwords are stored with bcrypt hashes.
- Refresh and password-reset tokens are stored only as SHA-256 hashes of high-entropy random tokens.
- Access-token claims include `sub`, `email`, `roles`, and `sessionId`.
- Protected-route guards verify both JWT validity and persisted session state.
- Refresh-token rotation revokes the old token.
- Reuse of an already-used refresh token marks the session compromised and revokes it.
- Logout, logout-all, password reset, password change, and user deactivation revoke sessions.

## Verification

```bash
npm run lint
npm run typecheck
npm test
npm run test:integration
npm run build
```

Integration tests require a PostgreSQL database available at `TEST_DATABASE_URL` or `DATABASE_URL`.

## Docker

The Docker image uses Debian-based Node to avoid Prisma/OpenSSL issues:

```bash
docker build -t chave-ms-auth .
docker run --env-file .env -p 3001:3001 chave-ms-auth
```

On startup the container runs `prisma migrate deploy`, seeds roles/admin, and starts the compiled NestJS app.
