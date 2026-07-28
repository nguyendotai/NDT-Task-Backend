import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';
import { SprintStatus } from '@prisma/client';

export class UpdateSprintDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  goal?: string;

  @IsOptional()
  @IsEnum(SprintStatus)
  status?: SprintStatus;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}
