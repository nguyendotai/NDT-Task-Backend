import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { WorkspaceRole } from '@prisma/client';
import { ChecklistRepository } from './checklist.repository';
import { WorkspaceService } from '../workspace/workspace.service';
import { ActivityLogService } from '../activity/activity-log.service';
import { CreateChecklistItemDto } from './dto/create-checklist-item.dto';
import { UpdateChecklistItemDto } from './dto/update-checklist-item.dto';
import { ChecklistItemEntity } from './entities/checklist-item.entity';

type ChecklistRecord = NonNullable<
  Awaited<ReturnType<ChecklistRepository['findById']>>
>;
type TaskContext = NonNullable<
  Awaited<ReturnType<ChecklistRepository['findActiveTaskWithWorkspace']>>
>;

@Injectable()
export class ChecklistService {
  constructor(
    private readonly checklistRepository: ChecklistRepository,
    private readonly workspaceService: WorkspaceService,
    private readonly activityLogService: ActivityLogService,
  ) {}

  async create(
    taskId: string,
    userId: string,
    dto: CreateChecklistItemDto,
  ): Promise<ChecklistItemEntity> {
    const task = await this.getActiveTaskOrThrow(taskId);
    const workspaceId = task.column.board.workspaceId;
    const member = await this.workspaceService.assertMembership(
      workspaceId,
      userId,
    );
    this.assertCanModify(member.role, task, userId);

    const order = await this.checklistRepository.countByTaskId(taskId);
    const item = await this.checklistRepository.create({
      taskId,
      title: dto.title,
      order,
    });

    await this.activityLogService.record({
      workspaceId,
      actorId: userId,
      entityType: 'Task',
      entityId: taskId,
      action: 'checklist.created',
      metadata: { checklistItemId: item.id },
    });

    return this.toEntity(item);
  }

  async listByTask(
    taskId: string,
    userId: string,
  ): Promise<ChecklistItemEntity[]> {
    const task = await this.getActiveTaskOrThrow(taskId);
    await this.workspaceService.assertMembership(
      task.column.board.workspaceId,
      userId,
    );
    const items = await this.checklistRepository.listByTaskId(taskId);
    return items.map((item) => this.toEntity(item));
  }

  async update(
    id: string,
    userId: string,
    dto: UpdateChecklistItemDto,
  ): Promise<ChecklistItemEntity> {
    const { task, workspaceId, member } = await this.getContextOrThrow(
      id,
      userId,
    );
    this.assertCanModify(member.role, task, userId);

    const updated = await this.checklistRepository.update(id, dto.title);

    await this.activityLogService.record({
      workspaceId,
      actorId: userId,
      entityType: 'Task',
      entityId: task.id,
      action: 'checklist.updated',
      metadata: { checklistItemId: id },
    });

    return this.toEntity(updated);
  }

  async complete(id: string, userId: string): Promise<ChecklistItemEntity> {
    const { item, task, workspaceId, member } = await this.getContextOrThrow(
      id,
      userId,
    );
    this.assertCanModify(member.role, task, userId);

    // checklist.md #12: không thể hoàn thành Checklist đã Completed.
    if (item.isDone) {
      throw new BadRequestException('Checklist đã ở trạng thái Completed');
    }

    const updated = await this.checklistRepository.setDone(id, true);

    await this.activityLogService.record({
      workspaceId,
      actorId: userId,
      entityType: 'Task',
      entityId: task.id,
      action: 'checklist.completed',
      metadata: { checklistItemId: id },
    });

    return this.toEntity(updated);
  }

  async reopen(id: string, userId: string): Promise<ChecklistItemEntity> {
    const { item, task, workspaceId, member } = await this.getContextOrThrow(
      id,
      userId,
    );
    this.assertCanModify(member.role, task, userId);

    // checklist.md #12: không thể mở lại Checklist đang Incomplete.
    if (!item.isDone) {
      throw new BadRequestException('Checklist đang ở trạng thái Incomplete');
    }

    const updated = await this.checklistRepository.setDone(id, false);

    await this.activityLogService.record({
      workspaceId,
      actorId: userId,
      entityType: 'Task',
      entityId: task.id,
      action: 'checklist.reopened',
      metadata: { checklistItemId: id },
    });

    return this.toEntity(updated);
  }

  async reorder(
    taskId: string,
    userId: string,
    orderedChecklistIds: string[],
  ): Promise<ChecklistItemEntity[]> {
    const task = await this.getActiveTaskOrThrow(taskId);
    const workspaceId = task.column.board.workspaceId;
    const member = await this.workspaceService.assertMembership(
      workspaceId,
      userId,
    );
    this.assertCanModify(member.role, task, userId);

    const existing = await this.checklistRepository.listByTaskId(taskId);
    const existingIds = new Set(existing.map((item) => item.id));
    const inputIds = new Set(orderedChecklistIds);
    if (
      existingIds.size !== inputIds.size ||
      orderedChecklistIds.some((id) => !existingIds.has(id))
    ) {
      throw new BadRequestException(
        'Danh sách Checklist không khớp với Task hiện tại',
      );
    }

    const reordered =
      await this.checklistRepository.reorder(orderedChecklistIds);

    await this.activityLogService.record({
      workspaceId,
      actorId: userId,
      entityType: 'Task',
      entityId: taskId,
      action: 'checklist.moved',
    });

    return reordered.map((item) => this.toEntity(item));
  }

  async remove(id: string, userId: string): Promise<void> {
    const { task, workspaceId, member } = await this.getContextOrThrow(
      id,
      userId,
    );
    this.assertCanModify(member.role, task, userId);

    await this.checklistRepository.delete(id);
    await this.checklistRepository.reindexAfterDelete(task.id);

    await this.activityLogService.record({
      workspaceId,
      actorId: userId,
      entityType: 'Task',
      entityId: task.id,
      action: 'checklist.deleted',
      metadata: { checklistItemId: id },
    });
  }

  // ---------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------

  private async getActiveTaskOrThrow(taskId: string): Promise<TaskContext> {
    const task =
      await this.checklistRepository.findActiveTaskWithWorkspace(taskId);
    if (!task) {
      throw new NotFoundException('Không tìm thấy Task');
    }
    return task;
  }

  private async getContextOrThrow(checklistItemId: string, userId: string) {
    const item = await this.checklistRepository.findById(checklistItemId);
    if (!item) {
      throw new NotFoundException('Không tìm thấy Checklist');
    }
    const task = await this.getActiveTaskOrThrow(item.taskId);
    const workspaceId = task.column.board.workspaceId;
    const member = await this.workspaceService.assertMembership(
      workspaceId,
      userId,
    );
    return { item, task, workspaceId, member };
  }

  // checklist.md #7: Owner/Admin toàn quyền; Member thao tác được nếu có
  // quyền cập nhật Task (người tạo hoặc được giao Task) — đúng task.md.
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
      'Chỉ Owner/Admin hoặc người tạo/được giao Task mới được thao tác Checklist',
    );
  }

  private toEntity(item: ChecklistRecord): ChecklistItemEntity {
    return {
      id: item.id,
      taskId: item.taskId,
      title: item.title,
      isDone: item.isDone,
      order: item.order,
      completedAt: item.completedAt,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }
}
