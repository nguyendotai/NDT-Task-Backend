import { IsInt, IsOptional, IsString } from 'class-validator';

export class CreateChecklistItemDto {
  @IsString()
  title: string;

  @IsOptional()
  @IsInt()
  order?: number;
}
