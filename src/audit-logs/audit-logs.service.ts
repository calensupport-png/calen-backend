import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AuditLog, AuditLogDocument } from './schemas/audit-log.schema';

interface RecordAuditLogInput {
  action: string;
  actorType?: string;
  actorId?: string | Types.ObjectId;
  targetType?: string;
  targetId?: string | Types.ObjectId;
  requestId?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AuditLogsService {
  constructor(
    @InjectModel(AuditLog.name)
    private readonly auditLogModel: Model<AuditLogDocument>,
  ) {}

  async record(input: RecordAuditLogInput): Promise<void> {
    await this.auditLogModel.create({
      ...input,
      actorId:
        typeof input.actorId === 'string'
          ? new Types.ObjectId(input.actorId)
          : input.actorId,
      targetId:
        typeof input.targetId === 'string'
          ? new Types.ObjectId(input.targetId)
          : input.targetId,
    });
  }
}
