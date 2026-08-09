import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { SystemRole } from '@prisma/client';
import { verify as verifyTwoFactorCode } from 'otplib';
import { AuthService } from './auth.service';
import { AuthRepository } from './auth.repository';

jest.mock('otplib', () => ({
  generateSecret: jest.fn(() => 'MOCKSECRET'),
  generateURI: jest.fn(() => 'otpauth://totp/mock'),
  verify: jest.fn(),
}));
jest.mock('qrcode', () => ({
  toDataURL: jest.fn(() => Promise.resolve('data:image/png;base64,mock')),
}));
jest.mock('bcrypt', () => ({
  hash: jest.fn(() => Promise.resolve('hashed-password')),
  compare: jest.fn(),
}));

const mockedVerifyTwoFactorCode = verifyTwoFactorCode as jest.Mock;

function buildUser(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'user-1',
    email: 'user@example.com',
    name: 'User One',
    passwordHash: 'hashed-password',
    googleId: null,
    avatarUrl: null,
    avatarPublicId: null,
    settings: null,
    systemRole: SystemRole.USER,
    twoFactorEnabled: false,
    twoFactorSecret: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    deletedAt: null,
    deletedBy: null,
    ...overrides,
  };
}

describe('AuthService', () => {
  let service: AuthService;
  let authRepository: jest.Mocked<AuthRepository>;
  let jwtService: { signAsync: jest.Mock; verifyAsync: jest.Mock };
  let configService: { get: jest.Mock };
  let mailQueueService: { enqueueSend: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();

    authRepository = {
      findUserByEmail: jest.fn(),
      findUserById: jest.fn(),
      findUserByGoogleId: jest.fn(),
      createUser: jest.fn(),
      createUserFromGoogle: jest.fn(),
      linkGoogleId: jest.fn(),
      updateAvatarFromGoogle: jest.fn(),
      updateUserPassword: jest.fn(),
      createRefreshToken: jest.fn(),
      findRefreshTokenByHash: jest.fn(),
      revokeRefreshToken: jest.fn(),
      revokeAllRefreshTokensForUser: jest.fn(),
      createPasswordResetToken: jest.fn(),
      findPasswordResetTokenByHash: jest.fn(),
      markPasswordResetTokenUsed: jest.fn(),
      setPendingTwoFactorSecret: jest.fn(),
      enableTwoFactor: jest.fn(),
      disableTwoFactor: jest.fn(),
    } as unknown as jest.Mocked<AuthRepository>;

    jwtService = {
      signAsync: jest.fn(() => Promise.resolve('signed-token')),
      verifyAsync: jest.fn(),
    };
    configService = {
      get: jest.fn((key: string) => {
        if (key === 'jwt.refreshToken.expiresIn') return '7d';
        if (key === 'google.clientId') return 'google-client-id';
        if (key === 'app.frontendUrl') return 'http://localhost:3000';
        return undefined;
      }),
    };
    mailQueueService = { enqueueSend: jest.fn(() => Promise.resolve()) };

    service = new AuthService(
      authRepository,

      jwtService as any,

      configService as any,

      mailQueueService as any,
    );
  });

  describe('register', () => {
    it('từ chối khi email đã tồn tại', async () => {
      authRepository.findUserByEmail.mockResolvedValue(buildUser());

      await expect(
        service.register({
          email: 'user@example.com',
          password: '123456',
          name: 'User One',
        }),
      ).rejects.toThrow('Email đã được sử dụng');
      expect(authRepository.createUser).not.toHaveBeenCalled();
    });

    it('tạo User mới khi email chưa tồn tại', async () => {
      authRepository.findUserByEmail.mockResolvedValue(null);
      authRepository.createUser.mockResolvedValue(buildUser());

      const result = await service.register({
        email: 'user@example.com',
        password: '123456',
        name: 'User One',
      });

      expect(authRepository.createUser).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'user@example.com',
          name: 'User One',
        }),
      );
      expect(result.email).toBe('user@example.com');
    });
  });

  describe('login', () => {
    const { compare } = jest.requireMock('bcrypt');

    it('từ chối khi không tìm thấy User', async () => {
      authRepository.findUserByEmail.mockResolvedValue(null);

      await expect(
        service.login({ email: 'unknown@example.com', password: '123456' }, {}),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('từ chối khi sai mật khẩu', async () => {
      authRepository.findUserByEmail.mockResolvedValue(buildUser());
      compare.mockResolvedValue(false);

      await expect(
        service.login({ email: 'user@example.com', password: 'wrong' }, {}),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('trả requiresTwoFactor=true khi tài khoản đã bật 2FA, chưa cấp token thật', async () => {
      authRepository.findUserByEmail.mockResolvedValue(
        buildUser({ twoFactorEnabled: true, twoFactorSecret: 'SECRET' }),
      );
      compare.mockResolvedValue(true);

      const result = await service.login(
        { email: 'user@example.com', password: '123456' },
        {},
      );

      expect(result).toEqual({
        requiresTwoFactor: true,
        tempToken: 'signed-token',
      });
      expect(authRepository.createRefreshToken).not.toHaveBeenCalled();
    });

    it('cấp token thật khi mật khẩu đúng và chưa bật 2FA', async () => {
      authRepository.findUserByEmail.mockResolvedValue(buildUser());
      compare.mockResolvedValue(true);
      authRepository.createRefreshToken.mockResolvedValue({} as never);

      const result = await service.login(
        { email: 'user@example.com', password: '123456' },
        {},
      );

      expect(result.requiresTwoFactor).toBe(false);
      if (!result.requiresTwoFactor) {
        expect(result.accessToken).toBe('signed-token');
        expect(result.user.email).toBe('user@example.com');
      }
      expect(authRepository.createRefreshToken).toHaveBeenCalledTimes(1);
    });
  });

  describe('verifyTwoFactorLogin', () => {
    it('từ chối khi tempToken không verify được', async () => {
      jwtService.verifyAsync.mockRejectedValue(new Error('invalid'));

      await expect(
        service.verifyTwoFactorLogin({ tempToken: 'bad', code: '123456' }, {}),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('từ chối khi token không mang đúng purpose two-factor-pending', async () => {
      jwtService.verifyAsync.mockResolvedValue({ sub: 'user-1' });

      await expect(
        service.verifyTwoFactorLogin(
          { tempToken: 'token', code: '123456' },
          {},
        ),
      ).rejects.toThrow('Token không hợp lệ cho thao tác này');
    });

    it('từ chối khi mã TOTP sai', async () => {
      jwtService.verifyAsync.mockResolvedValue({
        sub: 'user-1',
        purpose: 'two-factor-pending',
      });
      authRepository.findUserById.mockResolvedValue(
        buildUser({ twoFactorEnabled: true, twoFactorSecret: 'SECRET' }),
      );
      mockedVerifyTwoFactorCode.mockResolvedValue({ valid: false });

      await expect(
        service.verifyTwoFactorLogin(
          { tempToken: 'token', code: '000000' },
          {},
        ),
      ).rejects.toThrow('Mã xác thực không đúng');
      expect(authRepository.createRefreshToken).not.toHaveBeenCalled();
    });

    it('cấp token thật khi mã TOTP đúng', async () => {
      jwtService.verifyAsync.mockResolvedValue({
        sub: 'user-1',
        purpose: 'two-factor-pending',
      });
      authRepository.findUserById.mockResolvedValue(
        buildUser({ twoFactorEnabled: true, twoFactorSecret: 'SECRET' }),
      );
      mockedVerifyTwoFactorCode.mockResolvedValue({ valid: true });
      authRepository.createRefreshToken.mockResolvedValue({} as never);

      const result = await service.verifyTwoFactorLogin(
        { tempToken: 'token', code: '123456' },
        {},
      );

      expect(result.accessToken).toBe('signed-token');
      expect(authRepository.createRefreshToken).toHaveBeenCalledTimes(1);
    });
  });

  describe('enableTwoFactor', () => {
    it('từ chối khi chưa gọi setup trước đó (không có secret)', async () => {
      authRepository.findUserById.mockResolvedValue(
        buildUser({ twoFactorSecret: null }),
      );

      await expect(
        service.enableTwoFactor('user-1', { code: '123456' }),
      ).rejects.toThrow(BadRequestException);
      expect(authRepository.enableTwoFactor).not.toHaveBeenCalled();
    });

    it('từ chối khi mã xác thực sai', async () => {
      authRepository.findUserById.mockResolvedValue(
        buildUser({ twoFactorSecret: 'SECRET' }),
      );
      mockedVerifyTwoFactorCode.mockResolvedValue({ valid: false });

      await expect(
        service.enableTwoFactor('user-1', { code: '000000' }),
      ).rejects.toThrow(UnauthorizedException);
      expect(authRepository.enableTwoFactor).not.toHaveBeenCalled();
    });

    it('bật 2FA thành công khi mã đúng', async () => {
      authRepository.findUserById.mockResolvedValue(
        buildUser({ twoFactorSecret: 'SECRET' }),
      );
      mockedVerifyTwoFactorCode.mockResolvedValue({ valid: true });

      await service.enableTwoFactor('user-1', { code: '123456' });

      expect(authRepository.enableTwoFactor).toHaveBeenCalledWith('user-1');
    });
  });

  describe('disableTwoFactor', () => {
    it('từ chối khi 2FA chưa được bật', async () => {
      authRepository.findUserById.mockResolvedValue(
        buildUser({ twoFactorEnabled: false }),
      );

      await expect(
        service.disableTwoFactor('user-1', { code: '123456' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('từ chối khi mã hiện tại nhập sai', async () => {
      authRepository.findUserById.mockResolvedValue(
        buildUser({ twoFactorEnabled: true, twoFactorSecret: 'SECRET' }),
      );
      mockedVerifyTwoFactorCode.mockResolvedValue({ valid: false });

      await expect(
        service.disableTwoFactor('user-1', { code: '000000' }),
      ).rejects.toThrow(UnauthorizedException);
      expect(authRepository.disableTwoFactor).not.toHaveBeenCalled();
    });

    it('tắt 2FA thành công khi mã đúng', async () => {
      authRepository.findUserById.mockResolvedValue(
        buildUser({ twoFactorEnabled: true, twoFactorSecret: 'SECRET' }),
      );
      mockedVerifyTwoFactorCode.mockResolvedValue({ valid: true });

      await service.disableTwoFactor('user-1', { code: '123456' });

      expect(authRepository.disableTwoFactor).toHaveBeenCalledWith('user-1');
    });
  });

  describe('changePassword', () => {
    const { compare } = jest.requireMock('bcrypt');

    it('từ chối khi tài khoản chỉ đăng nhập bằng Google (không có passwordHash)', async () => {
      authRepository.findUserById.mockResolvedValue(
        buildUser({ passwordHash: null }),
      );

      await expect(
        service.changePassword('user-1', {
          currentPassword: 'old',
          newPassword: 'new123',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('từ chối khi mật khẩu hiện tại không đúng', async () => {
      authRepository.findUserById.mockResolvedValue(buildUser());
      compare.mockResolvedValue(false);

      await expect(
        service.changePassword('user-1', {
          currentPassword: 'wrong',
          newPassword: 'new123',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('từ chối khi mật khẩu mới trùng mật khẩu hiện tại', async () => {
      authRepository.findUserById.mockResolvedValue(buildUser());
      compare.mockResolvedValue(true);

      await expect(
        service.changePassword('user-1', {
          currentPassword: 'same123',
          newPassword: 'same123',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('đổi mật khẩu thành công và thu hồi toàn bộ refresh token', async () => {
      authRepository.findUserById.mockResolvedValue(buildUser());
      compare.mockResolvedValue(true);

      await service.changePassword('user-1', {
        currentPassword: 'old123',
        newPassword: 'new123',
      });

      expect(authRepository.updateUserPassword).toHaveBeenCalledWith(
        'user-1',
        'hashed-password',
      );
      expect(authRepository.revokeAllRefreshTokensForUser).toHaveBeenCalledWith(
        'user-1',
      );
    });
  });
});
