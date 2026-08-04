import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class AuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  findUserByEmail(email: string) {
    return this.prisma.user.findFirst({ where: { email, deletedAt: null } });
  }

  findUserById(id: string) {
    return this.prisma.user.findFirst({ where: { id, deletedAt: null } });
  }

  // auth.md #3.2: tìm theo Google `sub` — ưu tiên tra trước email vì `sub`
  // không đổi kể cả khi user đổi email bên Google.
  findUserByGoogleId(googleId: string) {
    return this.prisma.user.findFirst({ where: { googleId, deletedAt: null } });
  }

  createUser(data: { email: string; passwordHash: string; name: string }) {
    // Ghi tường minh deletedAt/deletedBy = null: Prisma+MongoDB không match
    // filter `deletedAt: null` nếu field hoàn toàn không tồn tại trong document.
    return this.prisma.user.create({
      data: { ...data, deletedAt: null, deletedBy: null },
    });
  }

  // auth.md #3.2: User tạo mới hoàn toàn qua Google — không có passwordHash.
  createUserFromGoogle(data: {
    email: string;
    googleId: string;
    name: string;
    avatarUrl?: string;
  }) {
    return this.prisma.user.create({
      data: {
        ...data,
        passwordHash: null,
        deletedAt: null,
        deletedBy: null,
      },
    });
  }

  // auth.md #3.2: gắn Google vào User Email+Password đã có sẵn (account linking
  // theo email) — không đổi passwordHash hiện có, user vẫn login được cả 2 cách.
  linkGoogleId(userId: string, googleId: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { googleId },
    });
  }

  // auth.md #3.2: đồng bộ avatar theo Google mỗi lần đăng nhập qua Google (kể
  // cả tài khoản đã liên kết từ trước) — clear avatarPublicId vì ảnh không còn
  // do Cloudinary quản lý nữa (khác luồng POST /users/me/avatar).
  updateAvatarFromGoogle(userId: string, avatarUrl: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl, avatarPublicId: null },
    });
  }

  updateUserPassword(userId: string, passwordHash: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });
  }

  createRefreshToken(data: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    userAgent?: string;
    ipAddress?: string;
  }) {
    // Ghi tường minh revokedAt = null (xem lý do ở createUser()).
    return this.prisma.refreshToken.create({
      data: { ...data, revokedAt: null },
    });
  }

  findRefreshTokenByHash(tokenHash: string) {
    return this.prisma.refreshToken.findUnique({ where: { tokenHash } });
  }

  revokeRefreshToken(id: string) {
    return this.prisma.refreshToken.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
  }

  revokeAllRefreshTokensForUser(userId: string) {
    return this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  createPasswordResetToken(data: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }) {
    return this.prisma.passwordResetToken.create({
      data: { ...data, usedAt: null },
    });
  }

  findPasswordResetTokenByHash(tokenHash: string) {
    return this.prisma.passwordResetToken.findUnique({ where: { tokenHash } });
  }

  markPasswordResetTokenUsed(id: string) {
    return this.prisma.passwordResetToken.update({
      where: { id },
      data: { usedAt: new Date() },
    });
  }
}
