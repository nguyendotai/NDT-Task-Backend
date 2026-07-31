import {
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserEntity } from '../user/entities/user.entity';
import { NotificationService } from './notification.service';
import { ListNotificationsQueryDto } from './dto/list-notifications-query.dto';

function toBoolean(value?: string): boolean | undefined {
  return value === undefined ? undefined : value === 'true';
}

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  listMine(
    @CurrentUser() user: UserEntity,
    @Query() query: ListNotificationsQueryDto,
  ) {
    return this.notificationService.listMine(user.id, toBoolean(query.unread));
  }

  @Patch('read-all')
  markAllRead(@CurrentUser() user: UserEntity) {
    return this.notificationService.markAllAsRead(user.id);
  }

  @Patch(':id/read')
  markRead(@CurrentUser() user: UserEntity, @Param('id') id: string) {
    return this.notificationService.markAsRead(id, user.id);
  }

  @Delete(':id')
  remove(@CurrentUser() user: UserEntity, @Param('id') id: string) {
    return this.notificationService.remove(id, user.id);
  }
}
