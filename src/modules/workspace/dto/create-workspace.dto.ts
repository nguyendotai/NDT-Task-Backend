import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { WorkspaceType } from '@prisma/client';

export class CreateWorkspaceDto {
  @IsString()
  @MinLength(3)
  name: string;

  @IsEnum(WorkspaceType)
  type: WorkspaceType;

  @IsOptional()
  @IsString()
  description?: string;
}
