import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class IntrospectionResponseDto {
  @ApiProperty()
  active!: boolean;

  @ApiPropertyOptional()
  sub?: string;

  @ApiPropertyOptional()
  email?: string;

  @ApiPropertyOptional({ type: [String] })
  roles?: string[];

  @ApiPropertyOptional()
  sessionId?: string;

  @ApiPropertyOptional()
  exp?: number;

  @ApiPropertyOptional()
  iat?: number;
}
