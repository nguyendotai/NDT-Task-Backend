import { Module } from '@nestjs/common';
import { LabelController, TaskLabelsController } from './label.controller';
import { LabelService } from './label.service';
import { LabelRepository } from './label.repository';
import { WorkspaceModule } from '../workspace/workspace.module';
import { ActivityModule } from '../activity/activity.module';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [WorkspaceModule, ActivityModule, RealtimeModule],
  controllers: [LabelController, TaskLabelsController],
  providers: [LabelService, LabelRepository],
})
export class LabelModule {}
