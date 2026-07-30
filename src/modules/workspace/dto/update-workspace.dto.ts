import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { WorkspaceVisibility } from '@prisma/client';

export class UpdateWorkspaceDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(WorkspaceVisibility)
  visibility?: WorkspaceVisibility;
}
