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
import { LabelService } from './label.service';
import { CreateLabelDto } from './dto/create-label.dto';
import { UpdateLabelDto } from './dto/update-label.dto';

@Controller('labels')
@UseGuards(JwtAuthGuard)
export class LabelController {
  constructor(private readonly labelService: LabelService) {}

  @Patch(':id')
  update(
    @CurrentUser() user: UserEntity,
    @Param('id') id: string,
    @Body() dto: UpdateLabelDto,
  ) {
    return this.labelService.update(id, user.id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: UserEntity, @Param('id') id: string) {
    return this.labelService.remove(id, user.id);
  }
}

@Controller('tasks')
@UseGuards(JwtAuthGuard)
export class TaskLabelsController {
  constructor(private readonly labelService: LabelService) {}

  @Post(':taskId/labels')
  create(
    @CurrentUser() user: UserEntity,
    @Param('taskId') taskId: string,
    @Body() dto: CreateLabelDto,
  ) {
    return this.labelService.create(taskId, user.id, dto);
  }

  @Get(':taskId/labels')
  listByTask(@CurrentUser() user: UserEntity, @Param('taskId') taskId: string) {
    return this.labelService.listByTask(taskId, user.id);
  }
}
