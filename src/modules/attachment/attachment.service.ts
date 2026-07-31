import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { NotificationType, WorkspaceRole } from '@prisma/client';
import type { UploadApiErrorResponse, UploadApiResponse } from 'cloudinary';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { CLOUDINARY_CLIENT } from '../../config/cloudinary.module';
import { AttachmentRepository } from './attachment.repository';
import { WorkspaceService } from '../workspace/workspace.service';
import { ActivityLogService } from '../activity/activity-log.service';
import { NotificationService } from '../notification/notification.service';
import { AttachmentEntity } from './entities/attachment.entity';

type CloudinaryClient = typeof import('cloudinary').v2;

type AttachmentRecord = NonNullable<
  Awaited<ReturnType<AttachmentRepository['findActiveById']>>
>;

const ATTACHMENT_FOLDER = 'ndt-task/attachments';

@Injectable()
export class AttachmentService {
  constructor(
    private readonly attachmentRepository: AttachmentRepository,
    private readonly workspaceService: WorkspaceService,
    private readonly activityLogService: ActivityLogService,
    private readonly notificationService: NotificationService,
    @Inject(CLOUDINARY_CLIENT) private readonly cloudinary: CloudinaryClient,
  ) {}

  async upload(
    taskId: string,
    userId: string,
    file: Express.Multer.File,
  ): Promise<AttachmentEntity> {
    const task = await this.getWorkspaceContextOrThrow(taskId);
    await this.workspaceService.assertMembership(task.workspaceId, userId);

    const result = await this.uploadToCloudinary(file.buffer, taskId);
    const attachment = await this.attachmentRepository.create({
      taskId,
      uploaderId: userId,
      fileName: file.originalname,
      fileUrl: result.secure_url,
      filePublicId: result.public_id,
      fileSize: file.size,
      mimeType: file.mimetype,
    });

    await this.activityLogService.record({
      workspaceId: task.workspaceId,
      actorId: userId,
      entityType: 'Task',
      entityId: taskId,
      action: 'attachment.uploaded',
      metadata: { attachmentId: attachment.id, fileName: file.originalname },
    });

    const watchers = await this.attachmentRepository.listWatcherUserIds(taskId);
    const recipients = new Set(
      [
        ...task.assigneeIds,
        ...watchers.map((watcher) => watcher.userId),
      ].filter((recipientId) => recipientId !== userId),
    );
    for (const recipientId of recipients) {
      await this.notificationService.notify({
        workspaceId: task.workspaceId,
        recipientId,
        type: NotificationType.ATTACHMENT_ADDED,
        title: 'Có tệp đính kèm mới trong Task của bạn',
        message: file.originalname,
        metadata: { taskId, attachmentId: attachment.id },
      });
    }

    return this.toEntity(attachment);
  }

  async listByTask(
    taskId: string,
    userId: string,
  ): Promise<AttachmentEntity[]> {
    const task = await this.getWorkspaceContextOrThrow(taskId);
    await this.workspaceService.assertMembership(task.workspaceId, userId);

    const attachments =
      await this.attachmentRepository.listActiveByTaskId(taskId);
    return attachments.map((attachment) => this.toEntity(attachment));
  }

  async remove(attachmentId: string, userId: string): Promise<void> {
    const attachment = await this.getActiveAttachmentOrThrow(attachmentId);
    const task = await this.getWorkspaceContextOrThrow(attachment.taskId);
    const member = await this.workspaceService.assertMembership(
      task.workspaceId,
      userId,
    );
    this.assertCanModify(member.role, attachment, userId);

    await this.attachmentRepository.softDelete(attachmentId, userId);

    await this.activityLogService.record({
      workspaceId: task.workspaceId,
      actorId: userId,
      entityType: 'Task',
      entityId: attachment.taskId,
      action: 'attachment.deleted',
      metadata: { attachmentId, fileName: attachment.fileName },
    });
  }

  // attachment.md #5.4: chỉ cho đổi fileName, không đổi fileUrl/fileType/fileSize.
  async rename(
    attachmentId: string,
    userId: string,
    fileName: string,
  ): Promise<AttachmentEntity> {
    const attachment = await this.getActiveAttachmentOrThrow(attachmentId);
    const task = await this.getWorkspaceContextOrThrow(attachment.taskId);
    const member = await this.workspaceService.assertMembership(
      task.workspaceId,
      userId,
    );
    this.assertCanModify(member.role, attachment, userId);

    const updated = await this.attachmentRepository.rename(
      attachmentId,
      fileName,
    );

    await this.activityLogService.record({
      workspaceId: task.workspaceId,
      actorId: userId,
      entityType: 'Task',
      entityId: attachment.taskId,
      action: 'attachment.renamed',
      metadata: { attachmentId, fileName },
    });

    return this.toEntity(updated);
  }

  private uploadToCloudinary(
    buffer: Buffer,
    taskId: string,
  ): Promise<UploadApiResponse> {
    return new Promise((resolve, reject) => {
      const uploadStream = this.cloudinary.uploader.upload_stream(
        {
          folder: `${ATTACHMENT_FOLDER}/${taskId}`,
          public_id: randomUUID(),
          resource_type: 'auto',
        },
        (error?: UploadApiErrorResponse, result?: UploadApiResponse) => {
          if (error || !result) {
            reject(new Error(error?.message ?? 'Cloudinary upload thất bại'));
            return;
          }
          resolve(result);
        },
      );
      Readable.from(buffer).pipe(uploadStream);
    });
  }

  private async getActiveAttachmentOrThrow(
    id: string,
  ): Promise<AttachmentRecord> {
    const attachment = await this.attachmentRepository.findActiveById(id);
    if (!attachment) {
      throw new NotFoundException('Không tìm thấy Attachment');
    }
    return attachment;
  }

  private async getWorkspaceContextOrThrow(taskId: string) {
    const task =
      await this.attachmentRepository.findActiveTaskWithWorkspace(taskId);
    if (!task) {
      throw new NotFoundException('Không tìm thấy Task');
    }
    return {
      workspaceId: task.column.board.workspaceId,
      assigneeIds: task.assigneeIds,
    };
  }

  // attachment.md #5.3/#5.4: chỉ uploader hoặc Admin/Owner được xóa hoặc đổi tên.
  private assertCanModify(
    role: WorkspaceRole,
    attachment: AttachmentRecord,
    userId: string,
  ): void {
    if (role === WorkspaceRole.OWNER || role === WorkspaceRole.ADMIN) {
      return;
    }
    if (attachment.uploaderId === userId) {
      return;
    }
    throw new ForbiddenException(
      'Chỉ Owner/Admin hoặc người tải lên mới được thao tác Attachment',
    );
  }

  private toEntity(attachment: AttachmentRecord): AttachmentEntity {
    return {
      id: attachment.id,
      taskId: attachment.taskId,
      uploaderId: attachment.uploaderId,
      fileName: attachment.fileName,
      fileUrl: attachment.fileUrl,
      filePublicId: attachment.filePublicId,
      fileSize: attachment.fileSize,
      mimeType: attachment.mimeType,
      createdAt: attachment.createdAt,
    };
  }
}
