import { Injectable } from '@nestjs/common';
import { Prisma, SprintStatus, TaskPriority } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

export interface TaskSearchFilters {
  priority?: string;
  status?: string;
  assigneeId?: string;
  reporterId?: string;
  done?: boolean;
  label?: string;
  sprintId?: string;
  columnId?: string;
  dateFrom?: string;
  dateTo?: string;
  updatedFrom?: string;
  updatedTo?: string;
  sortBy?: 'createdAt' | 'updatedAt' | 'priority' | 'dueDate';
  order?: 'asc' | 'desc';
}

const CI = { mode: 'insensitive' as const };

@Injectable()
export class SearchRepository {
  constructor(private readonly prisma: PrismaService) {}

  // search.md #4.1: mọi search phải quy về đúng phạm vi Workspace — Task
  // không lưu thẳng workspaceId nên phải đi qua Board -> Column trước.
  async getWorkspaceColumns(workspaceId: string) {
    const board = await this.prisma.board.findFirst({
      where: { workspaceId, deletedAt: null },
    });
    if (!board) return [];
    return this.prisma.column.findMany({
      where: { boardId: board.id, deletedAt: null },
      select: { id: true, name: true, boardId: true },
    });
  }

  async getTaskIdsForColumns(columnIds: string[]): Promise<string[]> {
    if (columnIds.length === 0) return [];
    const tasks = await this.prisma.task.findMany({
      where: { columnId: { in: columnIds }, deletedAt: null },
      select: { id: true },
    });
    return tasks.map((task) => task.id);
  }

  async searchTasks(
    columnIds: string[],
    query: string,
    filters: TaskSearchFilters,
    limit: number,
    offset: number,
  ) {
    if (columnIds.length === 0) return [];
    // filters.columnId luôn phải nằm trong columnIds của chính Workspace này —
    // nếu client truyền columnId thuộc Workspace khác, effectiveColumnIds rỗng
    // nên trả về mảng rỗng thay vì lộ Task của Workspace khác.
    const effectiveColumnIds = filters.columnId
      ? columnIds.filter((id) => id === filters.columnId)
      : columnIds;
    if (effectiveColumnIds.length === 0) return [];

    const where: Prisma.TaskWhereInput = {
      deletedAt: null,
      columnId: { in: effectiveColumnIds },
      OR: [
        { title: { contains: query, ...CI } },
        { description: { contains: query, ...CI } },
      ],
      ...(filters.priority
        ? { priority: filters.priority as TaskPriority }
        : {}),
      ...(filters.status ? { status: { equals: filters.status, ...CI } } : {}),
      ...(filters.assigneeId
        ? { assigneeIds: { has: filters.assigneeId } }
        : {}),
      ...(filters.reporterId ? { createdBy: filters.reporterId } : {}),
      ...(filters.done !== undefined
        ? { column: { isDoneColumn: filters.done } }
        : {}),
      ...(filters.sprintId ? { sprintId: filters.sprintId } : {}),
      ...(filters.label
        ? { labels: { some: { name: { contains: filters.label, ...CI } } } }
        : {}),
      ...(filters.dateFrom || filters.dateTo
        ? {
            dueDate: {
              ...(filters.dateFrom ? { gte: new Date(filters.dateFrom) } : {}),
              ...(filters.dateTo ? { lte: new Date(filters.dateTo) } : {}),
            },
          }
        : {}),
      ...(filters.updatedFrom || filters.updatedTo
        ? {
            updatedAt: {
              ...(filters.updatedFrom
                ? { gte: new Date(filters.updatedFrom) }
                : {}),
              ...(filters.updatedTo
                ? { lte: new Date(filters.updatedTo) }
                : {}),
            },
          }
        : {}),
    };

    return this.prisma.task.findMany({
      where,
      orderBy: { [filters.sortBy ?? 'createdAt']: filters.order ?? 'desc' },
      take: limit,
      skip: offset,
    });
  }

  async searchComments(
    taskIds: string[],
    query: string,
    limit: number,
    offset: number,
  ) {
    if (taskIds.length === 0) return [];
    return this.prisma.comment.findMany({
      where: {
        taskId: { in: taskIds },
        deletedAt: null,
        content: { contains: query, ...CI },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });
  }

  async searchAttachments(
    taskIds: string[],
    query: string,
    limit: number,
    offset: number,
  ) {
    if (taskIds.length === 0) return [];
    return this.prisma.attachment.findMany({
      where: {
        taskId: { in: taskIds },
        deletedAt: null,
        OR: [
          { fileName: { contains: query, ...CI } },
          { mimeType: { contains: query, ...CI } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });
  }

  async searchMembers(
    workspaceId: string,
    query: string,
    limit: number,
    offset: number,
  ) {
    return this.prisma.workspaceMember.findMany({
      where: {
        workspaceId,
        deletedAt: null,
        user: {
          OR: [
            { name: { contains: query, ...CI } },
            { email: { contains: query, ...CI } },
          ],
        },
      },
      include: { user: true },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });
  }

  async searchSprints(
    workspaceId: string,
    query: string,
    limit: number,
    offset: number,
  ) {
    const upperQuery = query.toUpperCase();
    const matchedStatus = (Object.values(SprintStatus) as string[]).includes(
      upperQuery,
    )
      ? (upperQuery as SprintStatus)
      : undefined;
    return this.prisma.sprint.findMany({
      where: {
        workspaceId,
        deletedAt: null,
        OR: [
          { name: { contains: query, ...CI } },
          ...(matchedStatus ? [{ status: matchedStatus }] : []),
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });
  }

  // Label hiện không dùng chung giữa các Task (mỗi Label thuộc đúng 1 Task) —
  // dedupe theo tên để phục vụ dropdown filter, giữ màu gặp đầu tiên.
  async listDistinctLabels(
    columnIds: string[],
  ): Promise<{ name: string; color: string }[]> {
    if (columnIds.length === 0) return [];
    const labels = await this.prisma.label.findMany({
      where: { task: { columnId: { in: columnIds }, deletedAt: null } },
      select: { name: true, color: true },
    });
    const byName = new Map<string, string>();
    for (const label of labels) {
      if (!byName.has(label.name)) byName.set(label.name, label.color);
    }
    return Array.from(byName, ([name, color]) => ({ name, color })).sort(
      (a, b) => a.name.localeCompare(b.name),
    );
  }
}
