import { IsInt, IsString } from 'class-validator';

export class CreateAttachmentDto {
  @IsString()
  fileName: string;

  @IsString()
  fileUrl: string;

  @IsString()
  filePublicId: string;

  @IsInt()
  fileSize: number;

  @IsString()
  mimeType: string;
}
