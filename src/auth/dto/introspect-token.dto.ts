import { ApiProperty } from "@nestjs/swagger";
import { IsString } from "class-validator";

export class IntrospectTokenDto {
  @ApiProperty({ description: "Access token to validate" })
  @IsString()
  token!: string;
}
