import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, MaxLength } from "class-validator";

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: "Maria Silva" })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;
}
