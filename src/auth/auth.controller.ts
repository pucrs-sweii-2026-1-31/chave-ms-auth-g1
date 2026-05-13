import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { Request, Response } from "express";
import {
  getRefreshCookieName,
  getRefreshCookieOptions,
} from "../config/app-config";
import { ConfigService } from "@nestjs/config";
import { CurrentUser } from "./decorators/current-user.decorator";
import { AuthResponseDto } from "./dto/auth-response.dto";
import { ChangePasswordDto } from "./dto/change-password.dto";
import { ForgotPasswordDto } from "./dto/forgot-password.dto";
import { IntrospectionResponseDto } from "./dto/introspection-response.dto";
import { IntrospectTokenDto } from "./dto/introspect-token.dto";
import { LoginDto } from "./dto/login.dto";
import { RegisterDto } from "./dto/register.dto";
import { ResetPasswordDto } from "./dto/reset-password.dto";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { AuthService } from "./auth.service";
import { AuthenticatedUser } from "./types/authenticated-request";

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Post("register")
  @ApiCreatedResponse({ type: AuthResponseDto })
  async register(
    @Body() dto: RegisterDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponseDto> {
    const result = await this.authService.register(dto, this.contextFromRequest(request));
    this.setRefreshCookie(response, result.refreshToken);
    return result.response;
  }

  @Post("login")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: AuthResponseDto })
  @ApiUnauthorizedResponse({ description: "Invalid credentials" })
  async login(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponseDto> {
    const result = await this.authService.login(dto, this.contextFromRequest(request));
    this.setRefreshCookie(response, result.refreshToken);
    return result.response;
  }

  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Rotate the httpOnly refresh token and issue a new access token" })
  @ApiOkResponse({ type: AuthResponseDto })
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponseDto> {
    const refreshToken = request.cookies?.[getRefreshCookieName(this.config)];
    if (!refreshToken) {
      throw new UnauthorizedException("Refresh token required");
    }

    const result = await this.authService.refresh(refreshToken, this.contextFromRequest(request));
    this.setRefreshCookie(response, result.refreshToken);
    return result.response;
  }

  @Post("logout")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  async logout(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.authService.logout(user);
    this.clearRefreshCookie(response);
  }

  @Post("logout-all")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  async logoutAll(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.authService.logoutAll(user);
    this.clearRefreshCookie(response);
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOkResponse({ type: AuthResponseDto })
  async me(@CurrentUser() user: AuthenticatedUser): Promise<AuthResponseDto["user"]> {
    return this.authService.getMe(user.id);
  }

  @Post("introspect")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: IntrospectionResponseDto })
  async introspect(@Body() dto: IntrospectTokenDto): Promise<IntrospectionResponseDto> {
    return this.authService.introspect(dto.token);
  }

  @Post("forgot-password")
  @HttpCode(HttpStatus.OK)
  @ApiBody({ type: ForgotPasswordDto })
  @ApiOkResponse({ description: "Generic reset response" })
  async forgotPassword(@Body() dto: ForgotPasswordDto): Promise<Record<string, string>> {
    return this.authService.forgotPassword(dto);
  }

  @Post("reset-password")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<void> {
    await this.authService.resetPassword(dto);
  }

  @Post("change-password")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  async changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.authService.changePassword(user, dto);
    this.clearRefreshCookie(response);
  }

  private setRefreshCookie(response: Response, refreshToken: string): void {
    response.cookie(
      getRefreshCookieName(this.config),
      refreshToken,
      getRefreshCookieOptions(this.config),
    );
  }

  private clearRefreshCookie(response: Response): void {
    response.clearCookie(getRefreshCookieName(this.config), {
      ...getRefreshCookieOptions(this.config),
      maxAge: undefined,
    });
  }

  private contextFromRequest(request: Request): { userAgent?: string; ipAddress?: string } {
    return {
      userAgent: request.get("user-agent"),
      ipAddress: request.ip,
    };
  }
}
