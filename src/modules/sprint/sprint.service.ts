import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  NotificationType,
  SprintStatus,
  WorkspaceRole,
  WorkspaceType,
} from '@prisma/client';
import { SprintRepository } from './sprint.repository';
import { WorkspaceService } from '../workspace/workspace.service';
import { ActivityLogService } from '../activity/activity-log.service';
import { NotificationService } from '../notification/notification.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { CreateSprintDto } from './dto/create-sprint.dto';
import { UpdateSprintDto } from './dto/update-sprint.dto';
import { SprintEntity } from './entities/sprint.entity';

type SprintRecord = NonNullable<
  Awaited<ReturnType<SprintRepository['findActiveById']>>
>;

@Injectable()
export class SprintService {
  constructor(
    private readonly sprintRepository: SprintRepository,
    private readonly workspaceService: WorkspaceService,
    private readonly activityLogService: ActivityLogService,
    private readonly notificationService: NotificationService,
    private readonly realtimeGateway: RealtimeGateway,
  ) {}

  async create(
    workspaceId: string,
    userId: string,
    dto: CreateSprintDto,
  ): Promise<SprintEntity> {
    const workspace =
      await this.workspaceService.assertActiveWorkspace(workspaceId);
    // sprint.md #5.1: Sprint chỉ áp dụng cho Workspace loại Scrum.
    if (workspace.type !== WorkspaceType.SCRUM) {
      throw new BadRequestException(
        'Sprint chỉ áp dụng cho Workspace loại Scrum',
      );
    }
    await this.assertManageRole(workspaceId, userId);
    this.assertValidDateRange(dto.startDate, dto.endDate);

    const sprint = await this.sprintRepository.create({
      workspaceId,
      name: dto.name,
      goal: dto.goal,
      startDate: new Date(dto.startDate),
      endDate: new Date(dto.endDate),
    });

    await this.activityLogService.record({
      workspaceId,
      actorId: userId,
      entityType: 'Sprint',
      entityId: sprint.id,
      action: 'sprint.created',
    });

    return this.toEntity(sprint);
  }

  async listByWorkspace(
    workspaceId: string,
    userId: string,
  ): Promise<SprintEntity[]> {
    await this.workspaceService.assertActiveWorkspace(workspaceId);
    await this.workspaceService.assertMembership(workspaceId, userId);

    const sprints =
      await this.sprintRepository.listActiveByWorkspaceId(workspaceId);
    return sprints.map((sprint) => this.toEntity(sprint));
  }

  async getDetail(sprintId: string, userId: string): Promise<SprintEntity> {
    const sprint = await this.getActiveSprintOrThrow(sprintId);
    await this.workspaceService.assertMembership(sprint.workspaceId, userId);
    return this.toEntity(sprint);
  }

  async update(
    sprintId: string,
    userId: string,
    dto: UpdateSprintDto,
  ): Promise<SprintEntity> {
    const sprint = await this.getActiveSprintOrThrow(sprintId);
    await this.assertManageRole(sprint.workspaceId, userId);

    // sprint.md #5.2: chỉ Sprint ở trạng thái Planned mới được cập nhật.
    if (sprint.status !== SprintStatus.PLANNED) {
      throw new BadRequestException(
        'Chỉ Sprint ở trạng thái Planned mới được cập nhật',
      );
    }

    const effectiveStartDate = dto.startDate
      ? new Date(dto.startDate)
      : sprint.startDate;
    const effectiveEndDate = dto.endDate
      ? new Date(dto.endDate)
      : sprint.endDate;
    if (effectiveEndDate.getTime() <= effectiveStartDate.getTime()) {
      throw new BadRequestException('Ngày kết thúc phải sau ngày bắt đầu');
    }

    const updated = await this.sprintRepository.update(sprintId, {
      name: dto.name,
      goal: dto.goal,
      startDate: dto.startDate ? new Date(dto.startDate) : undefined,
      endDate: dto.endDate ? new Date(dto.endDate) : undefined,
    });

    await this.activityLogService.record({
      workspaceId: sprint.workspaceId,
      actorId: userId,
      entityType: 'Sprint',
      entityId: sprintId,
      action: 'sprint.updated',
    });

    return this.toEntity(updated);
  }

  async start(sprintId: string, userId: string): Promise<SprintEntity> {
    const sprint = await this.getActiveSprintOrThrow(sprintId);
    await this.assertManageRole(sprint.workspaceId, userId);

    // sprint.md #5.3
    if (sprint.status !== SprintStatus.PLANNED) {
      throw new BadRequestException(
        'Sprint phải ở trạng thái Planned để bắt đầu',
      );
    }
    const activeCount =
      await this.sprintRepository.countActiveInWorkspaceByStatus(
        sprint.workspaceId,
        SprintStatus.ACTIVE,
      );
    if (activeCount > 0) {
      throw new BadRequestException(
        'Workspace đã có 1 Sprint đang Active — chỉ được phép 1 Sprint Active tại một thời điểm',
      );
    }

    const updated = await this.sprintRepository.start(sprintId);

    await this.activityLogService.record({
      workspaceId: sprint.workspaceId,
      actorId: userId,
      entityType: 'Sprint',
      entityId: sprintId,
      action: 'sprint.started',
    });
    this.realtimeGateway.emitToWorkspace(sprint.workspaceId, 'sprint.started', {
      sprintId,
    });
    await this.notifyWorkspaceMembers(sprint.workspaceId, userId, {
      type: NotificationType.SPRINT_STARTED,
      title: 'Sprint đã bắt đầu',
      message: `Sprint "${sprint.name}" đã bắt đầu`,
      metadata: { sprintId },
    });

    return this.toEntity(updated);
  }

  async complete(sprintId: string, userId: string): Promise<SprintEntity> {
    const sprint = await this.getActiveSprintOrThrow(sprintId);
    await this.assertManageRole(sprint.workspaceId, userId);

    // sprint.md #5.4
    if (sprint.status !== SprintStatus.ACTIVE) {
      throw new BadRequestException(
        'Sprint phải ở trạng thái Active để kết thúc',
      );
    }

    const { sprint: updated } = await this.sprintRepository.complete(sprintId);

    await this.activityLogService.record({
      workspaceId: sprint.workspaceId,
      actorId: userId,
      entityType: 'Sprint',
      entityId: sprintId,
      action: 'sprint.completed',
    });
    this.realtimeGateway.emitToWorkspace(
      sprint.workspaceId,
      'sprint.completed',
      { sprintId },
    );
    await this.notifyWorkspaceMembers(sprint.workspaceId, userId, {
      type: NotificationType.SPRINT_COMPLETED,
      title: 'Sprint đã kết thúc',
      message: `Sprint "${sprint.name}" đã kết thúc`,
      metadata: { sprintId },
    });

    return this.toEntity(updated);
  }

  async addTask(
    sprintId: string,
    taskId: string,
    userId: string,
  ): Promise<void> {
    const sprint = await this.getActiveSprintOrThrow(sprintId);
    await this.assertManageRole(sprint.workspaceId, userId);

    // sprint.md #5.6: thêm được khi Sprint đang Planned hoặc Active, chỉ
    // chặn khi đã Completed.
    if (sprint.status === SprintStatus.COMPLETED) {
      throw new BadRequestException(
        'Không thể thêm Task vào Sprint đã Completed',
      );
    }

    const task = await this.sprintRepository.findTaskForAssignment(taskId);
    if (!task) {
      throw new NotFoundException('Không tìm thấy Task');
    }
    if (task.column.board.workspaceId !== sprint.workspaceId) {
      throw new BadRequestException(
        'Task phải thuộc cùng Workspace với Sprint',
      );
    }
    if (task.sprintId) {
      throw new BadRequestException('Task đã thuộc một Sprint khác');
    }

    await this.sprintRepository.addTask(sprintId, taskId);

    await this.activityLogService.record({
      workspaceId: sprint.workspaceId,
      actorId: userId,
      entityType: 'Sprint',
      entityId: sprintId,
      action: 'sprint.task_added',
      metadata: { taskId },
    });
    this.realtimeGateway.emitToWorkspace(
      sprint.workspaceId,
      'sprint.task_added',
      { sprintId, taskId },
    );
  }

  async removeTask(
    sprintId: string,
    taskId: string,
    userId: string,
  ): Promise<void> {
    const sprint = await this.getActiveSprintOrThrow(sprintId);
    await this.assertManageRole(sprint.workspaceId, userId);

    // sprint.md #5.7: xóa được khi Sprint đang Planned hoặc Active, chỉ
    // chặn khi đã Completed.
    if (sprint.status === SprintStatus.COMPLETED) {
      throw new BadRequestException(
        'Không thể xóa Task khỏi Sprint đã Completed',
      );
    }

    const task = await this.sprintRepository.findTaskForAssignment(taskId);
    if (!task || task.sprintId !== sprintId) {
      throw new NotFoundException('Task không thuộc Sprint này');
    }

    await this.sprintRepository.removeTask(taskId);

    await this.activityLogService.record({
      workspaceId: sprint.workspaceId,
      actorId: userId,
      entityType: 'Sprint',
      entityId: sprintId,
      action: 'sprint.task_removed',
      metadata: { taskId },
    });
    this.realtimeGateway.emitToWorkspace(
      sprint.workspaceId,
      'sprint.task_removed',
      { sprintId, taskId },
    );
  }

  // ---------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------

  private async getActiveSprintOrThrow(
    sprintId: string,
  ): Promise<SprintRecord> {
    const sprint = await this.sprintRepository.findActiveById(sprintId);
    if (!sprint) {
      throw new NotFoundException('Không tìm thấy Sprint');
    }
    return sprint;
  }

  // sprint.md #7 / permission.md: Owner + Admin quản lý Sprint, Member chỉ xem.
  private async assertManageRole(
    workspaceId: string,
    userId: string,
  ): Promise<void> {
    const member = await this.workspaceService.assertMembership(
      workspaceId,
      userId,
    );
    if (
      member.role !== WorkspaceRole.OWNER &&
      member.role !== WorkspaceRole.ADMIN
    ) {
      throw new ForbiddenException('Chỉ Owner/Admin được quản lý Sprint');
    }
  }

  private assertValidDateRange(startDate: string, endDate: string): void {
    if (new Date(endDate).getTime() <= new Date(startDate).getTime()) {
      throw new BadRequestException('Ngày kết thúc phải sau ngày bắt đầu');
    }
  }

  // sprint.md #9: chỉ gửi khi Sprint bắt đầu/kết thúc, đến toàn bộ Member Active.
  private async notifyWorkspaceMembers(
    workspaceId: string,
    actorId: string,
    entry: {
      type: NotificationType;
      title: string;
      message: string;
      metadata?: Record<string, unknown>;
    },
  ): Promise<void> {
    const members = await this.workspaceService.listMembers(
      workspaceId,
      actorId,
    );
    await Promise.all(
      members.map(async (member) => {
        await this.notificationService.notify({
          workspaceId,
          recipientId: member.user.id,
          type: entry.type,
          title: entry.title,
          message: entry.message,
          metadata: entry.metadata,
        });
        this.realtimeGateway.emitToUser(
          member.user.id,
          'notification.created',
          {},
        );
      }),
    );
  }

  private toEntity(sprint: SprintRecord): SprintEntity {
    return {
      id: sprint.id,
      workspaceId: sprint.workspaceId,
      name: sprint.name,
      goal: sprint.goal,
      status: sprint.status,
      startDate: sprint.startDate,
      endDate: sprint.endDate,
      completedAt: sprint.completedAt,
      createdAt: sprint.createdAt,
      updatedAt: sprint.updatedAt,
    };
  }
}
