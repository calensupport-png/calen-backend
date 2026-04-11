import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateUnderwritingCaseStageDto {
  @ApiProperty({
    enum: ['new', 'review', 'analysis', 'approved', 'rejected'],
  })
  @IsString()
  @IsIn(['new', 'review', 'analysis', 'approved', 'rejected'])
  stage: 'new' | 'review' | 'analysis' | 'approved' | 'rejected';

  @ApiPropertyOptional({
    example:
      'Approved above policy cap because the applicant provided additional collateral and senior risk accepted the exposure.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  overrideReason?: string;
}
