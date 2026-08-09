import {
  IsISO8601,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

// timelog: chỉ được sửa hours/loggedDate/note — không đổi taskId/userId.
export class UpdateTimeLogDto {
  @IsOptional()
  @IsNumber()
  @Min(0.1)
  @Max(24)
  hours?: number;

  @IsOptional()
  @IsISO8601()
  loggedDate?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  note?: string;
}
