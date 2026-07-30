import { Injectable } from '@nestjs/common';
import { SprintStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class SprintRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: {
    workspaceId: string;
    name: string;
    goal?: string;
    startDate: Date;
    endDate: Date;
  }) {
    return this.prisma.sprint.create({
      data: {
        ...data,
        goal: data.goal ?? null,
        completedAt: null,
        deletedAt: null,
        deletedBy: null,
      },
    });
  }

  findActiveById(id: string) {
    return this.prisma.sprint.findFirst({ where: { id, deletedAt: null } });
  }

  listActiveByWorkspaceId(workspaceId: string) {
    return this.prisma.sprint.findMany({
      where: { workspaceId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }

  countActiveInWorkspaceByStatus(workspaceId: string, status: SprintStatus) {
    return this.prisma.sprint.count({
      where: { workspaceId, status, deletedAt: null },
    });
  }

  update(
    id: string,
    data: { name?: string; goal?: string; startDate?: Date; endDate?: Date },
  ) {
    return this.prisma.sprint.update({ where: { id }, data });
  }

  start(id: string) {
    return this.prisma.sprint.update({
      where: { id },
      data: { status: SprintStatus.ACTIVE },
    });
  }

  // sprint.md #5.4 (theo quyết định của bạn): Task chưa xong (Column chưa
  // isDoneColumn) khi Sprint Complete sẽ tự động gỡ khỏi Sprint (sprintId =
  // null), quay về Product Backlog — chạy trong 1 transaction cùng lúc đổi
  // trạng thái Sprint.
  async complete(id: string) {
    const unfinishedTasks = await this.prisma.task.findMany({
      where: { sprintId: id, deletedAt: null, column: { isDoneColumn: false } },
      select: { id: true },
    });
    const unfinishedTaskIds = unfinishedTasks.map((task) => task.id);

    const [updated] = await this.prisma.$transaction([
      this.prisma.sprint.update({
        where: { id },
        data: { status: SprintStatus.COMPLETED, completedAt: new Date() },
      }),
      this.prisma.task.updateMany({
        where: { id: { in: unfinishedTaskIds } },
        data: { sprintId: null },
      }),
    ]);
    return { sprint: updated, movedToBacklogTaskIds: unfinishedTaskIds };
  }

  // Task luôn có columnId bắt buộc — dùng chuỗi quan hệ Task -> Column -> Board
  // để xác định Task thuộc Workspace nào (giống TaskRepository.findColumnWithWorkspace),
  // tránh phụ thuộc chéo sang TaskModule.
  findTaskForAssignment(taskId: string) {
    return this.prisma.task.findFirst({
      where: { id: taskId, deletedAt: null },
      select: {
        id: true,
        sprintId: true,
        column: { select: { board: { select: { workspaceId: true } } } },
      },
    });
  }

  addTask(sprintId: string, taskId: string) {
    return this.prisma.task.update({
      where: { id: taskId },
      data: { sprintId },
    });
  }

  removeTask(taskId: string) {
    return this.prisma.task.update({
      where: { id: taskId },
      data: { sprintId: null },
    });
  }
}
