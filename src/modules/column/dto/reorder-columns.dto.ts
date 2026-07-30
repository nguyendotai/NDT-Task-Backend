import { ArrayNotEmpty, IsArray, IsUUID } from 'class-validator';

export class ReorderColumnsDto {
  // Toàn bộ id Column của Board theo đúng thứ tự mong muốn — server gán lại
  // order = index trong mảng này (xem column.md #4.5, #10 API Notes).
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('all', { each: true })
  orderedColumnIds: string[];
}
