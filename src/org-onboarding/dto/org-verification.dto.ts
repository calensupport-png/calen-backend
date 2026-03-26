import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class SubmitOrgVerificationDto {
  @ApiPropertyOptional({ example: 'CAC_CERTIFICATE' })
  @IsOptional()
  @IsString()
  documentType?: string;

  @ApiPropertyOptional({ example: 'RC-1234567' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  referenceNumber?: string;

  @ApiPropertyOptional({ example: 'https://files.example.com/cac.pdf' })
  @IsOptional()
  @IsString()
  supportingDocumentUrl?: string;
}
