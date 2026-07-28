import { createHash, randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { compare, hash } from 'bcrypt';
import ms, { type StringValue } from 'ms';
import { AuthRepository } from './auth.repository';
import { MailQueueService } from '../../config/mail-queue.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { UserEntity } from '../user/entities/user.entity';

const BCRYPT_SALT_ROUNDS = 10;
const RESET_TOKEN_TTL_MS = ms('1h');
const ENQUEUE_TIMEOUT_MS = 3000;

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly authRepository: AuthRepository,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly mailQueueService: MailQueueService,
  ) {}

  async register(dto: RegisterDto): Promise<UserEntity> {
    const existing = await this.authRepository.findUserByEmail(dto.email);
    if (existing) {
      throw new ConflictException('Email đã được sử dụng');
    }

    const passwordHash = await hash(dto.password, BCRYPT_SALT_ROUNDS);
    const user = await this.authRepository.createUser({
      email: dto.email,
      passwordHash,
      name: dto.name,
    });

    return this.toUserEntity(user);
  }

  async login(
    dto: LoginDto,
    meta: { userAgent?: string; ipAddress?: string },
  ): Promise<AuthTokens & { user: UserEntity }> {
    const user = await this.authRepository.findUserByEmail(dto.email);
    const isPasswordValid = user
      ? await compare(dto.password, user.passwordHash)
      : false;

    if (!user || !isPasswordValid) {
      throw new UnauthorizedException('Email hoặc mật khẩu không đúng');
    }

    const tokens = await this.issueTokens(user.id, meta);
    return { ...tokens, user: this.toUserEntity(user) };
  }

  async refresh(
    rawToken: string,
    meta: { userAgent?: string; ipAddress?: string },
  ): Promise<AuthTokens> {
    const tokenHash = this.hashToken(rawToken);
    const existing =
      await this.authRepository.findRefreshTokenByHash(tokenHash);

    if (
      !existing ||
      existing.revokedAt ||
      existing.expiresAt.getTime() < Date.now()
    ) {
      throw new UnauthorizedException(
        'Refresh token không hợp lệ hoặc đã hết hạn',
      );
    }

    await this.authRepository.revokeRefreshToken(existing.id);
    return this.issueTokens(existing.userId, meta);
  }

  async logout(rawToken?: string): Promise<void> {
    if (!rawToken) return;

    const tokenHash = this.hashToken(rawToken);
    const existing =
      await this.authRepository.findRefreshTokenByHash(tokenHash);
    if (existing && !existing.revokedAt) {
      await this.authRepository.revokeRefreshToken(existing.id);
    }
  }

  async forgotPassword(dto: ForgotPasswordDto): Promise<void> {
    const user = await this.authRepository.findUserByEmail(dto.email);
    if (!user) {
      // Không tiết lộ email có tồn tại hay không (chống user-enumeration).
      return;
    }

    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(rawToken);
    await this.authRepository.createPasswordResetToken({
      userId: user.id,
      tokenHash,
      expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
    });

    const frontendUrl = this.configService.get<string>('app.frontendUrl');
    const resetLink = `${frontendUrl}/reset-password?token=${rawToken}`;

    try {
      await this.withTimeout(
        this.mailQueueService.enqueueSend({
          to: user.email,
          subject: 'Đặt lại mật khẩu NDT Task',
          html: `<p>Nhấn vào liên kết sau để đặt lại mật khẩu (hết hạn sau 1 giờ):</p><p><a href="${resetLink}">${resetLink}</a></p>`,
        }),
        ENQUEUE_TIMEOUT_MS,
      );
    } catch (error) {
      // Side-effect không được làm hỏng luồng chính (business-rules.md #5).
      // Có timeout riêng vì BullMQ/ioredis mặc định giữ lệnh chờ vô hạn khi
      // Redis không reachable (enableOfflineQueue), sẽ treo cả request nếu không chặn.
      this.logger.warn(
        `Không thể enqueue mail reset-password cho ${user.email}: ${(error as Error).message}`,
      );
    }
  }

  private withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`Timed out after ${timeoutMs}ms`)),
        timeoutMs,
      );
      promise
        .then((value) => {
          clearTimeout(timer);
          resolve(value);
        })
        .catch((error: unknown) => {
          clearTimeout(timer);
          reject(error instanceof Error ? error : new Error(String(error)));
        });
    });
  }

  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    const tokenHash = this.hashToken(dto.token);
    const resetToken =
      await this.authRepository.findPasswordResetTokenByHash(tokenHash);

    if (
      !resetToken ||
      resetToken.usedAt ||
      resetToken.expiresAt.getTime() < Date.now()
    ) {
      throw new BadRequestException(
        'Token đặt lại mật khẩu không hợp lệ hoặc đã hết hạn',
      );
    }

    const passwordHash = await hash(dto.newPassword, BCRYPT_SALT_ROUNDS);
    await this.authRepository.updateUserPassword(
      resetToken.userId,
      passwordHash,
    );
    await this.authRepository.markPasswordResetTokenUsed(resetToken.id);
    await this.authRepository.revokeAllRefreshTokensForUser(resetToken.userId);
  }

  private async issueTokens(
    userId: string,
    meta: { userAgent?: string; ipAddress?: string },
  ): Promise<AuthTokens> {
    const accessToken = await this.jwtService.signAsync({ sub: userId });

    const rawRefreshToken = randomBytes(64).toString('hex');
    const refreshExpiresIn = this.configService.get<string>(
      'jwt.refreshToken.expiresIn',
    );
    const refreshTokenExpiresAt = new Date(
      Date.now() + ms(refreshExpiresIn as StringValue),
    );

    await this.authRepository.createRefreshToken({
      userId,
      tokenHash: this.hashToken(rawRefreshToken),
      expiresAt: refreshTokenExpiresAt,
      userAgent: meta.userAgent,
      ipAddress: meta.ipAddress,
    });

    return {
      accessToken,
      refreshToken: rawRefreshToken,
      refreshTokenExpiresAt,
    };
  }

  private hashToken(rawToken: string): string {
    return createHash('sha256').update(rawToken).digest('hex');
  }

  private toUserEntity(user: {
    id: string;
    email: string;
    name: string;
    avatarUrl: string | null;
    avatarPublicId: string | null;
    settings: unknown;
    systemRole: UserEntity['systemRole'];
    createdAt: Date;
    updatedAt: Date;
  }): UserEntity {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      avatarPublicId: user.avatarPublicId,
      settings: user.settings as Record<string, unknown> | null,
      systemRole: user.systemRole,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
