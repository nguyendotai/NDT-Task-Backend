import { IsBooleanString, IsIn, IsOptional } from 'class-validator';

export class ListTasksQueryDto {
  @IsOptional()
  @IsBooleanString()
  done?: string;

  @IsOptional()
  @IsBooleanString()
  starred?: string;

  @IsOptional()
  @IsIn(['assignee', 'assignee-or-creator'])
  scope?: 'assignee' | 'assignee-or-creator';
}
