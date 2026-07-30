import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

// Đổi tên và/hoặc isDoneColumn của Column qua endpoint này — đổi vị trí
// phải qua endpoint reorder riêng (xem create-column.dto.ts).
export class UpdateColumnDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsBoolean()
  isDoneColumn?: boolean;
}
