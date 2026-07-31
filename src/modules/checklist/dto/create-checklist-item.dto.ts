import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

// checklist.md #5.1: position luôn tự động = cuối danh sách, không nhận từ client.
export class CreateChecklistItemDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title: string;
}
