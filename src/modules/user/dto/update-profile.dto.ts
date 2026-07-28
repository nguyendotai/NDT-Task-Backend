import { IsObject, IsOptional, IsString } from 'class-validator';

// avatarUrl không nằm trong DTO này: đổi avatar bắt buộc qua POST /users/me/avatar
// (upload Cloudinary), tránh nhận URL ảnh tuỳ ý từ client không qua kiểm duyệt.
export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsObject()
  settings?: Record<string, unknown>;
}
