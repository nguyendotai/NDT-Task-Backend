import { Processor, WorkerHost } from '@nestjs/bullmq';
import { SprintSnapshotService } from './sprint-snapshot.service';

@Processor('sprint-snapshot')
export class SprintSnapshotProcessor extends WorkerHost {
  constructor(private readonly sprintSnapshotService: SprintSnapshotService) {
    super();
  }

  async process(): Promise<void> {
    await this.sprintSnapshotService.captureAllActiveSprints();
  }
}
