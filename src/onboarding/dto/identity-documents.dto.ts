import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class IdentityDocumentItemDto {
  @ApiProperty({ example: 'government_id' })
  @IsString()
  type: string;

  @ApiProperty({ example: 'passport-front.jpg' })
  @IsString()
  @MaxLength(120)
  fileName: string;

  @ApiProperty({ example: 'https://files.example.com/passport-front.jpg' })
  @IsUrl()
  fileUrl: string;

  @ApiProperty({ example: 'image/jpeg' })
  @IsString()
  mimeType: string;

  @ApiProperty({ example: 248120 })
  @IsInt()
  @Min(1)
  sizeBytes: number;

  @ApiProperty({ example: 'front' })
  @IsOptional()
  @IsString()
  side?: string;
}

export class UploadIdentityDocumentsDto {
  @ApiProperty({ type: [IdentityDocumentItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => IdentityDocumentItemDto)
  documents: IdentityDocumentItemDto[];
}
