import { ApiProperty } from '@nestjs/swagger';

class AuthUserOrganizationDto {
  @ApiProperty({ example: '66bf0a1d5a5b7d1a0f3e7b21' })
  id?: string;

  @ApiProperty({ example: 'Calen Inc' })
  name?: string;
}

export class AuthUserDto {
  @ApiProperty({ example: '66bf0a1d5a5b7d1a0f3e7b20' })
  id: string;

  @ApiProperty({ example: 'jay@example.com' })
  email: string;

  @ApiProperty({ example: 'Jay Doe' })
  displayName?: string;

  @ApiProperty({ example: 'Jay' })
  firstName?: string;

  @ApiProperty({ example: 'Doe' })
  lastName?: string;

  @ApiProperty({ example: '+2348012345678', nullable: true })
  phone?: string;

  @ApiProperty({ example: 'NG', nullable: true })
  country?: string;

  @ApiProperty({ example: 'Operations Lead', nullable: true })
  jobTitle?: string;

  @ApiProperty({ example: ['USER'] })
  roles?: string[];

  @ApiProperty({ example: 'INDIVIDUAL' })
  accountType?: string;

  @ApiProperty({ example: 'ACTIVE' })
  status?: string;

  @ApiProperty({ example: '2026-03-26T10:00:00.000Z', nullable: true })
  emailVerifiedAt?: string | null;

  @ApiProperty({ example: '66bf0a1d5a5b7d1a0f3e7b22', nullable: true })
  profileId?: string;

  @ApiProperty({
    required: false,
    type: AuthUserOrganizationDto,
    nullable: true,
  })
  organization?: AuthUserOrganizationDto;
}

export class AuthResponseDto {
  @ApiProperty({
    example:
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2NmJmMGExZDVhNWI3ZDFhMGYzZTdiMjAiLCJlbWFpbCI6ImpheUBleGFtcGxlLmNvbSIsInNpZCI6IjY2YmYwYTFiNWU2ODQyNWEyOTQyYWE5MyIsImlhdCI6MTcxMTQ0MDAwMCwiZXhwIjoxNzExNDQzNjAwfQ.Z7dD7Kk7ZlV5xj6f9Oe1Yk2Jwqv0f7iYk2qj6P7lKxI',
  })
  accessToken: string;

  @ApiProperty({ example: 'Bearer' })
  tokenType: string;

  @ApiProperty({ example: '1h' })
  expiresIn: string;

  @ApiProperty({ type: AuthUserDto })
  user: AuthUserDto;
}
