import { Injectable } from '@nestjs/common';
import { Prisma, TaskPriority, TaskType } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

// Dùng chung cho mọi query trả Task ra ngoài — nhúng sẵn workspaceId/name/
// shortCode qua chuỗi quan hệ Task -> Column -> Board -> Workspace để tránh
// N+1 lookup ở Service khi cần hiển thị "Task thuộc Workspace nào" (Dashboard)
// hoặc ghép mã Task "{shortCode}-{taskNumber}" ở Frontend.
const WORKSPACE_CONTEXT_INCLUDE = {
  column: {
    include: {
      board: {
        include: {
          workspace: { select: { id: true, name: true, shortCode: true } },
        },
      },
    },
  },
} satisfies Prisma.TaskInclude;

// MongoDB transaction (dùng khi reorder Task) có thể báo write conflict nếu
// 2 request kéo-thả chạm cùng lúc vào cùng Column — đây là lỗi tạm thời,
// Prisma khuyến nghị tự retry (mã lỗi P2034), không phải bug logic.
async function withWriteConflictRetry<T>(
  operation: () => Promise<T>,
  retriesLeft = 3,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    const isWriteConflict =
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2034';
    if (!isWriteConflict || retriesLeft <= 0) throw error;
    await new Promise((resolve) => setTimeout(resolve, 50));
    return withWriteConflictRetry(operation, retriesLeft - 1);
  }
}

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

  // Bọc trong Transaction (backend/CLAUDE.md mục 3 — bắt buộc khi ghi/sửa
  // trên nhiều collection): tăng Workspace.taskCounter atomic rồi dùng chính
  // giá trị mới đó làm Task.taskNumber, đảm bảo không trùng số dù nhiều
  // request tạo Task cùng lúc trên cùng 1 Workspace.
  create(data: {
    workspaceId: string;
    columnId: string;
    title: string;
    description?: string;
    priority?: TaskPriority;
    type?: TaskType;
    status: string;
    startDate?: Date;
    dueDate?: Date;
    order: number;
    createdBy: string;
    storyPoints?: number;
  }) {
    const { workspaceId, type, ...taskData } = data;
    return this.prisma.$transaction(async (tx) => {
      const workspace = await tx.workspace.update({
        where: { id: workspaceId },
        data: { taskCounter: { increment: 1 } },
        select: { taskCounter: true },
      });
      // Ghi tường minh sprintId/backlogOrder/assigneeIds/deletedAt/deletedBy = null:
      // Prisma+MongoDB không match filter nếu field hoàn toàn không tồn tại.
      return tx.task.create({
        data: {
          ...taskData,
          type: type ?? TaskType.TASK,
          taskNumber: workspace.taskCounter,
          sprintId: null,
          backlogOrder: null,
          assigneeIds: [],
          deletedAt: null,
          deletedBy: null,
        },
        include: WORKSPACE_CONTEXT_INCLUDE,
      });
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
      type?: TaskType;
      status?: string;
      startDate?: Date | null;
      dueDate?: Date;
      columnId?: string;
      order?: number;
      assigneeIds?: string[];
      storyPoints?: number | null;
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

      await withWriteConflictRetry(() =>
        this.prisma.$transaction([
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
              }),
          this.prisma.task.update({
            where: { id: taskId },
            data: { order: targetOrder },
          }),
        ]),
      );
      return;
    }

    await withWriteConflictRetry(() =>
      this.prisma.$transaction([
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
      ]),
    );
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

  // done=true/false lọc theo Column.isDoneColumn (task.md #4: Status không
  // còn là enum cố định nên "đã xong/chưa xong" phải tra qua Column hiện tại
  // thay vì so khớp giá trị status trực tiếp).
  // sprintId: dùng cho Scrum Board (board.md #4) — "backlog" = Task chưa vào
  // Sprint nào (sprintId null), 1 id cụ thể = Task thuộc đúng Sprint đó. Bỏ
  // trống = không lọc theo Sprint (giữ nguyên hành vi cũ cho List/Timeline/
  // Calendar — các view này vẫn cần thấy toàn bộ Task bất kể Sprint).
  async listByWorkspace(
    workspaceId: string,
    filters: { done?: boolean; sprintId?: string } = {},
  ) {
    const { done, sprintId } = filters;
    const board = await this.prisma.board.findFirst({
      where: { workspaceId, deletedAt: null },
    });
    if (!board) return [];

    const columns = await this.prisma.column.findMany({
      where: {
        boardId: board.id,
        deletedAt: null,
        ...(done !== undefined ? { isDoneColumn: done } : {}),
      },
      select: { id: true },
    });
    const columnIds = columns.map((column) => column.id);
    if (columnIds.length === 0) return [];

    return this.prisma.task.findMany({
      where: {
        columnId: { in: columnIds },
        deletedAt: null,
        ...(sprintId === 'backlog'
          ? { sprintId: null }
          : sprintId !== undefined
            ? { sprintId }
            : {}),
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
      done?: boolean;
      taskIds?: string[];
      scope?: 'assignee' | 'assignee-or-creator';
    } = {},
  ) {
    const { done, taskIds, scope = 'assignee' } = options;
    return this.prisma.task.findMany({
      where: {
        ...(scope === 'assignee-or-creator'
          ? { OR: [{ assigneeIds: { has: userId } }, { createdBy: userId }] }
          : { assigneeIds: { has: userId } }),
        deletedAt: null,
        ...(done !== undefined ? { column: { isDoneColumn: done } } : {}),
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

  findWatcher(taskId: string, userId: string) {
    return this.prisma.taskWatcher.findFirst({ where: { taskId, userId } });
  }

  createWatcher(taskId: string, userId: string) {
    return this.prisma.taskWatcher.create({ data: { taskId, userId } });
  }

  deleteWatcher(taskId: string, userId: string) {
    return this.prisma.taskWatcher.deleteMany({ where: { taskId, userId } });
  }

  listWatchers(taskId: string) {
    return this.prisma.taskWatcher.findMany({ where: { taskId } });
  }
}
