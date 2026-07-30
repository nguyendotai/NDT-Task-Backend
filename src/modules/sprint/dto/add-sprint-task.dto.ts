import { IsNotEmpty, IsUUID } from 'class-validator';

export class AddSprintTaskDto {
  @IsUUID()
  @IsNotEmpty()
  taskId: string;
}
