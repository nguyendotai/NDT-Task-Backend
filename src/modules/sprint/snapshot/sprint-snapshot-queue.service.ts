import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

const DAILY_SNAPSHOT_JOB_ID = 'daily-sprint-snapshot';

// Đăng ký repeatable job 1 lần lúc app khởi động — BullMQ tự khoá theo
// jobId/pattern nên gọi lại nhiều lần (mỗi lần restart server) không tạo
// trùng lặp job.
@Injectable()
export class SprintSnapshotQueueService implements OnModuleInit {
  constructor(@InjectQueue('sprint-snapshot') private readonly queue: Queue) {}

  async onModuleInit(): Promise<void> {
    await this.queue.add(
      'capture-daily',
      {},
      {
        repeat: { pattern: '0 0 * * *' },
        jobId: DAILY_SNAPSHOT_JOB_ID,
      },
    );
  }
}
