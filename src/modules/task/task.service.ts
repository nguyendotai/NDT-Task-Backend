import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { NotificationType, TaskStatus, WorkspaceRole } from '@prisma/client';
import { TaskRepository } from './task.repository';
import { WorkspaceService } from '../workspace/workspace.service';
import { ActivityLogService } from '../activity/activity-log.service';
import { NotificationService } from '../notification/notification.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { TaskEntity } from './entities/task.entity';

const DONE_STATUSES: TaskStatus[] = [TaskStatus.DONE];
const NOT_DONE_STATUSES: TaskStatus[] = [
  TaskStatus.TODO,
  TaskStatus.IN_PROGRESS,
];

// task.md #4: "Status thực tế phụ thuộc vào Column hiện tại" — Column dùng
// làm Workflow nên tên Column mặc định ("To Do"/"In Progress"/"Done") ánh xạ
// thẳng sang TaskStatus. Column CRUD (đổi tên tuỳ ý) chưa tồn tại nên đây là
// map hợp lệ cho mọi Column hiện có; tên không khớp thì bỏ qua (giữ nguyên
// status cũ) thay vì suy đoán/ép status không hợp lệ.
const COLUMN_NAME_TO_STATUS: Record<string, TaskStatus> = {
  'to do': TaskStatus.TODO,
  'in progress': TaskStatus.IN_PROGRESS,
  done: TaskStatus.DONE,
};

function deriveStatusFromColumnName(
  columnName: string,
): TaskStatus | undefined {
  return COLUMN_NAME_TO_STATUS[columnName.trim().toLowerCase()];
}

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
      status: deriveStatusFromColumnName(column.name),
      startDate: dto.startDate ? new Date(dto.startDate) : undefined,
      dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
      order,
      createdBy: userId,
    });

    await this.activityLogService.record({
      workspaceId,
      actorId: userId,
      entityType: 'Task',
      entityId: task.id,
      action: 'task.created',
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

  async listByWorkspace(
    userId: string,
    workspaceId: string,
    done?: boolean,
  ): Promise<TaskWithStar[]> {
    await this.workspaceService.assertActiveWorkspace(workspaceId);
    await this.workspaceService.assertMembership(workspaceId, userId);

    const tasks = await this.taskRepository.listByWorkspace(
      workspaceId,
      this.toStatusFilter(done),
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
      status: this.toStatusFilter(filters.done),
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

    let targetColumnId: string | undefined;
    let order: number | undefined;
    let derivedStatus: TaskStatus | undefined;
    if (dto.columnId && dto.columnId !== task.columnId) {
      const targetColumn = await this.getActiveColumnOrThrow(dto.columnId);
      if (targetColumn.board.workspaceId !== workspaceId) {
        throw new BadRequestException(
          'Không thể chuyển Task sang Board/Workspace khác',
        );
      }
      targetColumnId = dto.columnId;
      order = await this.taskRepository.countActiveTasksInColumn(dto.columnId);
      // task.md #4: đổi Column phải đồng bộ lại Status theo Workflow.
      derivedStatus = deriveStatusFromColumnName(targetColumn.name);
    }

    if (dto.assigneeId && dto.assigneeId !== task.assigneeId) {
      const assigneeMembership = await this.workspaceService.findMembership(
        workspaceId,
        dto.assigneeId,
      );
      if (!assigneeMembership) {
        throw new BadRequestException(
          'Chỉ có thể gán Task cho Member của Workspace',
        );
      }
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
      status: derivedStatus ?? dto.status,
      startDate: dto.startDate ? new Date(dto.startDate) : undefined,
      dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
      columnId: targetColumnId,
      order,
      assigneeId: dto.assigneeId,
    });

    await this.activityLogService.record({
      workspaceId,
      actorId: userId,
      entityType: 'Task',
      entityId: taskId,
      action: 'task.updated',
    });

    if (dto.assigneeId && dto.assigneeId !== task.assigneeId) {
      await this.notificationService.notify({
        workspaceId,
        recipientId: dto.assigneeId,
        type: NotificationType.TASK_ASSIGNED,
        title: 'Bạn được giao một Task mới',
        message: updated.title,
        metadata: { taskId },
      });
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
    if (task.createdBy === userId || task.assigneeId === userId) {
      return;
    }
    throw new ForbiddenException(
      'Chỉ Owner/Admin hoặc người tạo/được giao Task mới được thao tác',
    );
  }

  private toStatusFilter(done?: boolean): TaskStatus[] | undefined {
    if (done === undefined) return undefined;
    return done ? DONE_STATUSES : NOT_DONE_STATUSES;
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
      assigneeId: task.assigneeId,
      createdBy: task.createdBy,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    };
  }
}
