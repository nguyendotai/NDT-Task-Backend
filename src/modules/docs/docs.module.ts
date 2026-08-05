import { Module } from '@nestjs/common';
import { DocsController, WorkspaceDocsController } from './docs.controller';
import { DocsService } from './docs.service';
import { DocsRepository } from './docs.repository';
import { WorkspaceModule } from '../workspace/workspace.module';
import { ActivityModule } from '../activity/activity.module';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [WorkspaceModule, ActivityModule, RealtimeModule],
  controllers: [DocsController, WorkspaceDocsController],
  providers: [DocsService, DocsRepository],
})
export class DocsModule {}
