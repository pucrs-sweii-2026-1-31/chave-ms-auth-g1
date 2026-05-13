import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { PrismaService } from "../../prisma/prisma.service";
import { AuthenticatedRequest } from "../types/authenticated-request";

interface AccessTokenPayload {
  sub: string;
  email: string;
  roles: string[];
  sessionId: string;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractBearerToken(request.headers.authorization);

    if (!token) {
      throw new UnauthorizedException("Authentication required");
    }

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<AccessTokenPayload>(token, {
        secret: this.config.getOrThrow<string>("JWT_SECRET"),
      });
    } catch {
      throw new UnauthorizedException("Invalid or expired token");
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
        user: {
          include: {
            roles: { include: { role: true } },
          },
        },
      },
    });

    if (!session) {
      throw new UnauthorizedException("Session is inactive");
    }

    request.user = {
      id: session.user.id,
      email: session.user.email,
      roles: session.user.roles.map((userRole) => userRole.role.name),
      sessionId: session.id,
    };

    return true;
  }

  private extractBearerToken(authorization?: string): string | null {
    if (!authorization?.startsWith("Bearer ")) {
      return null;
    }

    return authorization.slice("Bearer ".length).trim();
  }
}
