import { ApiProperty } from "@nestjs/swagger";
import { ArrayNotEmpty, IsArray, IsString } from "class-validator";

export class UpdateUserRolesDto {
  @ApiProperty({ example: ["user", "staff"], type: [String] })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  roles!: string[];
}
