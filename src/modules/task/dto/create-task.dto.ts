import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { TaskPriority } from '@prisma/client';

export class CreateTaskDto {
  @IsUUID()
  columnId: string;

  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;

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
