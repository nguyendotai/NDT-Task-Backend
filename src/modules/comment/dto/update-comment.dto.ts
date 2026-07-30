import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

// comment.md #5.2: chỉ được sửa content.
export class UpdateCommentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  content: string;
}
