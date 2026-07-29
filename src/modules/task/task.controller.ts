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
    return this.taskService.listByWorkspace(
      user.id,
      workspaceId,
      toBoolean(query.done),
    );
  }

  @Get(':workspaceId/tasks/archived')
  listArchived(
    @CurrentUser() user: UserEntity,
    @Param('workspaceId') workspaceId: string,
  ) {
    return this.taskService.listArchived(user.id, workspaceId);
  }
}
