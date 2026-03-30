import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString } from 'class-validator';

export class UpdateOrgPipelineStageDto {
  @ApiProperty({
    enum: ['new', 'review', 'analysis', 'approved', 'rejected'],
  })
  @IsString()
  @IsIn(['new', 'review', 'analysis', 'approved', 'rejected'])
  stage: 'new' | 'review' | 'analysis' | 'approved' | 'rejected';
}
