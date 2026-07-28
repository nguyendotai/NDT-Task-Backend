import { IsInt, IsOptional, IsString } from 'class-validator';

export class CreateColumnDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsInt()
  order?: number;
}
