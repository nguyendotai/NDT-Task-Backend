import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

// Chỉ đổi tên qua endpoint này — đổi vị trí phải qua endpoint reorder riêng
// (xem create-column.dto.ts).
export class UpdateColumnDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;
}
