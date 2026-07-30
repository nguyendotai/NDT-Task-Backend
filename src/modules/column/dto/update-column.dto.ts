import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { TaskStatus } from '@prisma/client';

// Đổi tên và/hoặc Status đại diện của Column qua endpoint này — đổi vị trí
// phải qua endpoint reorder riêng (xem create-column.dto.ts).
export class UpdateColumnDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsEnum(TaskStatus)
  mappedStatus?: TaskStatus | null;
}
