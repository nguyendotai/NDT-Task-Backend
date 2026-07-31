import { ArrayNotEmpty, IsArray, IsString } from 'class-validator';

export class ReorderChecklistDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  orderedChecklistIds: string[];
}
