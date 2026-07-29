import { IsNotEmpty, IsString } from 'class-validator';

export class TransferOwnerDto {
  @IsString()
  @IsNotEmpty()
  newOwnerId: string;
}
