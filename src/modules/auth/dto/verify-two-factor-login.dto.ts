import { IsNotEmpty, IsString, Length } from 'class-validator';

export class VerifyTwoFactorLoginDto {
  @IsString()
  @IsNotEmpty()
  tempToken: string;

  @IsString()
  @IsNotEmpty()
  @Length(6, 6)
  code: string;
}
