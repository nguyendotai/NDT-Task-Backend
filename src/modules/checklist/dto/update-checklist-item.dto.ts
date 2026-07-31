import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

// checklist.md #5.2: chỉ cho sửa title qua đây — đổi vị trí dùng
// PATCH /tasks/:taskId/checklists/reorder, đổi trạng thái dùng /complete, /reopen.
export class UpdateChecklistItemDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title: string;
}
