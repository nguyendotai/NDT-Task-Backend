import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { WorkspaceRole } from '@prisma/client';
import { DocsRepository } from './docs.repository';
import { WorkspaceService } from '../workspace/workspace.service';
import { ActivityLogService } from '../activity/activity-log.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { CreateDocDto } from './dto/create-doc.dto';
import { UpdateDocDto } from './dto/update-doc.dto';
import { DocEntity, DocSummaryEntity } from './entities/doc.entity';

type DocRecord = NonNullable<
  Awaited<ReturnType<DocsRepository['findActiveById']>>
>;

@Injectable()
export class DocsService {
  constructor(
    private readonly docsRepository: DocsRepository,
    private readonly workspaceService: WorkspaceService,
    private readonly activityLogService: ActivityLogService,
    private readonly realtimeGateway: RealtimeGateway,
  ) {}

  // docs.md #5.1: mọi Member Active (mọi Role) đều tạo được.
  async create(
    workspaceId: string,
    userId: string,
    dto: CreateDocDto,
  ): Promise<DocEntity> {
    await this.workspaceService.assertActiveWorkspace(workspaceId);
    await this.workspaceService.assertMembership(workspaceId, userId);

    const doc = await this.docsRepository.create({
      workspaceId,
      title: dto.title,
      content: dto.content,
      createdBy: userId,
    });

    await this.activityLogService.record({
      workspaceId,
      actorId: userId,
      entityType: 'Doc',
      entityId: doc.id,
      action: 'doc.created',
    });
    this.realtimeGateway.emitToWorkspace(workspaceId, 'doc.created', {
      docId: doc.id,
    });

    return this.toEntity(doc);
  }

  // docs.md #5.4: mọi Member Active xem được toàn bộ Doc, không giới hạn tác giả.
  async listByWorkspace(
    workspaceId: string,
    userId: string,
  ): Promise<DocSummaryEntity[]> {
    await this.workspaceService.assertActiveWorkspace(workspaceId);
    await this.workspaceService.assertMembership(workspaceId, userId);

    return this.docsRepository.listSummaryByWorkspace(workspaceId);
  }

  async getDetail(docId: string, userId: string): Promise<DocEntity> {
    const doc = await this.getActiveDocOrThrow(docId);
    await this.workspaceService.assertMembership(doc.workspaceId, userId);
    return this.toEntity(doc);
  }

  async update(
    docId: string,
    userId: string,
    dto: UpdateDocDto,
  ): Promise<DocEntity> {
    const doc = await this.getActiveDocOrThrow(docId);
    const member = await this.workspaceService.assertMembership(
      doc.workspaceId,
      userId,
    );
    this.assertCanModify(member.role, doc, userId);

    const updated = await this.docsRepository.update(docId, {
      title: dto.title,
      content: dto.content,
    });

    await this.activityLogService.record({
      workspaceId: doc.workspaceId,
      actorId: userId,
      entityType: 'Doc',
      entityId: docId,
      action: 'doc.updated',
    });
    this.realtimeGateway.emitToWorkspace(doc.workspaceId, 'doc.updated', {
      docId,
    });

    return this.toEntity(updated);
  }

  async remove(docId: string, userId: string): Promise<void> {
    const doc = await this.getActiveDocOrThrow(docId);
    const member = await this.workspaceService.assertMembership(
      doc.workspaceId,
      userId,
    );
    this.assertCanModify(member.role, doc, userId);

    await this.docsRepository.softDelete(docId, userId);

    await this.activityLogService.record({
      workspaceId: doc.workspaceId,
      actorId: userId,
      entityType: 'Doc',
      entityId: docId,
      action: 'doc.deleted',
    });
    this.realtimeGateway.emitToWorkspace(doc.workspaceId, 'doc.deleted', {
      docId,
    });
  }

  // ---------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------

  private async getActiveDocOrThrow(id: string): Promise<DocRecord> {
    const doc = await this.docsRepository.findActiveById(id);
    if (!doc) {
      throw new NotFoundException('Không tìm thấy Doc');
    }
    return doc;
  }

  // docs.md #5.2/#5.3: chỉ tác giả hoặc Owner/Admin được sửa/xóa.
  private assertCanModify(
    role: WorkspaceRole,
    doc: DocRecord,
    userId: string,
  ): void {
    if (role === WorkspaceRole.OWNER || role === WorkspaceRole.ADMIN) {
      return;
    }
    if (doc.createdBy === userId) {
      return;
    }
    throw new ForbiddenException(
      'Chỉ Owner/Admin hoặc người tạo Doc mới được thao tác',
    );
  }

  private toEntity(doc: DocRecord): DocEntity {
    return {
      id: doc.id,
      workspaceId: doc.workspaceId,
      title: doc.title,
      content: doc.content as Record<string, unknown> | null,
      createdBy: doc.createdBy,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }
}
