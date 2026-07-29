import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { WorkspaceType } from '@prisma/client';

export class CreateWorkspaceDto {
  @IsString()
  @MinLength(3)
  name: string;

  @IsEnum(WorkspaceType)
  type: WorkspaceType;

  @IsOptional()
  @IsString()
  description?: string;

  // Cả 2 field dưới đây phải cùng có hoặc cùng không có — nếu bỏ trống, Service
  // sẽ tự chọn ngẫu nhiên 1 preset (xem workspace-avatar-presets.ts).
  @IsOptional()
  @IsString()
  avatarEmoji?: string;

  @IsOptional()
  @IsString()
  avatarColor?: string;
}
