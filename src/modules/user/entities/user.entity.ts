import { SystemRole } from '@prisma/client';

export class UserEntity {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string | null;
  avatarPublicId?: string | null;
  settings?: Record<string, unknown> | null;
  systemRole: SystemRole;
  createdAt: Date;
  updatedAt: Date;
}
