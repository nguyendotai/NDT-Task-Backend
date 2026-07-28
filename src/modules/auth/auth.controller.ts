import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

const REFRESH_TOKEN_COOKIE = 'refreshToken';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken, refreshToken, refreshTokenExpiresAt, user } =
      await this.authService.login(dto, this.extractMeta(req));

    this.setRefreshTokenCookie(res, refreshToken, refreshTokenExpiresAt);
    return { accessToken, user };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.authService.logout(this.extractRefreshToken(req));
    this.clearRefreshTokenCookie(res);
    return {};
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const rawToken = this.extractRefreshToken(req);
    if (!rawToken) {
      throw new UnauthorizedException('Thiếu refresh token');
    }

    const { accessToken, refreshToken, refreshTokenExpiresAt } =
      await this.authService.refresh(rawToken, this.extractMeta(req));

    this.setRefreshTokenCookie(res, refreshToken, refreshTokenExpiresAt);
    return { accessToken };
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.authService.forgotPassword(dto);
    return {
      message: 'Nếu email tồn tại, hướng dẫn đặt lại mật khẩu đã được gửi.',
    };
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.authService.resetPassword(dto);
    return {};
  }

  private extractRefreshToken(req: Request): string | undefined {
    const cookies = req.cookies as Record<string, string> | undefined;
    return cookies?.[REFRESH_TOKEN_COOKIE];
  }

  private extractMeta(req: Request) {
    return {
      userAgent: req.headers['user-agent'],
      ipAddress: req.ip,
    };
  }

  private cookiePath(): string {
    return `/${this.configService.get<string>('app.apiPrefix')}/auth`;
  }

  private setRefreshTokenCookie(res: Response, token: string, expiresAt: Date) {
    res.cookie(REFRESH_TOKEN_COOKIE, token, {
      httpOnly: true,
      secure: this.configService.get('app.env') === 'production',
      sameSite: 'lax',
      path: this.cookiePath(),
      expires: expiresAt,
    });
  }

  private clearRefreshTokenCookie(res: Response) {
    res.clearCookie(REFRESH_TOKEN_COOKIE, {
      httpOnly: true,
      secure: this.configService.get('app.env') === 'production',
      sameSite: 'lax',
      path: this.cookiePath(),
    });
  }
}
