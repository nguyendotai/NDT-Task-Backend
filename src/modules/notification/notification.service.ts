import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { NotificationType, Prisma } from '@prisma/client';
import { UserService } from '../user/user.service';
import { NotificationRepository } from './notification.repository';
import { NotificationEntity } from './entities/notification.entity';

// user.md (mở rộng): tuỳ chọn tắt/bật thông báo theo từng loại, chỉ ảnh
// hưởng Notification in-app — lưu chung trong `User.settings` (field Json?
// có sẵn từ đầu dự án, chưa ai dùng) thay vì thêm model/field mới. Mặc định
// bật hết (opt-out) nếu user chưa từng cấu hình, giữ nguyên hành vi cũ.
interface NotificationSettings {
  notificationPreferences?: Partial<Record<NotificationType, boolean>>;
}

export interface NotificationEntry {
  workspaceId: string;
  recipientId: string;
  type: NotificationType;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
}

type NotificationRecord = NonNullable<
  Awaited<ReturnType<NotificationRepository['findActiveById']>>
>;

@Injectable()
export class NotificationService {
  constructor(
    private readonly notificationRepository: NotificationRepository,
    private readonly userService: UserService,
  ) {}

  async notify(entry: NotificationEntry): Promise<void> {
    const isEnabled = await this.isTypeEnabled(entry.recipientId, entry.type);
    if (!isEnabled) return;

    await this.notificationRepository.create({
      ...entry,
      metadata: entry.metadata as Prisma.InputJsonValue | undefined,
    });
  }

  private async isTypeEnabled(
    userId: string,
    type: NotificationType,
  ): Promise<boolean> {
    const profile = await this.userService.getProfile(userId);
    const settings = profile.settings as NotificationSettings | null;
    return settings?.notificationPreferences?.[type] ?? true;
  }

  async listMine(
    userId: string,
    unreadOnly?: boolean,
  ): Promise<NotificationEntity[]> {
    const rows = await this.notificationRepository.listByRecipient(
      userId,
      unreadOnly,
    );
    return rows.map((row) => this.toEntity(row));
  }

  async markAsRead(id: string, userId: string): Promise<NotificationEntity> {
    const notification = await this.getOwnedOrThrow(id, userId);
    const updated = await this.notificationRepository.markRead(notification.id);
    return this.toEntity(updated);
  }

  async markAllAsRead(userId: string): Promise<void> {
    await this.notificationRepository.markAllRead(userId);
  }

  async remove(id: string, userId: string): Promise<void> {
    const notification = await this.getOwnedOrThrow(id, userId);
    await this.notificationRepository.softDelete(notification.id, userId);
  }

  // notification.md #8: Member chỉ xem/thao tác Notification của chính mình.
  private async getOwnedOrThrow(
    id: string,
    userId: string,
  ): Promise<NotificationRecord> {
    const notification = await this.notificationRepository.findActiveById(id);
    if (!notification) {
      throw new NotFoundException('Không tìm thấy Notification');
    }
    if (notification.recipientId !== userId) {
      throw new ForbiddenException('Không có quyền thao tác Notification này');
    }
    return notification;
  }

  private toEntity(row: NotificationRecord): NotificationEntity {
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      recipientId: row.recipientId,
      type: row.type,
      title: row.title,
      message: row.message,
      metadata: row.metadata as Record<string, unknown> | null,
      isRead: row.isRead,
      readAt: row.readAt,
      createdAt: row.createdAt,
    };
  }
}
