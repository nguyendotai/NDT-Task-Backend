import { SystemRole } from '@prisma/client';

export class UserEntity {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string | null;
  avatarPublicId?: string | null;
  settings?: Record<string, unknown> | null;
  systemRole: SystemRole;
  // Chỉ trả trạng thái bật/tắt — không bao giờ trả twoFactorSecret ra ngoài.
  twoFactorEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}
