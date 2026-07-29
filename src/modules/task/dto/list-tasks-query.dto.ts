import { IsBooleanString, IsOptional } from 'class-validator';

export class ListTasksQueryDto {
  @IsOptional()
  @IsBooleanString()
  done?: string;

  @IsOptional()
  @IsBooleanString()
  starred?: string;
}
