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
import { OAuth2Client, type TokenPayload } from 'google-auth-library';
import ms, { type StringValue } from 'ms';
import {
  generateSecret as generateTwoFactorSecret,
  generateURI as generateTwoFactorUri,
  verify as verifyTwoFactorCode,
} from 'otplib';
import { toDataURL as toQrCodeDataUrl } from 'qrcode';
import { AuthRepository } from './auth.repository';
import { MailQueueService } from '../../config/mail-queue.service';
import { withTimeout } from '../../common/utils/with-timeout.util';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { GoogleAuthDto } from './dto/google-auth.dto';
import { EnableTwoFactorDto } from './dto/enable-two-factor.dto';
import { DisableTwoFactorDto } from './dto/disable-two-factor.dto';
import { VerifyTwoFactorLoginDto } from './dto/verify-two-factor-login.dto';
import { UserEntity } from '../user/entities/user.entity';

const BCRYPT_SALT_ROUNDS = 10;
const RESET_TOKEN_TTL_MS = ms('1h');
const ENQUEUE_TIMEOUT_MS = 3000;
// auth.md #3.3: claim đánh dấu token tạm chờ mã 2FA — JwtStrategy chặn hẳn
// token có claim này khỏi dùng như access token thật (xem jwt.strategy.ts).
const TWO_FACTOR_PENDING_PURPOSE = 'two-factor-pending';
const TWO_FACTOR_PENDING_TTL = '5m';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

// login()/googleLogin() trả 1 trong 2 dạng: cần thêm bước 2FA (chưa có token
// thật) hoặc đăng nhập xong hẳn (giống hành vi cũ khi user chưa bật 2FA).
export type LoginResult =
  | { requiresTwoFactor: true; tempToken: string }
  | (AuthTokens & { requiresTwoFactor: false; user: UserEntity });

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly googleClient: OAuth2Client;

  constructor(
    private readonly authRepository: AuthRepository,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly mailQueueService: MailQueueService,
  ) {
    this.googleClient = new OAuth2Client(
      this.configService.get<string>('google.clientId'),
    );
  }

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
  ): Promise<LoginResult> {
    const user = await this.authRepository.findUserByEmail(dto.email);
    // auth.md #3.1: User tạo qua Google có thể chưa có passwordHash — không
    // so sánh compare(password, null) (bcrypt sẽ throw), coi như sai luôn.
    const isPasswordValid = user?.passwordHash
      ? await compare(dto.password, user.passwordHash)
      : false;

    if (!user || !isPasswordValid) {
      throw new UnauthorizedException('Email hoặc mật khẩu không đúng');
    }

    // auth.md #3.3: mật khẩu đúng nhưng đã bật 2FA — chưa cấp token thật,
    // bắt buộc thêm bước POST /auth/2fa/verify-login với mã TOTP.
    if (user.twoFactorEnabled) {
      return {
        requiresTwoFactor: true,
        tempToken: await this.issuePendingTwoFactorToken(user.id),
      };
    }

    const tokens = await this.issueTokens(user.id, meta);
    return {
      ...tokens,
      requiresTwoFactor: false,
      user: this.toUserEntity(user),
    };
  }

  // auth.md #3.2: verify ID Token thật từ Google Identity Services (Frontend),
  // account linking theo email — không cần Client Secret, chỉ verify bằng
  // public key của Google qua GOOGLE_CLIENT_ID (audience).
  async googleLogin(
    dto: GoogleAuthDto,
    meta: { userAgent?: string; ipAddress?: string },
  ): Promise<LoginResult> {
    const clientId = this.configService.get<string>('google.clientId');
    let payload: TokenPayload | undefined;
    try {
      const ticket = await this.googleClient.verifyIdToken({
        idToken: dto.idToken,
        audience: clientId,
      });
      payload = ticket.getPayload();
    } catch {
      throw new UnauthorizedException('ID Token Google không hợp lệ');
    }

    if (!payload?.sub || !payload.email) {
      throw new UnauthorizedException('ID Token Google không hợp lệ');
    }
    if (!payload.email_verified) {
      throw new UnauthorizedException('Email Google chưa được xác thực');
    }

    let user = await this.authRepository.findUserByGoogleId(payload.sub);

    if (!user) {
      const existingByEmail = await this.authRepository.findUserByEmail(
        payload.email,
      );
      if (existingByEmail) {
        // Account linking: email đã có tài khoản Email+Password — gắn Google
        // vào tài khoản đó, không tạo User mới, giữ nguyên passwordHash cũ.
        user = await this.authRepository.linkGoogleId(
          existingByEmail.id,
          payload.sub,
        );
      } else {
        user = await this.authRepository.createUserFromGoogle({
          email: payload.email,
          googleId: payload.sub,
          name: payload.name ?? payload.email,
          avatarUrl: payload.picture,
        });
      }
    }

    // auth.md #3.2: mỗi lần đăng nhập Google đều đồng bộ avatar mới nhất từ
    // Google (kể cả tài khoản đã liên kết từ trước) — theo yêu cầu của bạn.
    if (payload.picture && payload.picture !== user.avatarUrl) {
      user = await this.authRepository.updateAvatarFromGoogle(
        user.id,
        payload.picture,
      );
    }

    // auth.md #3.3: 2FA áp dụng cho mọi cách đăng nhập, kể cả Google — nếu
    // không chặn ở đây, đăng nhập Google sẽ là đường vòng bỏ qua 2FA hoàn toàn.
    if (user.twoFactorEnabled) {
      return {
        requiresTwoFactor: true,
        tempToken: await this.issuePendingTwoFactorToken(user.id),
      };
    }

    const tokens = await this.issueTokens(user.id, meta);
    return {
      ...tokens,
      requiresTwoFactor: false,
      user: this.toUserEntity(user),
    };
  }

  // auth.md #3.3: hoàn tất đăng nhập sau khi đã qua bước mật khẩu/Google,
  // xác thực đúng mã TOTP hiện tại rồi mới thật sự cấp Access/Refresh Token.
  async verifyTwoFactorLogin(
    dto: VerifyTwoFactorLoginDto,
    meta: { userAgent?: string; ipAddress?: string },
  ): Promise<AuthTokens & { user: UserEntity }> {
    let payload: { sub: string; purpose?: string };
    try {
      payload = await this.jwtService.verifyAsync(dto.tempToken);
    } catch {
      throw new UnauthorizedException(
        'Token xác thực 2FA không hợp lệ hoặc đã hết hạn',
      );
    }
    if (payload.purpose !== TWO_FACTOR_PENDING_PURPOSE) {
      throw new UnauthorizedException('Token không hợp lệ cho thao tác này');
    }

    const user = await this.authRepository.findUserById(payload.sub);
    if (!user?.twoFactorEnabled || !user.twoFactorSecret) {
      throw new UnauthorizedException('Tài khoản chưa bật 2FA');
    }

    const result = await verifyTwoFactorCode({
      token: dto.code,
      secret: user.twoFactorSecret,
    });
    if (!result.valid) {
      throw new UnauthorizedException('Mã xác thực không đúng');
    }

    const tokens = await this.issueTokens(user.id, meta);
    return { ...tokens, user: this.toUserEntity(user) };
  }

  // auth.md #3.3: bước 1 — sinh secret mới, CHƯA bật (chờ POST /2fa/enable
  // xác nhận đúng mã lần đầu mới thật sự bật). Gọi lại /setup nhiều lần trước
  // khi enable sẽ ghi đè secret cũ bằng secret mới (secret cũ coi như huỷ).
  async setupTwoFactor(
    userId: string,
  ): Promise<{ secret: string; qrCodeDataUrl: string }> {
    const user = await this.authRepository.findUserById(userId);
    if (!user) {
      throw new UnauthorizedException('Không tìm thấy tài khoản');
    }

    const secret = generateTwoFactorSecret();
    await this.authRepository.setPendingTwoFactorSecret(userId, secret);

    const otpauthUri = generateTwoFactorUri({
      issuer: 'NDT Task',
      label: user.email,
      secret,
    });
    const qrCodeDataUrl = await toQrCodeDataUrl(otpauthUri);

    return { secret, qrCodeDataUrl };
  }

  // auth.md #3.3: bước 2 — xác nhận đúng mã từ App xác thực thì mới bật thật.
  async enableTwoFactor(
    userId: string,
    dto: EnableTwoFactorDto,
  ): Promise<void> {
    const user = await this.authRepository.findUserById(userId);
    if (!user?.twoFactorSecret) {
      throw new BadRequestException(
        'Chưa khởi tạo 2FA — gọi /auth/2fa/setup trước',
      );
    }

    const result = await verifyTwoFactorCode({
      token: dto.code,
      secret: user.twoFactorSecret,
    });
    if (!result.valid) {
      throw new UnauthorizedException('Mã xác thực không đúng');
    }

    await this.authRepository.enableTwoFactor(userId);
  }

  // auth.md #3.3: bắt buộc nhập lại đúng mã hiện tại mới tắt được — tránh
  // tắt 2FA chỉ bằng access token bị đánh cắp mà không có thiết bị xác thực.
  async disableTwoFactor(
    userId: string,
    dto: DisableTwoFactorDto,
  ): Promise<void> {
    const user = await this.authRepository.findUserById(userId);
    if (!user?.twoFactorEnabled || !user.twoFactorSecret) {
      throw new BadRequestException('2FA chưa được bật');
    }

    const result = await verifyTwoFactorCode({
      token: dto.code,
      secret: user.twoFactorSecret,
    });
    if (!result.valid) {
      throw new UnauthorizedException('Mã xác thực không đúng');
    }

    await this.authRepository.disableTwoFactor(userId);
  }

  private issuePendingTwoFactorToken(userId: string): Promise<string> {
    return this.jwtService.signAsync(
      { sub: userId, purpose: TWO_FACTOR_PENDING_PURPOSE },
      { expiresIn: TWO_FACTOR_PENDING_TTL },
    );
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
      await withTimeout(
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

  async changePassword(userId: string, dto: ChangePasswordDto): Promise<void> {
    const user = await this.authRepository.findUserById(userId);
    if (!user) {
      throw new UnauthorizedException('Không tìm thấy tài khoản');
    }
    if (!user.passwordHash) {
      // auth.md #3.1: tài khoản chỉ đăng nhập qua Google, chưa có mật khẩu
      // để "đổi" — tự đặt mật khẩu lần đầu chưa được hỗ trợ (ngoài phạm vi).
      throw new BadRequestException(
        'Tài khoản này đăng nhập bằng Google, chưa có mật khẩu để đổi',
      );
    }

    const isCurrentValid = await compare(
      dto.currentPassword,
      user.passwordHash,
    );
    if (!isCurrentValid) {
      throw new UnauthorizedException('Mật khẩu hiện tại không đúng');
    }

    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException('Mật khẩu mới phải khác mật khẩu hiện tại');
    }

    const passwordHash = await hash(dto.newPassword, BCRYPT_SALT_ROUNDS);
    await this.authRepository.updateUserPassword(userId, passwordHash);
    // Đổi mật khẩu xong thu hồi mọi refresh token (đối xứng resetPassword) —
    // access token hiện tại vẫn dùng được tới khi hết hạn, nhưng không refresh
    // được nữa nên phải đăng nhập lại bằng mật khẩu mới ở lần sau.
    await this.authRepository.revokeAllRefreshTokensForUser(userId);
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
    twoFactorEnabled: boolean;
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
      twoFactorEnabled: user.twoFactorEnabled,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
