import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

// sprint.md #5.2: chỉ Sprint ở trạng thái Planned mới được cập nhật, và chỉ
// được sửa name/goal/startDate/endDate — đổi status phải qua /start, /complete
// (không nhận status trực tiếp ở đây để không bỏ qua các điều kiện chuyển
// trạng thái, giống cách UpdateTaskDto không nhận status).
export class UpdateSprintDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  goal?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}
