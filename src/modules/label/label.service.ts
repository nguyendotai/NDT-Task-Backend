import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { WorkspaceRole } from '@prisma/client';
import { LabelRepository } from './label.repository';
import { WorkspaceService } from '../workspace/workspace.service';
import { ActivityLogService } from '../activity/activity-log.service';
import { CreateLabelDto } from './dto/create-label.dto';
import { UpdateLabelDto } from './dto/update-label.dto';
import { LabelEntity } from './entities/label.entity';

type LabelRecord = NonNullable<
  Awaited<ReturnType<LabelRepository['findById']>>
>;
type TaskContext = NonNullable<
  Awaited<ReturnType<LabelRepository['findActiveTaskWithWorkspace']>>
>;

@Injectable()
export class LabelService {
  constructor(
    private readonly labelRepository: LabelRepository,
    private readonly workspaceService: WorkspaceService,
    private readonly activityLogService: ActivityLogService,
  ) {}

  async create(
    taskId: string,
    userId: string,
    dto: CreateLabelDto,
  ): Promise<LabelEntity> {
    const task = await this.getActiveTaskOrThrow(taskId);
    const workspaceId = task.column.board.workspaceId;
    const member = await this.workspaceService.assertMembership(
      workspaceId,
      userId,
    );
    this.assertCanModify(member.role, task, userId);

    const label = await this.labelRepository.create({
      taskId,
      name: dto.name,
      color: dto.color,
    });

    await this.activityLogService.record({
      workspaceId,
      actorId: userId,
      entityType: 'Task',
      entityId: taskId,
      action: 'task.label_added',
      metadata: { labelId: label.id },
    });

    return this.toEntity(label);
  }

  async listByTask(taskId: string, userId: string): Promise<LabelEntity[]> {
    const task = await this.getActiveTaskOrThrow(taskId);
    await this.workspaceService.assertMembership(
      task.column.board.workspaceId,
      userId,
    );
    const labels = await this.labelRepository.listByTaskId(taskId);
    return labels.map((label) => this.toEntity(label));
  }

  async update(
    id: string,
    userId: string,
    dto: UpdateLabelDto,
  ): Promise<LabelEntity> {
    const { task, workspaceId, member } = await this.getContextOrThrow(
      id,
      userId,
    );
    this.assertCanModify(member.role, task, userId);

    const updated = await this.labelRepository.update(id, {
      name: dto.name,
      color: dto.color,
    });

    await this.activityLogService.record({
      workspaceId,
      actorId: userId,
      entityType: 'Task',
      entityId: task.id,
      action: 'task.label_updated',
      metadata: { labelId: id },
    });

    return this.toEntity(updated);
  }

  async remove(id: string, userId: string): Promise<void> {
    const { task, workspaceId, member } = await this.getContextOrThrow(
      id,
      userId,
    );
    this.assertCanModify(member.role, task, userId);

    await this.labelRepository.delete(id);

    await this.activityLogService.record({
      workspaceId,
      actorId: userId,
      entityType: 'Task',
      entityId: task.id,
      action: 'task.label_removed',
      metadata: { labelId: id },
    });
  }

  // ---------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------

  private async getActiveTaskOrThrow(taskId: string): Promise<TaskContext> {
    const task = await this.labelRepository.findActiveTaskWithWorkspace(taskId);
    if (!task) {
      throw new NotFoundException('Không tìm thấy Task');
    }
    return task;
  }

  private async getContextOrThrow(labelId: string, userId: string) {
    const label = await this.labelRepository.findById(labelId);
    if (!label) {
      throw new NotFoundException('Không tìm thấy Label');
    }
    const task = await this.getActiveTaskOrThrow(label.taskId);
    const workspaceId = task.column.board.workspaceId;
    const member = await this.workspaceService.assertMembership(
      workspaceId,
      userId,
    );
    return { label, task, workspaceId, member };
  }

  // Cùng quyền sửa Task (task.md) — Owner/Admin toàn quyền, Member sửa được
  // nếu là người tạo hoặc được giao Task.
  private assertCanModify(
    role: WorkspaceRole,
    task: { createdBy: string; assigneeIds: string[] },
    userId: string,
  ): void {
    if (role === WorkspaceRole.OWNER || role === WorkspaceRole.ADMIN) {
      return;
    }
    if (task.createdBy === userId || task.assigneeIds.includes(userId)) {
      return;
    }
    throw new ForbiddenException(
      'Chỉ Owner/Admin hoặc người tạo/được giao Task mới được thao tác Label',
    );
  }

  private toEntity(label: LabelRecord): LabelEntity {
    return {
      id: label.id,
      taskId: label.taskId,
      name: label.name,
      color: label.color,
      createdAt: label.createdAt,
    };
  }
}
