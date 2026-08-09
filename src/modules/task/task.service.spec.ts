import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { NotificationType, WorkspaceRole } from '@prisma/client';
import { TaskService } from './task.service';
import { TaskRepository } from './task.repository';
import { WorkspaceService } from '../workspace/workspace.service';
import { ActivityLogService } from '../activity/activity-log.service';
import { NotificationService } from '../notification/notification.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';

function buildColumn(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'column-1',
    boardId: 'board-1',
    name: 'To Do',
    deletedAt: null,
    board: { workspaceId: 'workspace-1' },
    ...overrides,
  };
}

function buildTask(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'task-1',
    columnId: 'column-1',
    sprintId: null,
    title: 'Task title',
    description: undefined,
    priority: undefined,
    type: 'TASK',
    taskNumber: 1,
    status: 'To Do',
    order: 0,
    backlogOrder: null,
    startDate: null,
    dueDate: null,
    assigneeIds: [] as string[],
    storyPoints: undefined,
    createdBy: 'creator-1',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    column: {
      board: {
        workspace: { id: 'workspace-1', name: 'Workspace 1', shortCode: 'WS1' },
      },
    },
    ...overrides,
  };
}

describe('TaskService', () => {
  let service: TaskService;
  let taskRepository: jest.Mocked<TaskRepository>;
  let workspaceService: jest.Mocked<WorkspaceService>;
  let activityLogService: jest.Mocked<ActivityLogService>;
  let notificationService: jest.Mocked<NotificationService>;
  let realtimeGateway: jest.Mocked<RealtimeGateway>;

  beforeEach(() => {
    taskRepository = {
      findColumnWithWorkspace: jest.fn(),
      countActiveTasksInColumn: jest.fn(),
      create: jest.fn(),
      findActiveById: jest.fn(),
      findDeletedById: jest.fn(),
      update: jest.fn(),
      reorder: jest.fn(),
      softDelete: jest.fn(),
      restore: jest.fn(),
      listByWorkspace: jest.fn(),
      listArchivedByWorkspace: jest.fn(),
      listMine: jest.fn(),
      findStar: jest.fn(),
      createStar: jest.fn(),
      deleteStar: jest.fn(),
      listStarredTaskIds: jest.fn(),
      listStarredTaskIdsAmong: jest.fn(),
      findWatcher: jest.fn(),
      createWatcher: jest.fn(),
      deleteWatcher: jest.fn(),
      listWatchers: jest.fn(),
    } as unknown as jest.Mocked<TaskRepository>;

    workspaceService = {
      assertMembership: jest.fn(),
      findMembership: jest.fn(),
      assertActiveWorkspace: jest.fn(),
      listMembers: jest.fn(),
    } as unknown as jest.Mocked<WorkspaceService>;

    activityLogService = {
      record: jest.fn(),
      listByEntity: jest.fn(),
    } as unknown as jest.Mocked<ActivityLogService>;

    notificationService = {
      notify: jest.fn(),
    } as unknown as jest.Mocked<NotificationService>;

    realtimeGateway = {
      emitToWorkspace: jest.fn(),
      emitToUser: jest.fn(),
    } as unknown as jest.Mocked<RealtimeGateway>;

    service = new TaskService(
      taskRepository,
      workspaceService,
      activityLogService,
      notificationService,
      realtimeGateway,
    );
  });

  describe('create', () => {
    it('từ chối khi startDate sau dueDate', async () => {
      taskRepository.findColumnWithWorkspace.mockResolvedValue(
        buildColumn() as never,
      );
      workspaceService.assertMembership.mockResolvedValue({
        role: WorkspaceRole.MEMBER,
      } as never);

      await expect(
        service.create('user-1', {
          columnId: 'column-1',
          title: 'New task',
          startDate: '2026-06-10',
          dueDate: '2026-06-01',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(taskRepository.create).not.toHaveBeenCalled();
    });

    it('tạo Task thành công, ghi Activity Log và emit realtime', async () => {
      taskRepository.findColumnWithWorkspace.mockResolvedValue(
        buildColumn() as never,
      );
      workspaceService.assertMembership.mockResolvedValue({
        role: WorkspaceRole.MEMBER,
      } as never);
      taskRepository.countActiveTasksInColumn.mockResolvedValue(0);
      taskRepository.create.mockResolvedValue(buildTask() as never);

      const result = await service.create('user-1', {
        columnId: 'column-1',
        title: 'New task',
      });

      expect(result.isStarred).toBe(false);
      expect(activityLogService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: 'workspace-1',
          action: 'task.created',
        }),
      );
      expect(realtimeGateway.emitToWorkspace).toHaveBeenCalledWith(
        'workspace-1',
        'task.created',
        { taskId: 'task-1' },
      );
    });
  });

  describe('update', () => {
    it('chặn Member không phải người tạo/được giao thao tác Task', async () => {
      taskRepository.findActiveById.mockResolvedValue(buildTask() as never);
      taskRepository.findColumnWithWorkspace.mockResolvedValue(
        buildColumn() as never,
      );
      workspaceService.assertMembership.mockResolvedValue({
        role: WorkspaceRole.MEMBER,
      } as never);

      await expect(
        service.update('user-2', 'task-1', { title: 'Renamed' }),
      ).rejects.toThrow(ForbiddenException);
      expect(taskRepository.update).not.toHaveBeenCalled();
    });

    it('cho phép chính người tạo Task cập nhật', async () => {
      taskRepository.findActiveById.mockResolvedValue(buildTask() as never);
      taskRepository.findColumnWithWorkspace.mockResolvedValue(
        buildColumn() as never,
      );
      workspaceService.assertMembership.mockResolvedValue({
        role: WorkspaceRole.MEMBER,
      } as never);
      taskRepository.update.mockResolvedValue(
        buildTask({ title: 'Renamed' }) as never,
      );
      taskRepository.findStar.mockResolvedValue(null);

      const result = await service.update('creator-1', 'task-1', {
        title: 'Renamed',
      });

      expect(result.title).toBe('Renamed');
      expect(activityLogService.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'task.updated' }),
      );
    });

    it('từ chối gán Task cho người không phải Member của Workspace', async () => {
      taskRepository.findActiveById.mockResolvedValue(
        buildTask({ createdBy: 'user-1' }) as never,
      );
      taskRepository.findColumnWithWorkspace.mockResolvedValue(
        buildColumn() as never,
      );
      workspaceService.assertMembership.mockResolvedValue({
        role: WorkspaceRole.MEMBER,
      } as never);
      workspaceService.findMembership.mockResolvedValue(null);

      await expect(
        service.update('user-1', 'task-1', {
          assigneeIds: ['outsider-1'],
        }),
      ).rejects.toThrow(BadRequestException);
      expect(taskRepository.update).not.toHaveBeenCalled();
    });

    it('gửi Notification cho Member vừa được gán Task mới', async () => {
      taskRepository.findActiveById.mockResolvedValue(
        buildTask({ createdBy: 'user-1', assigneeIds: [] }) as never,
      );
      taskRepository.findColumnWithWorkspace.mockResolvedValue(
        buildColumn() as never,
      );
      workspaceService.assertMembership.mockResolvedValue({
        role: WorkspaceRole.MEMBER,
      } as never);
      workspaceService.findMembership.mockResolvedValue({} as never);
      taskRepository.update.mockResolvedValue(
        buildTask({ assigneeIds: ['assignee-1'] }) as never,
      );
      taskRepository.findStar.mockResolvedValue(null);

      await service.update('user-1', 'task-1', {
        assigneeIds: ['assignee-1'],
      });

      expect(notificationService.notify).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientId: 'assignee-1',
          type: NotificationType.TASK_ASSIGNED,
        }),
      );
      expect(realtimeGateway.emitToUser).toHaveBeenCalledWith(
        'assignee-1',
        'notification.created',
        {},
      );
    });
  });

  describe('remove', () => {
    it('soft-delete Task và ghi Activity Log', async () => {
      taskRepository.findActiveById.mockResolvedValue(
        buildTask({ createdBy: 'user-1' }) as never,
      );
      taskRepository.findColumnWithWorkspace.mockResolvedValue(
        buildColumn() as never,
      );
      workspaceService.assertMembership.mockResolvedValue({
        role: WorkspaceRole.MEMBER,
      } as never);

      await service.remove('user-1', 'task-1');

      expect(taskRepository.softDelete).toHaveBeenCalledWith(
        'task-1',
        'user-1',
      );
      expect(activityLogService.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'task.deleted' }),
      );
      expect(realtimeGateway.emitToWorkspace).toHaveBeenCalledWith(
        'workspace-1',
        'task.deleted',
        { taskId: 'task-1' },
      );
    });
  });

  describe('star', () => {
    it('không tạo lại star nếu Task đã được star từ trước', async () => {
      taskRepository.findActiveById.mockResolvedValue(buildTask() as never);
      taskRepository.findColumnWithWorkspace.mockResolvedValue(
        buildColumn() as never,
      );
      workspaceService.assertMembership.mockResolvedValue({} as never);
      taskRepository.findStar.mockResolvedValue({ id: 'star-1' } as never);

      await service.star('user-1', 'task-1');

      expect(taskRepository.createStar).not.toHaveBeenCalled();
    });

    it('tạo star mới nếu Task chưa được star', async () => {
      taskRepository.findActiveById.mockResolvedValue(buildTask() as never);
      taskRepository.findColumnWithWorkspace.mockResolvedValue(
        buildColumn() as never,
      );
      workspaceService.assertMembership.mockResolvedValue({} as never);
      taskRepository.findStar.mockResolvedValue(null);

      await service.star('user-1', 'task-1');

      expect(taskRepository.createStar).toHaveBeenCalledWith(
        'task-1',
        'user-1',
      );
    });
  });
});
