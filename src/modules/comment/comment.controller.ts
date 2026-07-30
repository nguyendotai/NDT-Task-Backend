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
import { CommentService } from './comment.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';

@Controller('comments')
@UseGuards(JwtAuthGuard)
export class CommentController {
  constructor(private readonly commentService: CommentService) {}

  @Patch(':id')
  update(
    @CurrentUser() user: UserEntity,
    @Param('id') id: string,
    @Body() dto: UpdateCommentDto,
  ) {
    return this.commentService.update(id, user.id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: UserEntity, @Param('id') id: string) {
    return this.commentService.remove(id, user.id);
  }
}

@Controller('tasks')
@UseGuards(JwtAuthGuard)
export class TaskCommentsController {
  constructor(private readonly commentService: CommentService) {}

  @Post(':taskId/comments')
  create(
    @CurrentUser() user: UserEntity,
    @Param('taskId') taskId: string,
    @Body() dto: CreateCommentDto,
  ) {
    return this.commentService.create(taskId, user.id, dto);
  }

  @Get(':taskId/comments')
  listByTask(@CurrentUser() user: UserEntity, @Param('taskId') taskId: string) {
    return this.commentService.listByTask(taskId, user.id);
  }
}
