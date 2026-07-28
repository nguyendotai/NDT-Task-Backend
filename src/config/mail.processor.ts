import { Inject, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import type { Transporter } from 'nodemailer';
import { MAIL_TRANSPORTER } from './mail.constants';
import { MailJobData } from './mail-queue.service';

@Processor('mail')
export class MailProcessor extends WorkerHost {
  private readonly logger = new Logger(MailProcessor.name);

  constructor(
    @Inject(MAIL_TRANSPORTER) private readonly transporter: Transporter,
  ) {
    super();
  }

  async process(job: Job<MailJobData>): Promise<void> {
    const { to, subject, html } = job.data;
    await this.transporter.sendMail({ to, subject, html });
    this.logger.log(`Mail sent to ${to} (job ${job.id})`);
  }
}
