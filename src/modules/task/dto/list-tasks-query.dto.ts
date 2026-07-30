import { IsBooleanString, IsIn, IsOptional, IsString } from 'class-validator';

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

  // Chỉ dùng cho GET /workspaces/:workspaceId/tasks (Scrum Board — board.md #4):
  // "backlog" = Task chưa vào Sprint nào, hoặc 1 Sprint id cụ thể.
  @IsOptional()
  @IsString()
  sprintId?: string;
}
