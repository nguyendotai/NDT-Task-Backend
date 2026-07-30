import { Injectable } from '@nestjs/common';
import { Prisma, TaskPriority, TaskStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

// Dùng chung cho mọi query trả Task ra ngoài — nhúng sẵn workspaceId/name qua
// chuỗi quan hệ Task -> Column -> Board -> Workspace để tránh N+1 lookup ở
// Service khi cần hiển thị "Task thuộc Workspace nào" (Dashboard).
const WORKSPACE_CONTEXT_INCLUDE = {
  column: {
    include: {
      board: {
        include: {
          workspace: { select: { id: true, name: true } },
        },
      },
    },
  },
} satisfies Prisma.TaskInclude;

@Injectable()
export class TaskRepository {
  constructor(private readonly prisma: PrismaService) {}

  findColumnWithWorkspace(columnId: string) {
    return this.prisma.column.findFirst({
      where: { id: columnId, deletedAt: null, board: { deletedAt: null } },
      include: { board: { select: { workspaceId: true } } },
    });
  }

  countActiveTasksInColumn(columnId: string) {
    return this.prisma.task.count({ where: { columnId, deletedAt: null } });
  }

  create(data: {
    columnId: string;
    title: string;
    description?: string;
    priority?: TaskPriority;
    status?: TaskStatus;
    startDate?: Date;
    dueDate?: Date;
    order: number;
    createdBy: string;
  }) {
    // Ghi tường minh sprintId/backlogOrder/assigneeId/deletedAt/deletedBy = null:
    // Prisma+MongoDB không match filter nếu field hoàn toàn không tồn tại.
    return this.prisma.task.create({
      data: {
        ...data,
        sprintId: null,
        backlogOrder: null,
        assigneeId: null,
        deletedAt: null,
        deletedBy: null,
      },
      include: WORKSPACE_CONTEXT_INCLUDE,
    });
  }

  findActiveById(id: string) {
    return this.prisma.task.findFirst({
      where: { id, deletedAt: null },
      include: WORKSPACE_CONTEXT_INCLUDE,
    });
  }

  findDeletedById(id: string) {
    return this.prisma.task.findFirst({
      where: { id, NOT: { deletedAt: null } },
      include: WORKSPACE_CONTEXT_INCLUDE,
    });
  }

  update(
    id: string,
    data: {
      title?: string;
      description?: string;
      priority?: TaskPriority;
      status?: TaskStatus;
      startDate?: Date | null;
      dueDate?: Date;
      columnId?: string;
      order?: number;
      assigneeId?: string;
    },
  ) {
    return this.prisma.task.update({
      where: { id },
      data,
      include: WORKSPACE_CONTEXT_INCLUDE,
    });
  }

  /**
   * task.md #10 (Move Task): di chuyển Task tới đúng vị trí (order) trong
   * Column đích, dịch order của các Task liên quan để không trùng/không có
   * khoảng trống — thay vì luôn chèn xuống cuối Column.
   */
  async reorder(params: {
    taskId: string;
    sourceColumnId: string;
    targetColumnId: string;
    currentOrder: number;
    targetOrder: number;
  }): Promise<void> {
    const {
      taskId,
      sourceColumnId,
      targetColumnId,
      currentOrder,
      targetOrder,
    } = params;

    if (sourceColumnId === targetColumnId) {
      if (targetOrder === currentOrder) return;

      const shiftSiblings =
        targetOrder < currentOrder
          ? this.prisma.task.updateMany({
              where: {
                columnId: sourceColumnId,
                deletedAt: null,
                id: { not: taskId },
                order: { gte: targetOrder, lt: currentOrder },
              },
              data: { order: { increment: 1 } },
            })
          : this.prisma.task.updateMany({
              where: {
                columnId: sourceColumnId,
                deletedAt: null,
                id: { not: taskId },
                order: { gt: currentOrder, lte: targetOrder },
              },
              data: { order: { decrement: 1 } },
            });

      await this.prisma.$transaction([
        shiftSiblings,
        this.prisma.task.update({
          where: { id: taskId },
          data: { order: targetOrder },
        }),
      ]);
      return;
    }

    await this.prisma.$transaction([
      this.prisma.task.updateMany({
        where: {
          columnId: sourceColumnId,
          deletedAt: null,
          order: { gt: currentOrder },
        },
        data: { order: { decrement: 1 } },
      }),
      this.prisma.task.updateMany({
        where: {
          columnId: targetColumnId,
          deletedAt: null,
          order: { gte: targetOrder },
        },
        data: { order: { increment: 1 } },
      }),
      this.prisma.task.update({
        where: { id: taskId },
        data: { columnId: targetColumnId, order: targetOrder },
      }),
    ]);
  }

  softDelete(id: string, deletedBy: string) {
    return this.prisma.task.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy },
    });
  }

  restore(id: string) {
    return this.prisma.task.update({
      where: { id },
      data: { deletedAt: null, deletedBy: null },
      include: WORKSPACE_CONTEXT_INCLUDE,
    });
  }

  async listByWorkspace(workspaceId: string, status?: TaskStatus[]) {
    const board = await this.prisma.board.findFirst({
      where: { workspaceId, deletedAt: null },
    });
    if (!board) return [];

    const columns = await this.prisma.column.findMany({
      where: { boardId: board.id, deletedAt: null },
      select: { id: true },
    });
    const columnIds = columns.map((column) => column.id);
    if (columnIds.length === 0) return [];

    return this.prisma.task.findMany({
      where: {
        columnId: { in: columnIds },
        deletedAt: null,
        ...(status ? { status: { in: status } } : {}),
      },
      include: WORKSPACE_CONTEXT_INCLUDE,
      orderBy: [{ columnId: 'asc' }, { order: 'asc' }],
    });
  }

  async listArchivedByWorkspace(workspaceId: string) {
    const board = await this.prisma.board.findFirst({
      where: { workspaceId, deletedAt: null },
    });
    if (!board) return [];

    const columns = await this.prisma.column.findMany({
      where: { boardId: board.id },
      select: { id: true },
    });
    const columnIds = columns.map((column) => column.id);
    if (columnIds.length === 0) return [];

    return this.prisma.task.findMany({
      where: {
        columnId: { in: columnIds },
        NOT: { deletedAt: null },
      },
      include: WORKSPACE_CONTEXT_INCLUDE,
      orderBy: { deletedAt: 'desc' },
    });
  }

  listMine(
    userId: string,
    options: {
      status?: TaskStatus[];
      taskIds?: string[];
      scope?: 'assignee' | 'assignee-or-creator';
    } = {},
  ) {
    const { status, taskIds, scope = 'assignee' } = options;
    return this.prisma.task.findMany({
      where: {
        ...(scope === 'assignee-or-creator'
          ? { OR: [{ assigneeId: userId }, { createdBy: userId }] }
          : { assigneeId: userId }),
        deletedAt: null,
        ...(status ? { status: { in: status } } : {}),
        ...(taskIds ? { id: { in: taskIds } } : {}),
      },
      include: WORKSPACE_CONTEXT_INCLUDE,
      orderBy:
        scope === 'assignee-or-creator'
          ? { updatedAt: 'desc' }
          : { dueDate: 'asc' },
    });
  }

  findStar(taskId: string, userId: string) {
    return this.prisma.taskStar.findFirst({ where: { taskId, userId } });
  }

  createStar(taskId: string, userId: string) {
    return this.prisma.taskStar.create({ data: { taskId, userId } });
  }

  deleteStar(taskId: string, userId: string) {
    return this.prisma.taskStar.deleteMany({ where: { taskId, userId } });
  }

  listStarredTaskIds(userId: string) {
    return this.prisma.taskStar.findMany({
      where: { userId },
      select: { taskId: true },
    });
  }

  listStarredTaskIdsAmong(userId: string, taskIds: string[]) {
    return this.prisma.taskStar.findMany({
      where: { userId, taskId: { in: taskIds } },
      select: { taskId: true },
    });
  }
}
