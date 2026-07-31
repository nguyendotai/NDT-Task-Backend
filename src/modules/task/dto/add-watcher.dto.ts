import { IsOptional, IsUUID } from 'class-validator';

// Bỏ trống userId = tự thêm chính mình làm Watcher. Chỉ Owner/Admin được
// thêm Watcher cho người khác (xem task.service.ts).
export class AddWatcherDto {
  @IsOptional()
  @IsUUID()
  userId?: string;
}
