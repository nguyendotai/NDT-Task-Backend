import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { NotificationType, WorkspaceRole } from '@prisma/client';
import { TaskRepository } from './task.repository';
import { WorkspaceService } from '../workspace/workspace.service';
import { ActivityLogService } from '../activity/activity-log.service';
import { NotificationService } from '../notification/notification.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { TaskEntity } from './entities/task.entity';

type TaskRecord = NonNullable<
  Awaited<ReturnType<TaskRepository['findActiveById']>>
>;
type ColumnWithWorkspace = NonNullable<
  Awaited<ReturnType<TaskRepository['findColumnWithWorkspace']>>
>;
type TaskWithStar = TaskEntity & { isStarred: boolean };

@Injectable()
export class TaskService {
  constructor(
    private readonly taskRepository: TaskRepository,
    private readonly workspaceService: WorkspaceService,
    private readonly activityLogService: ActivityLogService,
    private readonly notificationService: NotificationService,
    private readonly realtimeGateway: RealtimeGateway,
  ) {}

  async create(userId: string, dto: CreateTaskDto): Promise<TaskWithStar> {
    const column = await this.getActiveColumnOrThrow(dto.columnId);
    const workspaceId = column.board.workspaceId;
    await this.workspaceService.assertMembership(workspaceId, userId);

    if (
      dto.startDate &&
      dto.dueDate &&
      new Date(dto.startDate).getTime() > new Date(dto.dueDate).getTime()
    ) {
      throw new BadRequestException('Ngày bắt đầu phải trước hạn hoàn thành');
    }

    const order = await this.taskRepository.countActiveTasksInColumn(
      dto.columnId,
    );
    const task = await this.taskRepository.create({
      columnId: dto.columnId,
      title: dto.title,
      description: dto.description,
      priority: dto.priority,
      status: column.name,
      startDate: dto.startDate ? new Date(dto.startDate) : undefined,
      dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
      order,
      createdBy: userId,
      storyPoints: dto.storyPoints,
    });

    await this.activityLogService.record({
      workspaceId,
      actorId: userId,
      entityType: 'Task',
      entityId: task.id,
      action: 'task.created',
    });
    this.realtimeGateway.emitToWorkspace(workspaceId, 'task.created', {
      taskId: task.id,
    });

    return { ...this.toTaskEntity(task), isStarred: false };
  }

  async getDetail(userId: string, taskId: string): Promise<TaskWithStar> {
    const task = await this.getActiveTaskOrThrow(taskId);
    const column = await this.getActiveColumnOrThrow(task.columnId);
    await this.workspaceService.assertMembership(
      column.board.workspaceId,
      userId,
    );

    const star = await this.taskRepository.findStar(taskId, userId);
    return { ...this.toTaskEntity(task), isStarred: !!star };
  }

  // Tab History ở modal chi tiết Task — tái dùng ActivityLog sẵn có
  // (activity-log.md), không xây model lịch sử riêng.
  async listActivity(userId: string, taskId: string) {
    const task = await this.getActiveTaskOrThrow(taskId);
    const column = await this.getActiveColumnOrThrow(task.columnId);
    await this.workspaceService.assertMembership(
      column.board.workspaceId,
      userId,
    );
    return this.activityLogService.listByEntity('Task', taskId);
  }

  async listByWorkspace(
    userId: string,
    workspaceId: string,
    filters: { done?: boolean; sprintId?: string } = {},
  ): Promise<TaskWithStar[]> {
    await this.workspaceService.assertActiveWorkspace(workspaceId);
    await this.workspaceService.assertMembership(workspaceId, userId);

    const tasks = await this.taskRepository.listByWorkspace(
      workspaceId,
      filters,
    );
    return this.attachStarredFlag(userId, tasks);
  }

  async listMine(
    userId: string,
    filters: {
      done?: boolean;
      starred?: boolean;
      scope?: 'assignee' | 'assignee-or-creator';
    },
  ): Promise<TaskWithStar[]> {
    let taskIds: string[] | undefined;
    if (filters.starred) {
      const stars = await this.taskRepository.listStarredTaskIds(userId);
      taskIds = stars.map((star) => star.taskId);
      if (taskIds.length === 0) return [];
    }

    const tasks = await this.taskRepository.listMine(userId, {
      done: filters.done,
      taskIds,
      scope: filters.scope,
    });
    return this.attachStarredFlag(userId, tasks, filters.starred);
  }

  async update(
    userId: string,
    taskId: string,
    dto: UpdateTaskDto,
  ): Promise<TaskWithStar> {
    const task = await this.getActiveTaskOrThrow(taskId);
    const column = await this.getActiveColumnOrThrow(task.columnId);
    const workspaceId = column.board.workspaceId;

    const member = await this.workspaceService.assertMembership(
      workspaceId,
      userId,
    );
    this.assertCanModify(member.role, task, userId);

    // task.md #10 (Move Task): cho phép vừa đổi Column vừa đổi thứ tự chính
    // xác trong Column đích (không còn luôn "xuống cuối" như trước) — cả 2
    // trường hợp đổi Column và chỉ đổi vị trí trong cùng Column đều đi qua
    // taskRepository.reorder() để dịch chuyển order của các Task liên quan.
    let derivedStatus: string | undefined;
    const isMovingColumn =
      dto.columnId !== undefined && dto.columnId !== task.columnId;
    const isReordering = dto.order !== undefined;

    if (isMovingColumn || isReordering) {
      const destinationColumnId = dto.columnId ?? task.columnId;
      const destinationColumn = isMovingColumn
        ? await this.getActiveColumnOrThrow(destinationColumnId)
        : column;
      if (destinationColumn.board.workspaceId !== workspaceId) {
        throw new BadRequestException(
          'Không thể chuyển Task sang Board/Workspace khác',
        );
      }
      if (isMovingColumn) {
        // task.md #4: mỗi Column tự là 1 trạng thái riêng — đổi Column luôn
        // đồng bộ lại status = tên Column đích.
        derivedStatus = destinationColumn.name;
      }

      const destinationCount =
        await this.taskRepository.countActiveTasksInColumn(destinationColumnId);
      // Đổi Column: chèn thêm 1 Task nên vị trí hợp lệ tối đa = count hiện có.
      // Chỉ đổi vị trí trong cùng Column: chính Task đang nằm trong count đó rồi.
      const maxIndex = isMovingColumn
        ? destinationCount
        : Math.max(destinationCount - 1, 0);
      const requestedOrder = dto.order ?? destinationCount;
      const targetOrder = Math.min(Math.max(requestedOrder, 0), maxIndex);

      await this.taskRepository.reorder({
        taskId,
        sourceColumnId: task.columnId,
        targetColumnId: destinationColumnId,
        currentOrder: task.order,
        targetOrder,
      });
    }

    let newlyAssignedIds: string[] = [];
    if (dto.assigneeIds) {
      for (const candidateId of dto.assigneeIds) {
        const assigneeMembership = await this.workspaceService.findMembership(
          workspaceId,
          candidateId,
        );
        if (!assigneeMembership) {
          throw new BadRequestException(
            'Chỉ có thể gán Task cho Member của Workspace',
          );
        }
      }
      newlyAssignedIds = dto.assigneeIds.filter(
        (id) => !task.assigneeIds.includes(id),
      );
    }

    if (
      dto.dueDate &&
      new Date(dto.dueDate).getTime() < task.createdAt.getTime()
    ) {
      throw new BadRequestException(
        'Hạn hoàn thành phải sau thời điểm tạo Task',
      );
    }

    const effectiveStartDate = dto.startDate
      ? new Date(dto.startDate)
      : task.startDate;
    const effectiveDueDate = dto.dueDate ? new Date(dto.dueDate) : task.dueDate;
    if (
      effectiveStartDate &&
      effectiveDueDate &&
      effectiveStartDate.getTime() > effectiveDueDate.getTime()
    ) {
      throw new BadRequestException('Ngày bắt đầu phải trước hạn hoàn thành');
    }

    const updated = await this.taskRepository.update(taskId, {
      title: dto.title,
      description: dto.description,
      priority: dto.priority,
      status: derivedStatus,
      startDate: dto.startDate ? new Date(dto.startDate) : undefined,
      dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
      assigneeIds: dto.assigneeIds,
      storyPoints: dto.storyPoints,
    });

    await this.activityLogService.record({
      workspaceId,
      actorId: userId,
      entityType: 'Task',
      entityId: taskId,
      action: isMovingColumn || isReordering ? 'task.moved' : 'task.updated',
    });
    this.realtimeGateway.emitToWorkspace(
      workspaceId,
      isMovingColumn || isReordering ? 'task.moved' : 'task.updated',
      { taskId },
    );

    for (const recipientId of newlyAssignedIds) {
      await this.notificationService.notify({
        workspaceId,
        recipientId,
        type: NotificationType.TASK_ASSIGNED,
        title: 'Bạn được giao một Task mới',
        message: updated.title,
        metadata: { taskId },
      });
      this.realtimeGateway.emitToUser(recipientId, 'notification.created', {});
    }

    const star = await this.taskRepository.findStar(taskId, userId);
    return { ...this.toTaskEntity(updated), isStarred: !!star };
  }

  async remove(userId: string, taskId: string): Promise<void> {
    const task = await this.getActiveTaskOrThrow(taskId);
    const column = await this.getActiveColumnOrThrow(task.columnId);
    const workspaceId = column.board.workspaceId;

    const member = await this.workspaceService.assertMembership(
      workspaceId,
      userId,
    );
    this.assertCanModify(member.role, task, userId);

    await this.taskRepository.softDelete(taskId, userId);

    await this.activityLogService.record({
      workspaceId,
      actorId: userId,
      entityType: 'Task',
      entityId: taskId,
      action: 'task.deleted',
    });
    this.realtimeGateway.emitToWorkspace(workspaceId, 'task.deleted', {
      taskId,
    });
  }

  async listArchived(
    userId: string,
    workspaceId: string,
  ): Promise<TaskEntity[]> {
    await this.workspaceService.assertActiveWorkspace(workspaceId);
    const member = await this.workspaceService.assertMembership(
      workspaceId,
      userId,
    );
    if (member.role === WorkspaceRole.MEMBER) {
      throw new ForbiddenException('Chỉ Owner/Admin được xem Task đã xóa');
    }

    const tasks =
      await this.taskRepository.listArchivedByWorkspace(workspaceId);
    return tasks.map((task) => this.toTaskEntity(task));
  }

  async restore(userId: string, taskId: string): Promise<TaskWithStar> {
    const task = await this.taskRepository.findDeletedById(taskId);
    if (!task) {
      throw new NotFoundException('Không tìm thấy Task đã xóa');
    }
    const column = await this.getActiveColumnOrThrow(task.columnId);
    const workspaceId = column.board.workspaceId;

    const member = await this.workspaceService.assertMembership(
      workspaceId,
      userId,
    );
    if (member.role === WorkspaceRole.MEMBER) {
      throw new ForbiddenException('Chỉ Owner/Admin được khôi phục Task');
    }

    const restored = await this.taskRepository.restore(taskId);

    await this.activityLogService.record({
      workspaceId,
      actorId: userId,
      entityType: 'Task',
      entityId: taskId,
      action: 'task.restored',
    });
    this.realtimeGateway.emitToWorkspace(workspaceId, 'task.restored', {
      taskId,
    });

    return { ...this.toTaskEntity(restored), isStarred: false };
  }

  async star(userId: string, taskId: string): Promise<void> {
    const task = await this.getActiveTaskOrThrow(taskId);
    const column = await this.getActiveColumnOrThrow(task.columnId);
    await this.workspaceService.assertMembership(
      column.board.workspaceId,
      userId,
    );

    const existing = await this.taskRepository.findStar(taskId, userId);
    if (!existing) {
      await this.taskRepository.createStar(taskId, userId);
    }
  }

  async unstar(userId: string, taskId: string): Promise<void> {
    const task = await this.getActiveTaskOrThrow(taskId);
    const column = await this.getActiveColumnOrThrow(task.columnId);
    await this.workspaceService.assertMembership(
      column.board.workspaceId,
      userId,
    );

    await this.taskRepository.deleteStar(taskId, userId);
  }

  // Watcher theo dõi Task để nhận Notification, không phải Assignee. Theo
  // quyết định của bạn: bỏ trống targetUserId = tự thêm chính mình; chỉ
  // Owner/Admin được thêm/gỡ Watcher cho người khác.
  async addWatcher(
    taskId: string,
    actorUserId: string,
    targetUserId?: string,
  ): Promise<void> {
    const task = await this.getActiveTaskOrThrow(taskId);
    const column = await this.getActiveColumnOrThrow(task.columnId);
    const workspaceId = column.board.workspaceId;
    const actorMember = await this.workspaceService.assertMembership(
      workspaceId,
      actorUserId,
    );

    const watchUserId = targetUserId ?? actorUserId;
    if (watchUserId !== actorUserId) {
      if (
        actorMember.role !== WorkspaceRole.OWNER &&
        actorMember.role !== WorkspaceRole.ADMIN
      ) {
        throw new ForbiddenException(
          'Chỉ Owner/Admin được thêm Watcher cho người khác',
        );
      }
      const targetMembership = await this.workspaceService.findMembership(
        workspaceId,
        watchUserId,
      );
      if (!targetMembership) {
        throw new BadRequestException(
          'Chỉ có thể thêm Watcher là Member của Workspace',
        );
      }
    }

    const existing = await this.taskRepository.findWatcher(taskId, watchUserId);
    if (!existing) {
      await this.taskRepository.createWatcher(taskId, watchUserId);
      this.realtimeGateway.emitToWorkspace(workspaceId, 'task.watcher_added', {
        taskId,
        userId: watchUserId,
      });
    }
  }

  async removeWatcher(
    taskId: string,
    actorUserId: string,
    targetUserId: string,
  ): Promise<void> {
    const task = await this.getActiveTaskOrThrow(taskId);
    const column = await this.getActiveColumnOrThrow(task.columnId);
    const workspaceId = column.board.workspaceId;
    const actorMember = await this.workspaceService.assertMembership(
      workspaceId,
      actorUserId,
    );

    if (
      targetUserId !== actorUserId &&
      actorMember.role !== WorkspaceRole.OWNER &&
      actorMember.role !== WorkspaceRole.ADMIN
    ) {
      throw new ForbiddenException(
        'Chỉ Owner/Admin được gỡ Watcher của người khác',
      );
    }

    await this.taskRepository.deleteWatcher(taskId, targetUserId);
    this.realtimeGateway.emitToWorkspace(workspaceId, 'task.watcher_removed', {
      taskId,
      userId: targetUserId,
    });
  }

  async listWatchers(
    taskId: string,
    userId: string,
  ): Promise<{ userId: string }[]> {
    const task = await this.getActiveTaskOrThrow(taskId);
    const column = await this.getActiveColumnOrThrow(task.columnId);
    await this.workspaceService.assertMembership(
      column.board.workspaceId,
      userId,
    );
    const watchers = await this.taskRepository.listWatchers(taskId);
    return watchers.map((watcher) => ({ userId: watcher.userId }));
  }

  // ---------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------

  private async getActiveTaskOrThrow(taskId: string): Promise<TaskRecord> {
    const task = await this.taskRepository.findActiveById(taskId);
    if (!task) {
      throw new NotFoundException('Không tìm thấy Task');
    }
    return task;
  }

  private async getActiveColumnOrThrow(
    columnId: string,
  ): Promise<ColumnWithWorkspace> {
    const column = await this.taskRepository.findColumnWithWorkspace(columnId);
    if (!column) {
      throw new NotFoundException('Không tìm thấy Column');
    }
    return column;
  }

  private assertCanModify(
    role: WorkspaceRole,
    task: TaskRecord,
    userId: string,
  ): void {
    if (role === WorkspaceRole.OWNER || role === WorkspaceRole.ADMIN) {
      return;
    }
    if (task.createdBy === userId || task.assigneeIds.includes(userId)) {
      return;
    }
    throw new ForbiddenException(
      'Chỉ Owner/Admin hoặc người tạo/được giao Task mới được thao tác',
    );
  }

  private async attachStarredFlag(
    userId: string,
    tasks: TaskRecord[],
    allStarred?: boolean,
  ): Promise<TaskWithStar[]> {
    if (tasks.length === 0) return [];
    if (allStarred) {
      return tasks.map((task) => ({
        ...this.toTaskEntity(task),
        isStarred: true,
      }));
    }

    const stars = await this.taskRepository.listStarredTaskIdsAmong(
      userId,
      tasks.map((task) => task.id),
    );
    const starredIds = new Set(stars.map((star) => star.taskId));
    return tasks.map((task) => ({
      ...this.toTaskEntity(task),
      isStarred: starredIds.has(task.id),
    }));
  }

  private toTaskEntity(task: TaskRecord): TaskEntity {
    return {
      id: task.id,
      columnId: task.columnId,
      workspaceId: task.column.board.workspace.id,
      workspaceName: task.column.board.workspace.name,
      sprintId: task.sprintId,
      title: task.title,
      description: task.description,
      priority: task.priority,
      status: task.status,
      order: task.order,
      backlogOrder: task.backlogOrder,
      startDate: task.startDate,
      dueDate: task.dueDate,
      assigneeIds: task.assigneeIds,
      storyPoints: task.storyPoints,
      createdBy: task.createdBy,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    };
  }
}
