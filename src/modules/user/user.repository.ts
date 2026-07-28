import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string) {
    return this.prisma.user.findFirst({ where: { id, deletedAt: null } });
  }

  updateProfile(
    userId: string,
    data: { name?: string; settings?: Prisma.InputJsonValue },
  ) {
    return this.prisma.user.update({ where: { id: userId }, data });
  }

  updateAvatar(userId: string, avatarUrl: string, avatarPublicId: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl, avatarPublicId },
    });
  }
}
