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
import { SprintService } from './sprint.service';
import { CreateSprintDto } from './dto/create-sprint.dto';
import { UpdateSprintDto } from './dto/update-sprint.dto';
import { AddSprintTaskDto } from './dto/add-sprint-task.dto';

@Controller('sprints')
@UseGuards(JwtAuthGuard)
export class SprintController {
  constructor(private readonly sprintService: SprintService) {}

  @Get(':id')
  getDetail(@CurrentUser() user: UserEntity, @Param('id') id: string) {
    return this.sprintService.getDetail(id, user.id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: UserEntity,
    @Param('id') id: string,
    @Body() dto: UpdateSprintDto,
  ) {
    return this.sprintService.update(id, user.id, dto);
  }

  @Post(':id/start')
  start(@CurrentUser() user: UserEntity, @Param('id') id: string) {
    return this.sprintService.start(id, user.id);
  }

  @Post(':id/complete')
  complete(@CurrentUser() user: UserEntity, @Param('id') id: string) {
    return this.sprintService.complete(id, user.id);
  }

  @Post(':id/tasks')
  addTask(
    @CurrentUser() user: UserEntity,
    @Param('id') id: string,
    @Body() dto: AddSprintTaskDto,
  ) {
    return this.sprintService.addTask(id, dto.taskId, user.id);
  }

  @Delete(':id/tasks/:taskId')
  removeTask(
    @CurrentUser() user: UserEntity,
    @Param('id') id: string,
    @Param('taskId') taskId: string,
  ) {
    return this.sprintService.removeTask(id, taskId, user.id);
  }
}

@Controller('workspaces')
@UseGuards(JwtAuthGuard)
export class WorkspaceSprintsController {
  constructor(private readonly sprintService: SprintService) {}

  @Post(':workspaceId/sprints')
  create(
    @CurrentUser() user: UserEntity,
    @Param('workspaceId') workspaceId: string,
    @Body() dto: CreateSprintDto,
  ) {
    return this.sprintService.create(workspaceId, user.id, dto);
  }

  @Get(':workspaceId/sprints')
  listByWorkspace(
    @CurrentUser() user: UserEntity,
    @Param('workspaceId') workspaceId: string,
  ) {
    return this.sprintService.listByWorkspace(workspaceId, user.id);
  }
}
