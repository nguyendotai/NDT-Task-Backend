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

export class CreateTimeLogDto {
  @IsNumber()
  @Min(0.1)
  @Max(24)
  hours: number;

  @IsISO8601()
  loggedDate: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  note?: string;
}
