import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { UpdateProfileDto } from "./dto/update-profile.dto";
import { UpdateUserRolesDto } from "./dto/update-user-roles.dto";
import { UpdateUserStatusDto } from "./dto/update-user-status.dto";
import { UserResponseDto } from "./dto/user-response.dto";

type UserWithRoles = Prisma.UserGetPayload<{
  include: { roles: { include: { role: true } } };
}>;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<UserResponseDto[]> {
    const users = await this.prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      include: { roles: { include: { role: true } } },
    });
    return users.map((user) => this.toResponse(user));
  }

  async getById(id: string): Promise<UserResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { roles: { include: { role: true } } },
    });

    if (!user) {
      throw new NotFoundException("User not found");
    }

    return this.toResponse(user);
  }

  async updateProfile(id: string, dto: UpdateProfileDto): Promise<UserResponseDto> {
    const user = await this.prisma.user.update({
      where: { id },
      data: {
        name: dto.name?.trim() || null,
      },
      include: { roles: { include: { role: true } } },
    });

    return this.toResponse(user);
  }

  async updateRoles(id: string, dto: UpdateUserRolesDto): Promise<UserResponseDto> {
    const requestedRoles = [...new Set(dto.roles.map((role) => role.trim()).filter(Boolean))];
    const roles = await this.prisma.role.findMany({
      where: { name: { in: requestedRoles } },
    });

    if (roles.length !== requestedRoles.length) {
      const found = new Set(roles.map((role) => role.name));
      const missing = requestedRoles.filter((role) => !found.has(role));
      throw new BadRequestException(`Unknown roles: ${missing.join(", ")}`);
    }

    const user = await this.prisma.$transaction(async (tx) => {
      await tx.user.findUniqueOrThrow({ where: { id } });
      await tx.userRole.deleteMany({ where: { userId: id } });
      await tx.userRole.createMany({
        data: roles.map((role) => ({ userId: id, roleId: role.id })),
        skipDuplicates: true,
      });
      return tx.user.findUniqueOrThrow({
        where: { id },
        include: { roles: { include: { role: true } } },
      });
    });

    return this.toResponse(user);
  }

  async updateStatus(id: string, dto: UpdateUserStatusDto): Promise<UserResponseDto> {
    const now = new Date();
    const user = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id },
        data: { isActive: dto.isActive },
        include: { roles: { include: { role: true } } },
      });

      if (!dto.isActive) {
        const sessions = await tx.session.findMany({
          where: { userId: id, isRevoked: false },
          select: { id: true },
        });
        const sessionIds = sessions.map((session) => session.id);
        if (sessionIds.length) {
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

      return updated;
    });

    return this.toResponse(user);
  }

  private toResponse(user: UserWithRoles): UserResponseDto {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      isActive: user.isActive,
      roles: user.roles.map((userRole) => userRole.role.name),
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
