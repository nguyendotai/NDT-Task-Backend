import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { TaskPriority } from '@prisma/client';

// task.md #4: không còn nhận status từ client — status luôn mirror tên Column
// hiện tại, chỉ đổi được gián tiếp qua columnId (xem task.service.ts).
export class UpdateTaskDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;

  @IsOptional()
  @IsUUID()
  columnId?: string;

  // task.md #10: vị trí (index, bắt đầu từ 0) mong muốn của Task trong Column
  // đích (columnId nếu có, hoặc Column hiện tại nếu chỉ đổi vị trí). Bỏ trống
  // = giữ hành vi cũ (thêm vào cuối Column khi đổi columnId).
  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;

  // task.md #3: nhiều người được giao cùng lúc (theo quyết định của bạn,
  // thay cho assigneeId 1 người trước đây). Gửi mảng rỗng để bỏ gán hết.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('4', { each: true })
  assigneeIds?: string[];

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  // Bổ sung theo yêu cầu (không thuộc field chuẩn task.md) — hiển thị ở modal
  // chi tiết Task, không ràng buộc nghiệp vụ.
  @IsOptional()
  @IsInt()
  @Min(0)
  storyPoints?: number;
}
