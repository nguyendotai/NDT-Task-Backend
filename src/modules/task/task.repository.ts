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

  update(
    id: string,
    data: {
      title?: string;
      description?: string;
      priority?: TaskPriority;
      status?: TaskStatus;
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

  softDelete(id: string, deletedBy: string) {
    return this.prisma.task.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy },
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
