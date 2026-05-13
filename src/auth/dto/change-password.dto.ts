import { ApiProperty } from "@nestjs/swagger";
import { IsString, MaxLength, MinLength } from "class-validator";

export class ChangePasswordDto {
  @ApiProperty({ example: "OldStrongPass123!" })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  currentPassword!: string;

  @ApiProperty({ example: "NewStrongPass123!" })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  newPassword!: string;
}
