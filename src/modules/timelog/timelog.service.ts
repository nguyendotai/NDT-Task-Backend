import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { WorkspaceRole } from '@prisma/client';
import { TimeLogRepository } from './timelog.repository';
import { WorkspaceService } from '../workspace/workspace.service';
import { ActivityLogService } from '../activity/activity-log.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { CreateTimeLogDto } from './dto/create-timelog.dto';
import { UpdateTimeLogDto } from './dto/update-timelog.dto';
import { TimeLogEntity } from './entities/timelog.entity';

type TimeLogRecord = NonNullable<
  Awaited<ReturnType<TimeLogRepository['findById']>>
>;

@Injectable()
export class TimeLogService {
  constructor(
    private readonly timeLogRepository: TimeLogRepository,
    private readonly workspaceService: WorkspaceService,
    private readonly activityLogService: ActivityLogService,
    private readonly realtimeGateway: RealtimeGateway,
  ) {}

  // Ghi log giờ làm việc: mọi Member Active của Workspace đều làm được, cùng
  // mức quyền với tạo Comment — không giới hạn riêng cho Assignee.
  async create(
    taskId: string,
    userId: string,
    dto: CreateTimeLogDto,
  ): Promise<TimeLogEntity> {
    const workspaceId = await this.getWorkspaceIdForTaskOrThrow(taskId);
    await this.workspaceService.assertMembership(workspaceId, userId);

    const timeLog = await this.timeLogRepository.create({
      taskId,
      userId,
      hours: dto.hours,
      loggedDate: new Date(dto.loggedDate),
      note: dto.note,
    });

    await this.activityLogService.record({
      workspaceId,
      actorId: userId,
      entityType: 'Task',
      entityId: taskId,
      action: 'timelog.created',
      metadata: { timeLogId: timeLog.id, hours: dto.hours },
    });
    this.realtimeGateway.emitToWorkspace(workspaceId, 'timelog.created', {
      taskId,
      timeLogId: timeLog.id,
    });

    return this.toEntity(timeLog);
  }

  async listByTask(taskId: string, userId: string): Promise<TimeLogEntity[]> {
    const workspaceId = await this.getWorkspaceIdForTaskOrThrow(taskId);
    await this.workspaceService.assertMembership(workspaceId, userId);

    const timeLogs = await this.timeLogRepository.listByTaskId(taskId);
    return timeLogs.map((timeLog) => this.toEntity(timeLog));
  }

  async update(
    id: string,
    userId: string,
    dto: UpdateTimeLogDto,
  ): Promise<TimeLogEntity> {
    const timeLog = await this.getOrThrow(id);
    const workspaceId = await this.getWorkspaceIdForTaskOrThrow(timeLog.taskId);
    const member = await this.workspaceService.assertMembership(
      workspaceId,
      userId,
    );
    this.assertCanModify(member.role, timeLog, userId);

    const updated = await this.timeLogRepository.update(id, {
      hours: dto.hours,
      loggedDate: dto.loggedDate ? new Date(dto.loggedDate) : undefined,
      note: dto.note,
    });

    await this.activityLogService.record({
      workspaceId,
      actorId: userId,
      entityType: 'Task',
      entityId: timeLog.taskId,
      action: 'timelog.updated',
      metadata: { timeLogId: id },
    });
    this.realtimeGateway.emitToWorkspace(workspaceId, 'timelog.updated', {
      taskId: timeLog.taskId,
      timeLogId: id,
    });

    return this.toEntity(updated);
  }

  async remove(id: string, userId: string): Promise<void> {
    const timeLog = await this.getOrThrow(id);
    const workspaceId = await this.getWorkspaceIdForTaskOrThrow(timeLog.taskId);
    const member = await this.workspaceService.assertMembership(
      workspaceId,
      userId,
    );
    this.assertCanModify(member.role, timeLog, userId);

    await this.timeLogRepository.remove(id);

    await this.activityLogService.record({
      workspaceId,
      actorId: userId,
      entityType: 'Task',
      entityId: timeLog.taskId,
      action: 'timelog.deleted',
      metadata: { timeLogId: id },
    });
    this.realtimeGateway.emitToWorkspace(workspaceId, 'timelog.deleted', {
      taskId: timeLog.taskId,
      timeLogId: id,
    });
  }

  // ---------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------

  private async getOrThrow(id: string): Promise<TimeLogRecord> {
    const timeLog = await this.timeLogRepository.findById(id);
    if (!timeLog) {
      throw new NotFoundException('Không tìm thấy Time Log');
    }
    return timeLog;
  }

  private async getWorkspaceIdForTaskOrThrow(taskId: string): Promise<string> {
    const task =
      await this.timeLogRepository.findActiveTaskWithWorkspace(taskId);
    if (!task) {
      throw new NotFoundException('Không tìm thấy Task');
    }
    return task.column.board.workspaceId;
  }

  // Chỉ người ghi log hoặc Owner/Admin được sửa/xóa — cùng nguyên tắc với
  // Comment (comment.md #5.2/#5.3).
  private assertCanModify(
    role: WorkspaceRole,
    timeLog: TimeLogRecord,
    userId: string,
  ): void {
    if (role === WorkspaceRole.OWNER || role === WorkspaceRole.ADMIN) {
      return;
    }
    if (timeLog.userId === userId) {
      return;
    }
    throw new ForbiddenException(
      'Chỉ Owner/Admin hoặc người ghi Time Log mới được thao tác',
    );
  }

  private toEntity(timeLog: TimeLogRecord): TimeLogEntity {
    return {
      id: timeLog.id,
      taskId: timeLog.taskId,
      userId: timeLog.userId,
      hours: timeLog.hours,
      loggedDate: timeLog.loggedDate,
      note: timeLog.note,
      createdAt: timeLog.createdAt,
      updatedAt: timeLog.updatedAt,
    };
  }
}
