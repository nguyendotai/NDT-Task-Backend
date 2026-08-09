import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserEntity } from '../user/entities/user.entity';
import { TimeLogService } from './timelog.service';
import { CreateTimeLogDto } from './dto/create-timelog.dto';
import { UpdateTimeLogDto } from './dto/update-timelog.dto';

@Controller('timelogs')
@UseGuards(JwtAuthGuard)
export class TimeLogController {
  constructor(private readonly timeLogService: TimeLogService) {}

  @Patch(':id')
  update(
    @CurrentUser() user: UserEntity,
    @Param('id') id: string,
    @Body() dto: UpdateTimeLogDto,
  ) {
    return this.timeLogService.update(id, user.id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: UserEntity, @Param('id') id: string) {
    return this.timeLogService.remove(id, user.id);
  }
}

@Controller('tasks')
@UseGuards(JwtAuthGuard)
export class TaskTimeLogsController {
  constructor(private readonly timeLogService: TimeLogService) {}

  @Post(':taskId/timelogs')
  create(
    @CurrentUser() user: UserEntity,
    @Param('taskId') taskId: string,
    @Body() dto: CreateTimeLogDto,
  ) {
    return this.timeLogService.create(taskId, user.id, dto);
  }

  @Get(':taskId/timelogs')
  listByTask(@CurrentUser() user: UserEntity, @Param('taskId') taskId: string) {
    return this.timeLogService.listByTask(taskId, user.id);
  }
}
