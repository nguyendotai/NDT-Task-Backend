import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthRepository } from '../auth.repository';
import { UserEntity } from '../../user/entities/user.entity';

interface JwtPayload {
  sub: string;
  // Token tạm chờ xác thực 2FA (POST /auth/2fa/verify-login) ký bằng cùng
  // secret access token nhưng có thêm claim này — PHẢI chặn ở đây, nếu không
  // nó sẽ được chấp nhận như access token thật cho mọi route bảo vệ trong
  // 5 phút hiệu lực của nó, vô hiệu hoá toàn bộ ý nghĩa của 2FA.
  purpose?: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly authRepository: AuthRepository,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('jwt.accessToken.secret')!,
    });
  }

  async validate(payload: JwtPayload): Promise<UserEntity> {
    if (payload.purpose) {
      throw new UnauthorizedException('Token không hợp lệ cho thao tác này');
    }

    const user = await this.authRepository.findUserById(payload.sub);
    if (!user) {
      throw new UnauthorizedException('Người dùng không tồn tại');
    }

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
