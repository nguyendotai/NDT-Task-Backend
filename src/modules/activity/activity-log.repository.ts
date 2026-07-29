import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class ActivityLogRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: {
    workspaceId: string;
    actorId: string;
    entityType: string;
    entityId: string;
    action: string;
    metadata?: Prisma.InputJsonValue;
  }) {
    return this.prisma.activityLog.create({ data });
  }
}
