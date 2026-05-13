import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import request from "supertest";
import { PrismaService } from "../src/prisma/prisma.service";

const jwtSecret = "integration-test-secret-with-at-least-32-chars";
const databaseUrl =
  process.env.TEST_DATABASE_URL ||
  process.env.DATABASE_URL ||
  "postgresql://chave:chave_secret@localhost:5432/chave_auth_test?schema=public";

interface AuthBody {
  accessToken: string;
  user: {
    id: string;
    email: string;
    roles: string[];
  };
}

describe("auth integration", () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    process.env.NODE_ENV = "test";
    process.env.PORT = "3001";
    process.env.DATABASE_URL = databaseUrl;
    process.env.JWT_SECRET = jwtSecret;
    process.env.ACCESS_TOKEN_TTL = "15m";
    process.env.REFRESH_TOKEN_TTL = "7d";
    process.env.PASSWORD_RESET_TOKEN_TTL = "30m";
    process.env.REFRESH_COOKIE_NAME = "chave_refresh";
    process.env.REFRESH_COOKIE_SECURE = "false";
    process.env.FRONTEND_ORIGINS = "http://localhost:3000,http://localhost:4001";
    process.env.FRONTEND_RESET_PASSWORD_URL = "http://localhost:4001/reset-password";
    process.env.SEED_ADMIN_EMAIL = "admin@chave.local";
    process.env.SEED_ADMIN_PASSWORD = "Admin123!";

    const { AppModule } = await import("../src/app.module");
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    prisma = app.get(PrismaService);
    await resetDatabase();
    await seedRoles();
  });

  afterAll(async () => {
    await app?.close();
  });

  it("registers, logs in, and returns the current authenticated user", async () => {
    const email = uniqueEmail("current");
    const password = "StrongPass123!";

    const register = await request(app.getHttpServer())
      .post("/auth/register")
      .send({ email, password, name: "Current User" })
      .expect(201);

    const body = register.body as AuthBody;
    expect(body.accessToken).toEqual(expect.any(String));
    expect(body.user.email).toBe(email);
    expect(body.user.roles).toContain("user");
    expect(extractRefreshCookie(register)).toContain("chave_refresh=");

    const login = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email, password })
      .expect(200);

    await request(app.getHttpServer())
      .get("/auth/me")
      .set("Authorization", `Bearer ${(login.body as AuthBody).accessToken}`)
      .expect(200)
      .expect(({ body: me }) => {
        expect(me.email).toBe(email);
        expect(me.roles).toContain("user");
      });
  });

  it("rotates refresh tokens and revokes the current session on logout", async () => {
    const { accessToken, refreshCookie } = await registerAndLogin("logout");

    const refresh = await request(app.getHttpServer())
      .post("/auth/refresh")
      .set("Cookie", refreshCookie)
      .send()
      .expect(200);

    const rotatedCookie = extractRefreshCookie(refresh);
    const rotatedAccessToken = (refresh.body as AuthBody).accessToken;
    expect(rotatedCookie).not.toBe(refreshCookie);

    await request(app.getHttpServer())
      .post("/auth/logout")
      .set("Authorization", `Bearer ${rotatedAccessToken}`)
      .expect(204);

    await request(app.getHttpServer())
      .post("/auth/introspect")
      .send({ token: accessToken })
      .expect(200)
      .expect(({ body }) => {
        expect(body.active).toBe(false);
      });
  });

  it("runs the forgot/reset password flow and revokes existing sessions", async () => {
    const email = uniqueEmail("reset");
    const password = "StrongPass123!";
    const newPassword = "NewStrongPass123!";
    await request(app.getHttpServer()).post("/auth/register").send({ email, password }).expect(201);
    const login = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email, password })
      .expect(200);

    const forgot = await request(app.getHttpServer())
      .post("/auth/forgot-password")
      .send({ email })
      .expect(200);
    expect(forgot.body.resetToken).toEqual(expect.any(String));

    await request(app.getHttpServer())
      .post("/auth/reset-password")
      .send({ token: forgot.body.resetToken, newPassword })
      .expect(204);

    await request(app.getHttpServer())
      .post("/auth/introspect")
      .send({ token: (login.body as AuthBody).accessToken })
      .expect(200)
      .expect(({ body }) => {
        expect(body.active).toBe(false);
      });

    await request(app.getHttpServer()).post("/auth/login").send({ email, password }).expect(401);
    await request(app.getHttpServer()).post("/auth/login").send({ email, password: newPassword }).expect(200);
  });

  it("enforces admin-only user routes", async () => {
    const normal = await registerAndLogin("normal");
    const admin = await createAdminAndLogin();

    await request(app.getHttpServer())
      .get("/users")
      .set("Authorization", `Bearer ${normal.accessToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .get("/users")
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .expect(200)
      .expect(({ body }) => {
        expect(Array.isArray(body)).toBe(true);
      });
  });

  it("reads and updates the authenticated user's profile", async () => {
    const { email, accessToken } = await registerAndLogin("profile");

    await request(app.getHttpServer())
      .get("/users/me")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.email).toBe(email);
        expect(body.roles).toContain("user");
      });

    await request(app.getHttpServer())
      .patch("/users/me")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Updated Profile" })
      .expect(200)
      .expect(({ body }) => {
        expect(body.email).toBe(email);
        expect(body.name).toBe("Updated Profile");
      });
  });

  it("returns active and inactive states from token introspection", async () => {
    const { accessToken } = await registerAndLogin("introspect");

    await request(app.getHttpServer())
      .post("/auth/introspect")
      .send({ token: accessToken })
      .expect(200)
      .expect(({ body }) => {
        expect(body.active).toBe(true);
        expect(body.email).toContain("@example.com");
      });

    await request(app.getHttpServer())
      .post("/auth/introspect")
      .send({ token: `${accessToken}.invalid` })
      .expect(200)
      .expect(({ body }) => {
        expect(body.active).toBe(false);
      });
  });

  it("detects refresh token reuse and marks the session inactive", async () => {
    const { accessToken, refreshCookie } = await registerAndLogin("reuse");

    const refresh = await request(app.getHttpServer())
      .post("/auth/refresh")
      .set("Cookie", refreshCookie)
      .send()
      .expect(200);

    await request(app.getHttpServer())
      .post("/auth/refresh")
      .set("Cookie", refreshCookie)
      .send()
      .expect(401);

    await request(app.getHttpServer())
      .post("/auth/introspect")
      .send({ token: accessToken })
      .expect(200)
      .expect(({ body }) => {
        expect(body.active).toBe(false);
      });

    await request(app.getHttpServer())
      .post("/auth/introspect")
      .send({ token: (refresh.body as AuthBody).accessToken })
      .expect(200)
      .expect(({ body }) => {
        expect(body.active).toBe(false);
      });
  });

  async function resetDatabase(): Promise<void> {
    await prisma.passwordResetToken.deleteMany();
    await prisma.refreshToken.deleteMany();
    await prisma.session.deleteMany();
    await prisma.userRole.deleteMany();
    await prisma.user.deleteMany();
    await prisma.role.deleteMany();
  }

  async function seedRoles(): Promise<void> {
    for (const name of ["admin", "staff", "user", "gestor", "participante"]) {
      await prisma.role.create({
        data: { name, description: `${name} role` },
      });
    }
  }

  async function registerAndLogin(label: string): Promise<{
    email: string;
    accessToken: string;
    refreshCookie: string;
  }> {
    const email = uniqueEmail(label);
    const password = "StrongPass123!";
    await request(app.getHttpServer()).post("/auth/register").send({ email, password }).expect(201);
    const login = await request(app.getHttpServer()).post("/auth/login").send({ email, password }).expect(200);
    return {
      email,
      accessToken: (login.body as AuthBody).accessToken,
      refreshCookie: extractRefreshCookie(login),
    };
  }

  async function createAdminAndLogin(): Promise<{ accessToken: string; refreshCookie: string }> {
    const email = uniqueEmail("admin");
    const password = "StrongPass123!";
    await request(app.getHttpServer()).post("/auth/register").send({ email, password }).expect(201);

    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: "admin" } });
    await prisma.userRole.createMany({
      data: [{ userId: user.id, roleId: adminRole.id }],
      skipDuplicates: true,
    });

    const login = await request(app.getHttpServer()).post("/auth/login").send({ email, password }).expect(200);
    return {
      accessToken: (login.body as AuthBody).accessToken,
      refreshCookie: extractRefreshCookie(login),
    };
  }
});

function uniqueEmail(label: string): string {
  return `${label}-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;
}

function extractRefreshCookie(response: request.Response): string {
  const setCookie = response.headers["set-cookie"];
  const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];
  const cookie = cookies.find((value) => value?.startsWith("chave_refresh="));
  if (!cookie) {
    throw new Error("Refresh cookie was not set");
  }
  return cookie;
}
