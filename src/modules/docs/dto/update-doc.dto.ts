import {
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

// docs.md #5.2: chỉ được sửa title/content.
export class UpdateDocDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsObject()
  content?: Record<string, unknown>;
}
