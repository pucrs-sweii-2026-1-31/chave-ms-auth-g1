import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { Prisma } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import {
  addMs,
  getAccessTokenTtl,
  getPasswordResetTokenTtlMs,
  getRefreshTokenTtlMs,
  parseDurationToMs,
} from "../config/app-config";
import { PrismaService } from "../prisma/prisma.service";
import { AuthUserDto, AuthResponseDto } from "./dto/auth-response.dto";
import { ChangePasswordDto } from "./dto/change-password.dto";
import { ForgotPasswordDto } from "./dto/forgot-password.dto";
import { IntrospectionResponseDto } from "./dto/introspection-response.dto";
import { LoginDto } from "./dto/login.dto";
import { RegisterDto } from "./dto/register.dto";
import { ResetPasswordDto } from "./dto/reset-password.dto";
import { AuthenticatedUser } from "./types/authenticated-request";
import { generateOpaqueToken, hashToken, isExpired } from "./token.util";

const PASSWORD_HASH_ROUNDS = 12;

type UserWithRoles = Prisma.UserGetPayload<{
  include: { roles: { include: { role: true } } };
}>;

interface RequestContext {
  userAgent?: string;
  ipAddress?: string;
}

export interface TokenIssueResult {
  response: AuthResponseDto;
  refreshToken: string;
}

interface AccessTokenPayload {
  sub: string;
  email: string;
  roles: string[];
  sessionId: string;
  iat?: number;
  exp?: number;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto, context: RequestContext): Promise<TokenIssueResult> {
    const email = dto.email.trim().toLowerCase();
    const passwordHash = await bcrypt.hash(dto.password, PASSWORD_HASH_ROUNDS);
    const defaultRole = await this.prisma.role.upsert({
      where: { name: "user" },
      update: {},
      create: { name: "user", description: "Default authenticated user" },
    });

    try {
      const user = await this.prisma.user.create({
        data: {
          email,
          name: dto.name?.trim() || null,
          passwordHash,
          roles: {
            create: { roleId: defaultRole.id },
          },
        },
        include: { roles: { include: { role: true } } },
      });

      return this.issueSessionTokens(user, context);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("Email is already registered");
      }
      throw error;
    }
  }

  async login(dto: LoginDto, context: RequestContext): Promise<TokenIssueResult> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.trim().toLowerCase() },
      include: { roles: { include: { role: true } } },
    });

    if (!user?.isActive) {
      throw new UnauthorizedException("Invalid credentials");
    }

    const validPassword = await bcrypt.compare(dto.password, user.passwordHash);
    if (!validPassword) {
      throw new UnauthorizedException("Invalid credentials");
    }

    return this.issueSessionTokens(user, context);
  }

  async refresh(refreshToken: string, context: RequestContext): Promise<TokenIssueResult> {
    const tokenHash = hashToken(refreshToken);
    const storedToken = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: {
        session: {
          include: {
            user: { include: { roles: { include: { role: true } } } },
          },
        },
      },
    });

    if (!storedToken) {
      throw new UnauthorizedException("Invalid refresh token");
    }

    if (storedToken.usedAt) {
      await this.markSessionCompromised(storedToken.sessionId);
      throw new UnauthorizedException("Refresh token reuse detected");
    }

    if (
      storedToken.revokedAt ||
      isExpired(storedToken.expiresAt) ||
      storedToken.session.isRevoked ||
      isExpired(storedToken.session.expiresAt) ||
      !storedToken.session.user.isActive
    ) {
      throw new UnauthorizedException("Invalid refresh token");
    }

    const now = new Date();
    const newRefreshToken = generateOpaqueToken();
    const expiresAt = addMs(now, getRefreshTokenTtlMs(this.config));

    await this.prisma.$transaction([
      this.prisma.refreshToken.update({
        where: { id: storedToken.id },
        data: { usedAt: now, revokedAt: now },
      }),
      this.prisma.refreshToken.create({
        data: {
          sessionId: storedToken.sessionId,
          tokenHash: hashToken(newRefreshToken),
          expiresAt,
        },
      }),
      this.prisma.session.update({
        where: { id: storedToken.sessionId },
        data: {
          expiresAt,
          userAgent: context.userAgent,
          ipAddress: context.ipAddress,
        },
      }),
    ]);

    return {
      response: await this.buildAuthResponse(storedToken.session.user, storedToken.sessionId),
      refreshToken: newRefreshToken,
    };
  }

  async logout(user: AuthenticatedUser): Promise<void> {
    await this.revokeSessions([user.sessionId]);
  }

  async logoutAll(user: AuthenticatedUser): Promise<void> {
    await this.revokeUserSessions(user.id);
  }

  async getMe(userId: string): Promise<AuthUserDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { roles: { include: { role: true } } },
    });

    if (!user?.isActive) {
      throw new UnauthorizedException("User is inactive");
    }

    return this.toAuthUser(user);
  }

  async forgotPassword(dto: ForgotPasswordDto): Promise<Record<string, string>> {
    const message = "If the email exists, password reset instructions were generated.";
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.trim().toLowerCase() },
    });

    if (!user?.isActive) {
      return { message };
    }

    const resetToken = generateOpaqueToken();
    const expiresAt = addMs(new Date(), getPasswordResetTokenTtlMs(this.config));
    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(resetToken),
        expiresAt,
      },
    });

    if (this.config.getOrThrow<string>("NODE_ENV") === "production") {
      return { message };
    }

    const resetUrl = new URL(this.config.getOrThrow<string>("FRONTEND_RESET_PASSWORD_URL"));
    resetUrl.searchParams.set("token", resetToken);
    return { message, resetToken, resetUrl: resetUrl.toString() };
  }

  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    const resetToken = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashToken(dto.token) },
      include: { user: true },
    });

    if (
      !resetToken ||
      resetToken.usedAt ||
      resetToken.revokedAt ||
      isExpired(resetToken.expiresAt) ||
      !resetToken.user.isActive
    ) {
      throw new BadRequestException("Invalid or expired password reset token");
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, PASSWORD_HASH_ROUNDS);
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: resetToken.userId },
        data: { passwordHash },
      });
      await tx.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { usedAt: now, revokedAt: now },
      });
      await this.revokeUserSessionsInTransaction(tx, resetToken.userId, now);
    });
  }

  async changePassword(user: AuthenticatedUser, dto: ChangePasswordDto): Promise<void> {
    const currentUser = await this.prisma.user.findUnique({ where: { id: user.id } });
    if (!currentUser?.isActive) {
      throw new UnauthorizedException("User is inactive");
    }

    const validPassword = await bcrypt.compare(dto.currentPassword, currentUser.passwordHash);
    if (!validPassword) {
      throw new UnauthorizedException("Invalid credentials");
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, PASSWORD_HASH_ROUNDS);
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { passwordHash },
      });
      await this.revokeUserSessionsInTransaction(tx, user.id, now);
    });
  }

  async introspect(token: string): Promise<IntrospectionResponseDto> {
    let payload: AccessTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<AccessTokenPayload>(token, {
        secret: this.config.getOrThrow<string>("JWT_SECRET"),
      });
    } catch {
      return { active: false };
    }

    const session = await this.prisma.session.findFirst({
      where: {
        id: payload.sessionId,
        userId: payload.sub,
        isRevoked: false,
        expiresAt: { gt: new Date() },
        user: { isActive: true },
      },
      include: {
        user: { include: { roles: { include: { role: true } } } },
      },
    });

    if (!session) {
      return { active: false };
    }

    return {
      active: true,
      sub: session.userId,
      email: session.user.email,
      roles: session.user.roles.map((userRole) => userRole.role.name),
      sessionId: session.id,
      exp: payload.exp,
      iat: payload.iat,
    };
  }

  private async issueSessionTokens(
    user: UserWithRoles,
    context: RequestContext,
  ): Promise<TokenIssueResult> {
    const refreshToken = generateOpaqueToken();
    const expiresAt = addMs(new Date(), getRefreshTokenTtlMs(this.config));

    const session = await this.prisma.session.create({
      data: {
        userId: user.id,
        userAgent: context.userAgent,
        ipAddress: context.ipAddress,
        expiresAt,
        refreshTokens: {
          create: {
            tokenHash: hashToken(refreshToken),
            expiresAt,
          },
        },
      },
    });

    return {
      response: await this.buildAuthResponse(user, session.id),
      refreshToken,
    };
  }

  private async buildAuthResponse(user: UserWithRoles, sessionId: string): Promise<AuthResponseDto> {
    const roles = user.roles.map((userRole) => userRole.role.name);
    const accessTokenTtl = getAccessTokenTtl(this.config);
    const expiresIn = Math.floor(parseDurationToMs(accessTokenTtl) / 1000);
    const accessToken = await this.jwtService.signAsync(
      {
        sub: user.id,
        email: user.email,
        roles,
        sessionId,
      },
      {
        secret: this.config.getOrThrow<string>("JWT_SECRET"),
        expiresIn,
      },
    );

    return {
      accessToken,
      tokenType: "Bearer",
      expiresIn,
      user: this.toAuthUser(user),
    };
  }

  private toAuthUser(user: UserWithRoles): AuthUserDto {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      roles: user.roles.map((userRole) => userRole.role.name),
    };
  }

  private async markSessionCompromised(sessionId: string): Promise<void> {
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.session.updateMany({
        where: { id: sessionId },
        data: { isRevoked: true, revokedAt: now, compromisedAt: now },
      }),
      this.prisma.refreshToken.updateMany({
        where: { sessionId, revokedAt: null },
        data: { revokedAt: now },
      }),
    ]);
  }

  private async revokeUserSessions(userId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.revokeUserSessionsInTransaction(tx, userId, new Date());
    });
  }

  private async revokeUserSessionsInTransaction(
    tx: Prisma.TransactionClient,
    userId: string,
    now: Date,
  ): Promise<void> {
    const sessions = await tx.session.findMany({
      where: { userId, isRevoked: false },
      select: { id: true },
    });
    await this.revokeSessionsInTransaction(tx, sessions.map((session) => session.id), now);
  }

  private async revokeSessions(sessionIds: string[]): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.revokeSessionsInTransaction(tx, sessionIds, new Date());
    });
  }

  private async revokeSessionsInTransaction(
    tx: Prisma.TransactionClient,
    sessionIds: string[],
    now: Date,
  ): Promise<void> {
    if (!sessionIds.length) {
      return;
    }

    await tx.session.updateMany({
      where: { id: { in: sessionIds } },
      data: { isRevoked: true, revokedAt: now },
    });
    await tx.refreshToken.updateMany({
      where: { sessionId: { in: sessionIds }, revokedAt: null },
      data: { revokedAt: now },
    });
  }
}
