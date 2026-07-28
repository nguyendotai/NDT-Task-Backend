import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

export interface MailJobData {
  to: string;
  subject: string;
  html: string;
}

@Injectable()
export class MailQueueService {
  constructor(
    @InjectQueue('mail') private readonly mailQueue: Queue<MailJobData>,
  ) {}

  async enqueueSend(data: MailJobData): Promise<void> {
    await this.mailQueue.add('send', data, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: true,
      removeOnFail: 50,
    });
  }
}
