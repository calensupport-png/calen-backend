import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthenticatedRequest } from '../auth/interfaces/authenticated-request.interface';
import { CreateUnderwritingCaseDto } from './dto/create-underwriting-case.dto';
import { UpdateUnderwritingCaseNotesDto } from './dto/update-underwriting-case-notes.dto';
import { UpdateUnderwritingCaseStageDto } from './dto/update-underwriting-case-stage.dto';
import { UnderwritingService } from './underwriting.service';

@ApiTags('Underwriting')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({ version: '1' })
export class UnderwritingController {
  constructor(private readonly underwritingService: UnderwritingService) {}

  @Get('org/me/underwriting/pipeline')
  @ApiOperation({ summary: 'Get the underwriting pipeline for the current organisation' })
  @ApiOkResponse()
  getPipeline(@Req() req: AuthenticatedRequest) {
    return this.underwritingService.getPipeline(req.user);
  }

  @Post('org/me/underwriting/cases')
  @ApiOperation({ summary: 'Create an underwriting case from a CALEN profile' })
  @ApiBody({ type: CreateUnderwritingCaseDto })
  @ApiOkResponse()
  createCase(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateUnderwritingCaseDto,
  ) {
    return this.underwritingService.createCase(req.user, dto);
  }

  @Get('org/me/underwriting/cases/:caseId')
  @ApiOperation({ summary: 'Get a single underwriting case for the current organisation' })
  @ApiOkResponse()
  getCase(
    @Req() req: AuthenticatedRequest,
    @Param('caseId') caseId: string,
  ) {
    return this.underwritingService.getCase(req.user, caseId);
  }

  @Patch('org/me/underwriting/cases/:caseId/stage')
  @ApiOperation({ summary: 'Update an underwriting case stage' })
  @ApiBody({ type: UpdateUnderwritingCaseStageDto })
  @ApiOkResponse()
  updateCaseStage(
    @Req() req: AuthenticatedRequest,
    @Param('caseId') caseId: string,
    @Body() dto: UpdateUnderwritingCaseStageDto,
  ) {
    return this.underwritingService.updateCaseStage(req.user, caseId, dto);
  }

  @Patch('org/me/underwriting/cases/:caseId/notes')
  @ApiOperation({ summary: 'Update internal underwriting notes for a case' })
  @ApiBody({ type: UpdateUnderwritingCaseNotesDto })
  @ApiOkResponse()
  updateCaseNotes(
    @Req() req: AuthenticatedRequest,
    @Param('caseId') caseId: string,
    @Body() dto: UpdateUnderwritingCaseNotesDto,
  ) {
    return this.underwritingService.updateCaseNotes(req.user, caseId, dto);
  }
}
