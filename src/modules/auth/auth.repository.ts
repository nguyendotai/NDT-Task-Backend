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

  createUser(data: { email: string; passwordHash: string; name: string }) {
    // Ghi tường minh deletedAt/deletedBy = null: Prisma+MongoDB không match
    // filter `deletedAt: null` nếu field hoàn toàn không tồn tại trong document.
    return this.prisma.user.create({
      data: { ...data, deletedAt: null, deletedBy: null },
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
