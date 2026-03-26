import { ApiProperty } from '@nestjs/swagger';
import { AuthUserDto } from './auth-response.dto';

export class MeResponseDto {
  @ApiProperty({ type: AuthUserDto })
  user: AuthUserDto;
}
