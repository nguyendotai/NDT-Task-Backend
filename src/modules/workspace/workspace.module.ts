import { Module, forwardRef } from '@nestjs/common';
import { WorkspaceController } from './workspace.controller';
import { WorkspaceService } from './workspace.service';
import { WorkspaceRepository } from './workspace.repository';
import { UserModule } from '../user/user.module';
import { ActivityModule } from '../activity/activity.module';
import { NotificationModule } from '../notification/notification.module';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  // forwardRef vì RealtimeModule cũng import WorkspaceModule (để kiểm tra
  // Member khi client join room) — WorkspaceService cần RealtimeGateway để
  // báo Notification lời mời tức thời, tạo vòng lặp module hợp lệ theo tài
  // liệu NestJS (circular dependency giữa 2 module).
  imports: [
    UserModule,
    ActivityModule,
    NotificationModule,
    forwardRef(() => RealtimeModule),
  ],
  controllers: [WorkspaceController],
  providers: [WorkspaceService, WorkspaceRepository],
  exports: [WorkspaceService],
})
export class WorkspaceModule {}
