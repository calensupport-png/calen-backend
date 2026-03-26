import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Notification,
  NotificationDocument,
} from './schemas/notification.schema';

interface CreateNotificationInput {
  userId: string;
  category: string;
  title: string;
  body: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class NotificationsService {
  constructor(
    @InjectModel(Notification.name)
    private readonly notificationModel: Model<NotificationDocument>,
  ) {}

  async createNotification(input: CreateNotificationInput) {
    return this.notificationModel.create({
      userId: new Types.ObjectId(input.userId),
      category: input.category,
      title: input.title,
      body: input.body,
      metadata: input.metadata ?? null,
    });
  }
}
