import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { TaskStatus } from '@prisma/client';

// Không nhận order từ client: Column mới luôn được thêm vào cuối Board, đổi
// vị trí phải qua PATCH /workspaces/:workspaceId/columns/reorder (dịch order
// toàn bộ Column liên quan, tránh trùng/lệch position — xem column.md #4.5).
export class CreateColumnDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  // task.md #4: Column tự khai báo Status đại diện (bỏ trống = Column này
  // không tự động đổi Status của Task khi chuyển vào).
  @IsOptional()
  @IsEnum(TaskStatus)
  mappedStatus?: TaskStatus;
}
