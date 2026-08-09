import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ActivityLogRepository } from './activity-log.repository';

export interface ActivityLogEntry {
  workspaceId: string;
  actorId: string;
  entityType: string;
  entityId: string;
  action: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class ActivityLogService {
  constructor(private readonly activityLogRepository: ActivityLogRepository) {}

  async record(entry: ActivityLogEntry): Promise<void> {
    await this.activityLogRepository.create({
      ...entry,
      metadata: entry.metadata as Prisma.InputJsonValue | undefined,
    });
  }

  async listByEntity(entityType: string, entityId: string) {
    const logs = await this.activityLogRepository.listByEntity(
      entityType,
      entityId,
    );
    return logs.map((log) => this.toEntry(log));
  }

  // Audit Log cấp Workspace (mọi entityType gộp chung, mới nhất trước) —
  // dùng cho trang lịch sử của Owner/Admin, phân trang bằng limit/offset.
  async listByWorkspace(
    workspaceId: string,
    params: { limit: number; offset: number },
  ) {
    const logs = await this.activityLogRepository.listByWorkspace(
      workspaceId,
      params,
    );
    return logs.map((log) => this.toEntry(log));
  }

  private toEntry(log: {
    id: string;
    workspaceId: string;
    actorId: string;
    entityType: string;
    entityId: string;
    action: string;
    metadata: Prisma.JsonValue;
    createdAt: Date;
  }) {
    return {
      id: log.id,
      workspaceId: log.workspaceId,
      actorId: log.actorId,
      entityType: log.entityType,
      entityId: log.entityId,
      action: log.action,
      metadata: log.metadata as Record<string, unknown> | null,
      createdAt: log.createdAt,
    };
  }
}
