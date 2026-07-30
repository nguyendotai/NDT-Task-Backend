import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

// Không nhận order từ client: Column mới luôn được thêm vào cuối Board, đổi
// vị trí phải qua PATCH /workspaces/:workspaceId/columns/reorder (dịch order
// toàn bộ Column liên quan, tránh trùng/lệch position — xem column.md #4.5).
export class CreateColumnDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  // task.md #4: mỗi Column tự là 1 "trạng thái" (Task.status = tên Column).
  // isDoneColumn chỉ đánh dấu Column này có được tính là "done" khi lọc
  // done/unfinished hay không (mặc định false).
  @IsOptional()
  @IsBoolean()
  isDoneColumn?: boolean;
}
