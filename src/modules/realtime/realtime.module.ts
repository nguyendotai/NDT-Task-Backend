import { Module } from '@nestjs/common';
import { RealtimeGateway } from './realtime.gateway';
import { WorkspaceModule } from '../workspace/workspace.module';
import { UserModule } from '../user/user.module';

@Module({
  imports: [WorkspaceModule, UserModule],
  providers: [RealtimeGateway],
  exports: [RealtimeGateway],
})
export class RealtimeModule {}
