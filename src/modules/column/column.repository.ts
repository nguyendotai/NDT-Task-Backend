import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class ColumnRepository {
  constructor(private readonly prisma: PrismaService) {}

  findActiveBoardByWorkspaceId(workspaceId: string) {
    return this.prisma.board.findFirst({
      where: { workspaceId, deletedAt: null },
    });
  }

  findActiveWithBoard(columnId: string) {
    return this.prisma.column.findFirst({
      where: { id: columnId, deletedAt: null },
      include: { board: { select: { workspaceId: true } } },
    });
  }

  findActiveByBoardIdAndName(boardId: string, name: string) {
    return this.prisma.column.findFirst({
      where: { boardId, name, deletedAt: null },
    });
  }

  countActiveColumns(boardId: string) {
    return this.prisma.column.count({ where: { boardId, deletedAt: null } });
  }

  // Column không tự query Task module (tránh phụ thuộc chéo module) — đếm
  // thẳng qua Prisma, giống cách WorkspaceRepository đếm Task xuyên Board/
  // Column ở countActiveTasksByWorkspaceIds.
  countActiveTasksInColumn(columnId: string) {
    return this.prisma.task.count({ where: { columnId, deletedAt: null } });
  }

  listActiveByBoardId(boardId: string) {
    return this.prisma.column.findMany({
      where: { boardId, deletedAt: null },
      orderBy: { order: 'asc' },
    });
  }

  create(data: { boardId: string; name: string; order: number }) {
    return this.prisma.column.create({
      data: { ...data, deletedAt: null, deletedBy: null },
    });
  }

  updateName(id: string, name: string) {
    return this.prisma.column.update({ where: { id }, data: { name } });
  }

  softDelete(id: string, deletedBy: string) {
    return this.prisma.column.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy },
    });
  }

  async reorder(orderedColumnIds: string[]) {
    await this.prisma.$transaction(
      orderedColumnIds.map((id, index) =>
        this.prisma.column.update({ where: { id }, data: { order: index } }),
      ),
    );
    return this.prisma.column.findMany({
      where: { id: { in: orderedColumnIds } },
      orderBy: { order: 'asc' },
    });
  }
}
