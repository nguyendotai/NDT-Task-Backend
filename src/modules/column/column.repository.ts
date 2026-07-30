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

  create(data: {
    boardId: string;
    name: string;
    order: number;
    isDoneColumn?: boolean;
  }) {
    return this.prisma.column.create({
      data: {
        ...data,
        isDoneColumn: data.isDoneColumn ?? false,
        deletedAt: null,
        deletedBy: null,
      },
    });
  }

  // task.md #4: Task.status luôn mirror đúng tên Column hiện tại — đổi tên
  // Column phải đồng bộ lại status của mọi Task đang active trong Column đó
  // trong cùng 1 transaction.
  async update(id: string, data: { name?: string; isDoneColumn?: boolean }) {
    if (data.name === undefined) {
      return this.prisma.column.update({ where: { id }, data });
    }
    const [updated] = await this.prisma.$transaction([
      this.prisma.column.update({ where: { id }, data }),
      this.prisma.task.updateMany({
        where: { columnId: id, deletedAt: null },
        data: { status: data.name },
      }),
    ]);
    return updated;
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
