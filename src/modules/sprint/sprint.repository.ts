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

  // ---------------------------------------------------------------------
  // Burndown / Velocity
  // ---------------------------------------------------------------------

  // Burndown "hiện tại": tổng điểm và điểm còn lại (Task chưa ở Column
  // isDoneColumn) của Sprint — dùng để chụp snapshot theo ngày (cron) và làm
  // điểm cuối của đường "actual" nếu snapshot hôm nay chưa chạy.
  async getCurrentPoints(
    sprintId: string,
  ): Promise<{ totalPoints: number; remainingPoints: number }> {
    const [totalAgg, remainingAgg] = await Promise.all([
      this.prisma.task.aggregate({
        where: { sprintId, deletedAt: null },
        _sum: { storyPoints: true },
      }),
      this.prisma.task.aggregate({
        where: {
          sprintId,
          deletedAt: null,
          column: { isDoneColumn: false },
        },
        _sum: { storyPoints: true },
      }),
    ]);
    return {
      totalPoints: totalAgg._sum.storyPoints ?? 0,
      remainingPoints: remainingAgg._sum.storyPoints ?? 0,
    };
  }

  listActiveSprintIds(): Promise<{ id: string }[]> {
    return this.prisma.sprint.findMany({
      where: { status: SprintStatus.ACTIVE, deletedAt: null },
      select: { id: true },
    });
  }

  upsertSnapshot(data: {
    sprintId: string;
    snapshotDate: Date;
    totalPoints: number;
    remainingPoints: number;
  }) {
    return this.prisma.sprintSnapshot.upsert({
      where: {
        sprintId_snapshotDate: {
          sprintId: data.sprintId,
          snapshotDate: data.snapshotDate,
        },
      },
      create: data,
      update: {
        totalPoints: data.totalPoints,
        remainingPoints: data.remainingPoints,
      },
    });
  }

  listSnapshotsBySprintId(sprintId: string) {
    return this.prisma.sprintSnapshot.findMany({
      where: { sprintId },
      orderBy: { snapshotDate: 'asc' },
    });
  }

  // Velocity của 1 Sprint đã Completed = tổng storyPoints các Task còn giữ
  // sprintId này — Task chưa xong đã tự động bị gỡ (sprintId = null) lúc
  // complete() nên phần còn lại chắc chắn đều đã Done (xem complete() trên).
  async listCompletedSprintsWithVelocity(workspaceId: string) {
    const sprints = await this.prisma.sprint.findMany({
      where: {
        workspaceId,
        status: SprintStatus.COMPLETED,
        deletedAt: null,
      },
      orderBy: { completedAt: 'asc' },
    });

    const velocities = await Promise.all(
      sprints.map((sprint) =>
        this.prisma.task.aggregate({
          where: { sprintId: sprint.id, deletedAt: null },
          _sum: { storyPoints: true },
        }),
      ),
    );

    return sprints.map((sprint, index) => ({
      sprint,
      velocity: velocities[index]._sum.storyPoints ?? 0,
    }));
  }
}
