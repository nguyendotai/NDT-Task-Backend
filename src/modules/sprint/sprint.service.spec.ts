import { BadRequestException, ForbiddenException } from '@nestjs/common';
import {
  NotificationType,
  SprintStatus,
  WorkspaceRole,
  WorkspaceType,
} from '@prisma/client';
import { SprintService } from './sprint.service';
import { SprintRepository } from './sprint.repository';
import { WorkspaceService } from '../workspace/workspace.service';
import { ActivityLogService } from '../activity/activity-log.service';
import { NotificationService } from '../notification/notification.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';

function buildSprint(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'sprint-1',
    workspaceId: 'workspace-1',
    name: 'Sprint 1',
    goal: null,
    status: SprintStatus.PLANNED,
    startDate: new Date('2026-01-01'),
    endDate: new Date('2026-01-15'),
    completedAt: null,
    createdAt: new Date('2025-12-25'),
    updatedAt: new Date('2025-12-25'),
    ...overrides,
  };
}

describe('SprintService', () => {
  let service: SprintService;
  let sprintRepository: jest.Mocked<SprintRepository>;
  let workspaceService: jest.Mocked<WorkspaceService>;
  let activityLogService: jest.Mocked<ActivityLogService>;
  let notificationService: jest.Mocked<NotificationService>;
  let realtimeGateway: jest.Mocked<RealtimeGateway>;

  beforeEach(() => {
    sprintRepository = {
      create: jest.fn(),
      findActiveById: jest.fn(),
      listActiveByWorkspaceId: jest.fn(),
      countActiveInWorkspaceByStatus: jest.fn(),
      update: jest.fn(),
      start: jest.fn(),
      complete: jest.fn(),
      findTaskForAssignment: jest.fn(),
      addTask: jest.fn(),
      removeTask: jest.fn(),
      getCurrentPoints: jest.fn(),
      listActiveSprintIds: jest.fn(),
      upsertSnapshot: jest.fn(),
      listSnapshotsBySprintId: jest.fn(),
      listCompletedSprintsWithVelocity: jest.fn(),
    } as unknown as jest.Mocked<SprintRepository>;

    workspaceService = {
      assertActiveWorkspace: jest.fn(),
      assertMembership: jest.fn(),
      listMembers: jest.fn(),
    } as unknown as jest.Mocked<WorkspaceService>;

    activityLogService = {
      record: jest.fn(),
    } as unknown as jest.Mocked<ActivityLogService>;
    notificationService = {
      notify: jest.fn(),
    } as unknown as jest.Mocked<NotificationService>;
    realtimeGateway = {
      emitToWorkspace: jest.fn(),
      emitToUser: jest.fn(),
    } as unknown as jest.Mocked<RealtimeGateway>;

    service = new SprintService(
      sprintRepository,
      workspaceService,
      activityLogService,
      notificationService,
      realtimeGateway,
    );
  });

  describe('create', () => {
    it('từ chối khi Workspace không phải loại Scrum', async () => {
      workspaceService.assertActiveWorkspace.mockResolvedValue({
        type: WorkspaceType.KANBAN,
      } as never);

      await expect(
        service.create('workspace-1', 'user-1', {
          name: 'Sprint 1',
          startDate: '2026-01-01',
          endDate: '2026-01-15',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(sprintRepository.create).not.toHaveBeenCalled();
    });

    it('từ chối khi Member không có quyền quản lý Sprint', async () => {
      workspaceService.assertActiveWorkspace.mockResolvedValue({
        type: WorkspaceType.SCRUM,
      } as never);
      workspaceService.assertMembership.mockResolvedValue({
        role: WorkspaceRole.MEMBER,
      } as never);

      await expect(
        service.create('workspace-1', 'user-1', {
          name: 'Sprint 1',
          startDate: '2026-01-01',
          endDate: '2026-01-15',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('tạo Sprint thành công và ghi Activity Log', async () => {
      workspaceService.assertActiveWorkspace.mockResolvedValue({
        type: WorkspaceType.SCRUM,
      } as never);
      workspaceService.assertMembership.mockResolvedValue({
        role: WorkspaceRole.OWNER,
      } as never);
      sprintRepository.create.mockResolvedValue(buildSprint() as never);

      const result = await service.create('workspace-1', 'user-1', {
        name: 'Sprint 1',
        startDate: '2026-01-01',
        endDate: '2026-01-15',
      });

      expect(result.name).toBe('Sprint 1');
      expect(activityLogService.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'sprint.created' }),
      );
    });
  });

  describe('start', () => {
    it('từ chối khi Sprint không ở trạng thái Planned', async () => {
      sprintRepository.findActiveById.mockResolvedValue(
        buildSprint({ status: SprintStatus.COMPLETED }) as never,
      );
      workspaceService.assertMembership.mockResolvedValue({
        role: WorkspaceRole.OWNER,
      } as never);

      await expect(service.start('sprint-1', 'user-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('từ chối khi Workspace đã có 1 Sprint khác đang Active', async () => {
      sprintRepository.findActiveById.mockResolvedValue(
        buildSprint({ status: SprintStatus.PLANNED }) as never,
      );
      workspaceService.assertMembership.mockResolvedValue({
        role: WorkspaceRole.OWNER,
      } as never);
      sprintRepository.countActiveInWorkspaceByStatus.mockResolvedValue(1);

      await expect(service.start('sprint-1', 'user-1')).rejects.toThrow(
        'chỉ được phép 1 Sprint Active tại một thời điểm',
      );
      expect(sprintRepository.start).not.toHaveBeenCalled();
    });

    it('bắt đầu Sprint thành công và gửi Notification SPRINT_STARTED cho mọi Member', async () => {
      sprintRepository.findActiveById.mockResolvedValue(
        buildSprint({ status: SprintStatus.PLANNED }) as never,
      );
      workspaceService.assertMembership.mockResolvedValue({
        role: WorkspaceRole.OWNER,
      } as never);
      sprintRepository.countActiveInWorkspaceByStatus.mockResolvedValue(0);
      sprintRepository.start.mockResolvedValue(
        buildSprint({ status: SprintStatus.ACTIVE }) as never,
      );
      workspaceService.listMembers.mockResolvedValue([
        { user: { id: 'member-1' } },
        { user: { id: 'member-2' } },
      ] as never);

      const result = await service.start('sprint-1', 'user-1');

      expect(result.status).toBe(SprintStatus.ACTIVE);
      expect(realtimeGateway.emitToWorkspace).toHaveBeenCalledWith(
        'workspace-1',
        'sprint.started',
        { sprintId: 'sprint-1' },
      );
      expect(notificationService.notify).toHaveBeenCalledTimes(2);
      expect(notificationService.notify).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientId: 'member-1',
          type: NotificationType.SPRINT_STARTED,
        }),
      );
    });
  });

  describe('complete', () => {
    it('từ chối khi Sprint không ở trạng thái Active', async () => {
      sprintRepository.findActiveById.mockResolvedValue(
        buildSprint({ status: SprintStatus.PLANNED }) as never,
      );
      workspaceService.assertMembership.mockResolvedValue({
        role: WorkspaceRole.OWNER,
      } as never);

      await expect(service.complete('sprint-1', 'user-1')).rejects.toThrow(
        BadRequestException,
      );
      expect(sprintRepository.complete).not.toHaveBeenCalled();
    });

    it('kết thúc Sprint thành công và gửi Notification SPRINT_COMPLETED', async () => {
      sprintRepository.findActiveById.mockResolvedValue(
        buildSprint({ status: SprintStatus.ACTIVE }) as never,
      );
      workspaceService.assertMembership.mockResolvedValue({
        role: WorkspaceRole.OWNER,
      } as never);
      sprintRepository.complete.mockResolvedValue({
        sprint: buildSprint({ status: SprintStatus.COMPLETED }),
        movedToBacklogTaskIds: ['task-1'],
      } as never);
      workspaceService.listMembers.mockResolvedValue([
        { user: { id: 'member-1' } },
      ] as never);

      const result = await service.complete('sprint-1', 'user-1');

      expect(result.status).toBe(SprintStatus.COMPLETED);
      expect(notificationService.notify).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientId: 'member-1',
          type: NotificationType.SPRINT_COMPLETED,
        }),
      );
    });
  });

  describe('getBurndown', () => {
    it('tự thêm điểm "hôm nay" khi Sprint đang Active và cron chưa chạy hôm nay', async () => {
      sprintRepository.findActiveById.mockResolvedValue(
        buildSprint({ status: SprintStatus.ACTIVE }) as never,
      );
      workspaceService.assertMembership.mockResolvedValue({} as never);
      sprintRepository.getCurrentPoints.mockResolvedValue({
        totalPoints: 10,
        remainingPoints: 4,
      });
      sprintRepository.listSnapshotsBySprintId.mockResolvedValue([
        { snapshotDate: new Date('2026-01-01'), remainingPoints: 10 } as never,
      ]);

      const result = await service.getBurndown('sprint-1', 'user-1');

      expect(result.totalPoints).toBe(10);
      expect(result.idealLine).toEqual([
        { date: buildSprint().startDate, remainingPoints: 10 },
        { date: buildSprint().endDate, remainingPoints: 0 },
      ]);
      // 1 snapshot lịch sử (2026-01-01) + 1 điểm "hôm nay" tự thêm.
      expect(result.actualLine).toHaveLength(2);
      expect(result.actualLine[1].remainingPoints).toBe(4);
    });

    it('không thêm điểm "hôm nay" khi Sprint đã Completed', async () => {
      sprintRepository.findActiveById.mockResolvedValue(
        buildSprint({ status: SprintStatus.COMPLETED }) as never,
      );
      workspaceService.assertMembership.mockResolvedValue({} as never);
      sprintRepository.getCurrentPoints.mockResolvedValue({
        totalPoints: 10,
        remainingPoints: 0,
      });
      sprintRepository.listSnapshotsBySprintId.mockResolvedValue([
        { snapshotDate: new Date('2026-01-01'), remainingPoints: 10 } as never,
      ]);

      const result = await service.getBurndown('sprint-1', 'user-1');

      expect(result.actualLine).toHaveLength(1);
    });
  });

  describe('getVelocity', () => {
    it('map đúng kết quả velocity từ Repository', async () => {
      workspaceService.assertActiveWorkspace.mockResolvedValue({} as never);
      workspaceService.assertMembership.mockResolvedValue({} as never);
      sprintRepository.listCompletedSprintsWithVelocity.mockResolvedValue([
        {
          sprint: buildSprint({
            id: 'sprint-1',
            completedAt: new Date('2026-01-16'),
          }),
          velocity: 8,
        },
      ] as never);

      const result = await service.getVelocity('workspace-1', 'user-1');

      expect(result).toEqual([
        {
          sprintId: 'sprint-1',
          sprintName: 'Sprint 1',
          velocity: 8,
          completedAt: new Date('2026-01-16'),
        },
      ]);
    });
  });
});
