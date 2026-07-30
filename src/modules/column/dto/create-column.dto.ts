import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

// Không nhận order từ client: Column mới luôn được thêm vào cuối Board, đổi
// vị trí phải qua PATCH /workspaces/:workspaceId/columns/reorder (dịch order
// toàn bộ Column liên quan, tránh trùng/lệch position — xem column.md #4.5).
export class CreateColumnDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;
}
