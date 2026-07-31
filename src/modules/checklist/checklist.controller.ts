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
import { ChecklistService } from './checklist.service';
import { CreateChecklistItemDto } from './dto/create-checklist-item.dto';
import { UpdateChecklistItemDto } from './dto/update-checklist-item.dto';
import { ReorderChecklistDto } from './dto/reorder-checklist.dto';

@Controller('checklists')
@UseGuards(JwtAuthGuard)
export class ChecklistController {
  constructor(private readonly checklistService: ChecklistService) {}

  @Patch(':id')
  update(
    @CurrentUser() user: UserEntity,
    @Param('id') id: string,
    @Body() dto: UpdateChecklistItemDto,
  ) {
    return this.checklistService.update(id, user.id, dto);
  }

  @Patch(':id/complete')
  complete(@CurrentUser() user: UserEntity, @Param('id') id: string) {
    return this.checklistService.complete(id, user.id);
  }

  @Patch(':id/reopen')
  reopen(@CurrentUser() user: UserEntity, @Param('id') id: string) {
    return this.checklistService.reopen(id, user.id);
  }

  @Delete(':id')
  remove(@CurrentUser() user: UserEntity, @Param('id') id: string) {
    return this.checklistService.remove(id, user.id);
  }
}

@Controller('tasks')
@UseGuards(JwtAuthGuard)
export class TaskChecklistsController {
  constructor(private readonly checklistService: ChecklistService) {}

  @Post(':taskId/checklists')
  create(
    @CurrentUser() user: UserEntity,
    @Param('taskId') taskId: string,
    @Body() dto: CreateChecklistItemDto,
  ) {
    return this.checklistService.create(taskId, user.id, dto);
  }

  @Get(':taskId/checklists')
  listByTask(@CurrentUser() user: UserEntity, @Param('taskId') taskId: string) {
    return this.checklistService.listByTask(taskId, user.id);
  }

  @Patch(':taskId/checklists/reorder')
  reorder(
    @CurrentUser() user: UserEntity,
    @Param('taskId') taskId: string,
    @Body() dto: ReorderChecklistDto,
  ) {
    return this.checklistService.reorder(
      taskId,
      user.id,
      dto.orderedChecklistIds,
    );
  }
}
