import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { NotificationType, WorkspaceRole } from '@prisma/client';
import { CommentRepository } from './comment.repository';
import { WorkspaceService } from '../workspace/workspace.service';
import { ActivityLogService } from '../activity/activity-log.service';
import { NotificationService } from '../notification/notification.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { CommentEntity } from './entities/comment.entity';

type CommentRecord = NonNullable<
  Awaited<ReturnType<CommentRepository['findActiveById']>>
>;

@Injectable()
export class CommentService {
  constructor(
    private readonly commentRepository: CommentRepository,
    private readonly workspaceService: WorkspaceService,
    private readonly activityLogService: ActivityLogService,
    private readonly notificationService: NotificationService,
    private readonly realtimeGateway: RealtimeGateway,
  ) {}

  async create(
    taskId: string,
    userId: string,
    dto: CreateCommentDto,
  ): Promise<CommentEntity> {
    const task =
      await this.commentRepository.findActiveTaskWithWorkspace(taskId);
    if (!task) {
      throw new NotFoundException('Không tìm thấy Task');
    }
    const workspaceId = task.column.board.workspaceId;
    await this.workspaceService.assertMembership(workspaceId, userId);

    const mentions = dto.mentions ?? [];
    for (const mentionedUserId of mentions) {
      const member = await this.workspaceService.findMembership(
        workspaceId,
        mentionedUserId,
      );
      if (!member) {
        throw new BadRequestException(
          'Chỉ có thể mention Member của Workspace',
        );
      }
    }

    const comment = await this.commentRepository.create({
      taskId,
      authorId: userId,
      content: dto.content,
      mentions,
    });

    await this.activityLogService.record({
      workspaceId,
      actorId: userId,
      entityType: 'Task',
      entityId: taskId,
      action: 'comment.created',
      metadata: { commentId: comment.id },
    });
    this.realtimeGateway.emitToWorkspace(workspaceId, 'comment.created', {
      taskId,
      commentId: comment.id,
    });
    if (mentions.length > 0) {
      await this.activityLogService.record({
        workspaceId,
        actorId: userId,
        entityType: 'Task',
        entityId: taskId,
        action: 'comment.mentioned',
        metadata: { commentId: comment.id, mentions },
      });
    }

    const watchers = await this.commentRepository.listWatcherUserIds(taskId);
    // notification.md #5.2: gửi cho Assignee + Watcher, không trùng người vừa
    // comment và không gửi trùng 2 lần cho cùng 1 người.
    const commentRecipients = new Set(
      [
        ...task.assigneeIds,
        ...watchers.map((watcher) => watcher.userId),
      ].filter((recipientId) => recipientId !== userId),
    );
    for (const recipientId of commentRecipients) {
      await this.notificationService.notify({
        workspaceId,
        recipientId,
        type: NotificationType.COMMENT_ADDED,
        title: 'Có bình luận mới trong Task của bạn',
        message: dto.content,
        metadata: { taskId, commentId: comment.id },
      });
      this.realtimeGateway.emitToUser(recipientId, 'notification.created', {});
    }
    for (const mentionedUserId of mentions) {
      if (mentionedUserId === userId) continue;
      await this.notificationService.notify({
        workspaceId,
        recipientId: mentionedUserId,
        type: NotificationType.MENTION,
        title: 'Bạn được nhắc đến trong một bình luận',
        message: dto.content,
        metadata: { taskId, commentId: comment.id },
      });
      this.realtimeGateway.emitToUser(
        mentionedUserId,
        'notification.created',
        {},
      );
    }

    return this.toEntity(comment);
  }

  async listByTask(taskId: string, userId: string): Promise<CommentEntity[]> {
    const task =
      await this.commentRepository.findActiveTaskWithWorkspace(taskId);
    if (!task) {
      throw new NotFoundException('Không tìm thấy Task');
    }
    await this.workspaceService.assertMembership(
      task.column.board.workspaceId,
      userId,
    );

    const comments = await this.commentRepository.listActiveByTaskId(taskId);
    return comments.map((comment) => this.toEntity(comment));
  }

  async update(
    commentId: string,
    userId: string,
    dto: UpdateCommentDto,
  ): Promise<CommentEntity> {
    const comment = await this.getActiveCommentOrThrow(commentId);
    const workspaceId = await this.getWorkspaceIdForTaskOrThrow(comment.taskId);
    const member = await this.workspaceService.assertMembership(
      workspaceId,
      userId,
    );
    this.assertCanModify(member.role, comment, userId);

    const updated = await this.commentRepository.update(commentId, dto.content);

    await this.activityLogService.record({
      workspaceId,
      actorId: userId,
      entityType: 'Task',
      entityId: comment.taskId,
      action: 'comment.updated',
      metadata: { commentId },
    });
    this.realtimeGateway.emitToWorkspace(workspaceId, 'comment.updated', {
      taskId: comment.taskId,
      commentId,
    });

    return this.toEntity(updated);
  }

  async remove(commentId: string, userId: string): Promise<void> {
    const comment = await this.getActiveCommentOrThrow(commentId);
    const workspaceId = await this.getWorkspaceIdForTaskOrThrow(comment.taskId);
    const member = await this.workspaceService.assertMembership(
      workspaceId,
      userId,
    );
    this.assertCanModify(member.role, comment, userId);

    await this.commentRepository.softDelete(commentId, userId);

    await this.activityLogService.record({
      workspaceId,
      actorId: userId,
      entityType: 'Task',
      entityId: comment.taskId,
      action: 'comment.deleted',
      metadata: { commentId },
    });
    this.realtimeGateway.emitToWorkspace(workspaceId, 'comment.deleted', {
      taskId: comment.taskId,
      commentId,
    });
  }

  // ---------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------

  private async getActiveCommentOrThrow(id: string): Promise<CommentRecord> {
    const comment = await this.commentRepository.findActiveById(id);
    if (!comment) {
      throw new NotFoundException('Không tìm thấy Comment');
    }
    return comment;
  }

  private async getWorkspaceIdForTaskOrThrow(taskId: string): Promise<string> {
    const task =
      await this.commentRepository.findActiveTaskWithWorkspace(taskId);
    if (!task) {
      throw new NotFoundException('Không tìm thấy Task');
    }
    return task.column.board.workspaceId;
  }

  // comment.md #5.2/#5.3: chỉ author hoặc Admin/Owner được sửa/xóa.
  private assertCanModify(
    role: WorkspaceRole,
    comment: CommentRecord,
    userId: string,
  ): void {
    if (role === WorkspaceRole.OWNER || role === WorkspaceRole.ADMIN) {
      return;
    }
    if (comment.authorId === userId) {
      return;
    }
    throw new ForbiddenException(
      'Chỉ Owner/Admin hoặc người tạo Comment mới được thao tác',
    );
  }

  private toEntity(comment: CommentRecord): CommentEntity {
    return {
      id: comment.id,
      taskId: comment.taskId,
      authorId: comment.authorId,
      content: comment.content,
      mentions: comment.mentions,
      createdAt: comment.createdAt,
      updatedAt: comment.updatedAt,
    };
  }
}
