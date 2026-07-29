import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class BoardRepository {
  constructor(private readonly prisma: PrismaService) {}

  findActiveByWorkspaceId(workspaceId: string) {
    return this.prisma.board.findFirst({
      where: { workspaceId, deletedAt: null },
      include: {
        columns: {
          where: { deletedAt: null },
          orderBy: { order: 'asc' },
        },
      },
    });
  }
}
