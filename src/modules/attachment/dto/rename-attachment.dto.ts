import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

// attachment.md #5.4: chỉ cho phép đổi fileName.
export class RenameAttachmentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  fileName: string;
}
