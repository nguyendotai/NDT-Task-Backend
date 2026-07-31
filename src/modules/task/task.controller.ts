import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserEntity } from '../user/entities/user.entity';
import { TaskService } from './task.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { ListTasksQueryDto } from './dto/list-tasks-query.dto';
import { AddWatcherDto } from './dto/add-watcher.dto';

function toBoolean(value?: string): boolean | undefined {
  return value === undefined ? undefined : value === 'true';
}

@Controller('tasks')
@UseGuards(JwtAuthGuard)
export class TaskController {
  constructor(private readonly taskService: TaskService) {}

  @Post()
  create(@CurrentUser() user: UserEntity, @Body() dto: CreateTaskDto) {
    return this.taskService.create(user.id, dto);
  }

  @Get('me')
  listMine(@CurrentUser() user: UserEntity, @Query() query: ListTasksQueryDto) {
    return this.taskService.listMine(user.id, {
      done: toBoolean(query.done),
      starred: toBoolean(query.starred),
      scope: query.scope,
    });
  }

  @Get(':id')
  getDetail(@CurrentUser() user: UserEntity, @Param('id') id: string) {
    return this.taskService.getDetail(user.id, id);
  }

  @Get(':id/activity')
  listActivity(@CurrentUser() user: UserEntity, @Param('id') id: string) {
    return this.taskService.listActivity(user.id, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: UserEntity,
    @Param('id') id: string,
    @Body() dto: UpdateTaskDto,
  ) {
    return this.taskService.update(user.id, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: UserEntity, @Param('id') id: string) {
    return this.taskService.remove(user.id, id);
  }

  @Post(':id/restore')
  restore(@CurrentUser() user: UserEntity, @Param('id') id: string) {
    return this.taskService.restore(user.id, id);
  }

  @Post(':id/star')
  star(@CurrentUser() user: UserEntity, @Param('id') id: string) {
    return this.taskService.star(user.id, id);
  }

  @Delete(':id/star')
  unstar(@CurrentUser() user: UserEntity, @Param('id') id: string) {
    return this.taskService.unstar(user.id, id);
  }

  @Post(':id/watchers')
  addWatcher(
    @CurrentUser() user: UserEntity,
    @Param('id') id: string,
    @Body() dto: AddWatcherDto,
  ) {
    return this.taskService.addWatcher(id, user.id, dto.userId);
  }

  @Get(':id/watchers')
  listWatchers(@CurrentUser() user: UserEntity, @Param('id') id: string) {
    return this.taskService.listWatchers(id, user.id);
  }

  @Delete(':id/watchers/:userId')
  removeWatcher(
    @CurrentUser() user: UserEntity,
    @Param('id') id: string,
    @Param('userId') targetUserId: string,
  ) {
    return this.taskService.removeWatcher(id, user.id, targetUserId);
  }
}

@Controller('workspaces')
@UseGuards(JwtAuthGuard)
export class WorkspaceTasksController {
  constructor(private readonly taskService: TaskService) {}

  @Get(':workspaceId/tasks')
  listByWorkspace(
    @CurrentUser() user: UserEntity,
    @Param('workspaceId') workspaceId: string,
    @Query() query: ListTasksQueryDto,
  ) {
    return this.taskService.listByWorkspace(user.id, workspaceId, {
      done: toBoolean(query.done),
      sprintId: query.sprintId,
    });
  }

  @Get(':workspaceId/tasks/archived')
  listArchived(
    @CurrentUser() user: UserEntity,
    @Param('workspaceId') workspaceId: string,
  ) {
    return this.taskService.listArchived(user.id, workspaceId);
  }
}
