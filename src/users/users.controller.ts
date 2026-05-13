import { Body, Controller, Get, Param, Patch, UseGuards } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { AuthenticatedUser } from "../auth/types/authenticated-request";
import { UpdateProfileDto } from "./dto/update-profile.dto";
import { UpdateUserRolesDto } from "./dto/update-user-roles.dto";
import { UpdateUserStatusDto } from "./dto/update-user-status.dto";
import { UserResponseDto } from "./dto/user-response.dto";
import { UsersService } from "./users.service";

@ApiTags("users")
@ApiBearerAuth()
@Controller("users")
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get("me")
  @UseGuards(JwtAuthGuard)
  @ApiOkResponse({ type: UserResponseDto })
  getMyProfile(@CurrentUser() user: AuthenticatedUser): Promise<UserResponseDto> {
    return this.usersService.getById(user.id);
  }

  @Patch("me")
  @UseGuards(JwtAuthGuard)
  @ApiOkResponse({ type: UserResponseDto })
  updateMyProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateProfileDto,
  ): Promise<UserResponseDto> {
    return this.usersService.updateProfile(user.id, dto);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin")
  @ApiOperation({ summary: "List users. Admin-only." })
  @ApiOkResponse({ type: UserResponseDto, isArray: true })
  listUsers(): Promise<UserResponseDto[]> {
    return this.usersService.list();
  }

  @Get(":id")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin")
  @ApiOperation({ summary: "Get any user by id. Admin-only." })
  @ApiOkResponse({ type: UserResponseDto })
  getUser(@Param("id") id: string): Promise<UserResponseDto> {
    return this.usersService.getById(id);
  }

  @Patch(":id/roles")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin")
  @ApiOperation({ summary: "Replace user roles. Admin-only." })
  @ApiOkResponse({ type: UserResponseDto })
  updateRoles(
    @Param("id") id: string,
    @Body() dto: UpdateUserRolesDto,
  ): Promise<UserResponseDto> {
    return this.usersService.updateRoles(id, dto);
  }

  @Patch(":id/status")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin")
  @ApiOperation({ summary: "Activate or deactivate a user. Admin-only." })
  @ApiOkResponse({ type: UserResponseDto })
  updateStatus(
    @Param("id") id: string,
    @Body() dto: UpdateUserStatusDto,
  ): Promise<UserResponseDto> {
    return this.usersService.updateStatus(id, dto);
  }
}
