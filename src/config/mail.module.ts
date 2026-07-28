import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { createTransport } from 'nodemailer';
import { MailProcessor } from './mail.processor';
import { MailQueueService } from './mail-queue.service';
import { MAIL_TRANSPORTER } from './mail.constants';

@Global()
@Module({
  imports: [BullModule.registerQueue({ name: 'mail' })],
  providers: [
    {
      provide: MAIL_TRANSPORTER,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) =>
        createTransport(
          {
            host: configService.get<string>('mail.host'),
            port: configService.get<number>('mail.port'),
            secure: configService.get<boolean>('mail.secure'),
            auth: {
              user: configService.get<string>('mail.user'),
              pass: configService.get<string>('mail.password'),
            },
          },
          { from: configService.get<string>('mail.from') },
        ),
    },
    MailProcessor,
    MailQueueService,
  ],
  exports: [MAIL_TRANSPORTER, MailQueueService],
})
export class MailModule {}
