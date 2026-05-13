# chave-ms-auth Specification

## Purpose

Transform `chave-ms-auth` from the authentication-service boilerplate into the complete P1 authentication and authorization microservice described in `goal.md`.

## Starting Point

The starting point is the existing boilerplate repository.

Observed local boilerplate state before the P1 work:

- JavaScript/Express-style prototype.
- Single `src/index.js` entry point.
- No NestJS module structure.
- No Prisma schema/migrations for the required auth domain.
- No persisted session/refresh-token model.
- No RBAC user administration surface.
- No full Swagger-auth service contract.
- No full unit/integration test setup.
- No production-style Docker image for the final NestJS service.

## Target State

The repository must become a NestJS + TypeScript auth service with:

- modular app structure
- Prisma/PostgreSQL persistence
- Swagger/OpenAPI
- JWT access tokens
- rotating refresh tokens
- persisted sessions
- RBAC guards
- password reset/change flows
- profile and user administration endpoints
- health endpoint
- Docker support
- CI workflow
- meaningful tests

## Required Backend Modules

The final codebase must contain these conceptual modules:

- `AuthModule`: auth flows, token/session handling, password flows.
- `UsersModule`: profile and admin user management.
- `PrismaModule`: Prisma client lifecycle.
- `HealthModule`: health endpoint.
- `ConfigModule`: validated environment-driven configuration.

## Required Data Model

The Prisma schema must include:

- `User`
- `Role`
- `UserRole`
- `Session`
- `RefreshToken`
- `PasswordResetToken`

The model must support:

- user activation/deactivation
- many-to-many user roles
- persisted sessions
- refresh token rotation
- refresh token hashing
- reset token hashing
- session revocation
- compromised session marking

## Required API Surface

Authentication endpoints:

- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`
- `POST /auth/logout-all`
- `GET /auth/me`
- `POST /auth/introspect`

Password endpoints:

- `POST /auth/forgot-password`
- `POST /auth/reset-password`
- `POST /auth/change-password`

Profile/user endpoints:

- `GET /users/me`
- `PATCH /users/me`
- `GET /users`
- `GET /users/:id`
- `PATCH /users/:id/roles`
- `PATCH /users/:id/status`

Operational endpoints:

- `GET /health`
- `GET /docs` for Swagger UI

## Security Requirements

The service must:

- hash passwords before storage
- validate all request DTOs
- issue short-lived JWT access tokens
- include `sub`, `email`, `roles`, and `sessionId` in access-token claims
- deliver refresh tokens through an httpOnly cookie
- store refresh tokens only as hashes
- rotate refresh tokens on refresh
- revoke old refresh tokens after rotation
- detect reuse of already-used refresh tokens
- revoke compromised sessions on reuse detection
- verify database session state in protected-route guards
- revoke sessions on logout and password reset

## Roles

Seed these roles:

- `admin`
- `staff`
- `user`
- `gestor`
- `participante`

Default registration assigns:

- `user`

The local seed must create an admin account controlled by environment variables, with documented development defaults.

## Configuration Requirements

The service must read configuration from environment variables:

- `NODE_ENV`
- `PORT`
- `DATABASE_URL`
- `JWT_SECRET`
- `ACCESS_TOKEN_TTL`
- `REFRESH_TOKEN_TTL`
- `PASSWORD_RESET_TOKEN_TTL`
- `REFRESH_COOKIE_NAME`
- `REFRESH_COOKIE_SECURE`
- `FRONTEND_ORIGINS`
- `FRONTEND_RESET_PASSWORD_URL`
- `SEED_ADMIN_EMAIL`
- `SEED_ADMIN_PASSWORD`

Configuration must be validated on startup.

## Docker Requirements

The Docker image must:

- install dependencies reproducibly
- generate Prisma client during build
- build TypeScript to `dist`
- include generated Prisma client at runtime
- run migrations on startup
- seed local roles/admin on startup
- start the compiled NestJS app
- avoid Alpine/OpenSSL Prisma runtime issues

## Testing Requirements

Unit tests must cover core token utilities and guard/service behavior where practical.

Integration tests must cover:

- register/login/current-user flow
- login/refresh/logout flow
- password reset flow
- admin-only route protection
- token introspection
- refresh token reuse detection where feasible

## CI Requirements

The GitHub Actions workflow must run:

- `npm ci`
- Prisma generation
- lint
- typecheck
- PostgreSQL-backed migrations
- unit tests
- integration tests
- build
- Docker build
- artifact upload
- tag-based release

## Acceptance Criteria

This repository is ready when:

- Swagger is available at `/docs`.
- The service starts locally and in Docker Compose.
- Registration, login, refresh, logout, password reset, and profile flows work.
- Admin-only endpoints enforce RBAC.
- Access-token introspection returns active/inactive status correctly.
- Tests and build pass.
- CI workflow exists and is realistic.

