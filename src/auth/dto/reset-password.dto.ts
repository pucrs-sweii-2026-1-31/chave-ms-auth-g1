import { ApiProperty } from "@nestjs/swagger";
import { IsString, MaxLength, MinLength } from "class-validator";

export class ResetPasswordDto {
  @ApiProperty()
  @IsString()
  token!: string;

  @ApiProperty({ example: "NewStrongPass123!" })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  newPassword!: string;
}
