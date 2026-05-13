import { ApiProperty } from "@nestjs/swagger";

export class AuthUserDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty({ nullable: true })
  name!: string | null;

  @ApiProperty({ type: [String] })
  roles!: string[];
}

export class AuthResponseDto {
  @ApiProperty()
  accessToken!: string;

  @ApiProperty({ example: "Bearer" })
  tokenType!: "Bearer";

  @ApiProperty({ description: "Access token TTL in seconds" })
  expiresIn!: number;

  @ApiProperty({ type: AuthUserDto })
  user!: AuthUserDto;
}
