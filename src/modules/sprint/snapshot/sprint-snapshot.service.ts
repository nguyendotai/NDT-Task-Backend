import { Injectable, Logger } from '@nestjs/common';
import { SprintRepository } from '../sprint.repository';
import { startOfUtcDay } from '../sprint.util';

// Burndown Chart cần biết "còn lại bao nhiêu điểm mỗi ngày" — chụp 1 snapshot
// mỗi ngày cho mọi Sprint đang Active (gọi bởi SprintSnapshotProcessor theo
// lịch cron BullMQ). Sprint đã Completed/Planned không cần chụp nữa.
@Injectable()
export class SprintSnapshotService {
  private readonly logger = new Logger(SprintSnapshotService.name);

  constructor(private readonly sprintRepository: SprintRepository) {}

  async captureAllActiveSprints(): Promise<void> {
    const activeSprints = await this.sprintRepository.listActiveSprintIds();
    const snapshotDate = startOfUtcDay(new Date());

    for (const { id } of activeSprints) {
      const { totalPoints, remainingPoints } =
        await this.sprintRepository.getCurrentPoints(id);
      await this.sprintRepository.upsertSnapshot({
        sprintId: id,
        snapshotDate,
        totalPoints,
        remainingPoints,
      });
    }

    this.logger.log(
      `Captured burndown snapshot for ${activeSprints.length} active sprint(s)`,
    );
  }
}
