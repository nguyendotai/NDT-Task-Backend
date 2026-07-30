import {
  Body,
  Controller,
  Delete,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserEntity } from '../user/entities/user.entity';
import { ColumnService } from './column.service';
import { CreateColumnDto } from './dto/create-column.dto';
import { UpdateColumnDto } from './dto/update-column.dto';
import { ReorderColumnsDto } from './dto/reorder-columns.dto';

@Controller('columns')
@UseGuards(JwtAuthGuard)
export class ColumnController {
  constructor(private readonly columnService: ColumnService) {}

  @Patch(':id')
  update(
    @CurrentUser() user: UserEntity,
    @Param('id') id: string,
    @Body() dto: UpdateColumnDto,
  ) {
    return this.columnService.update(id, user.id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: UserEntity, @Param('id') id: string) {
    return this.columnService.remove(id, user.id);
  }
}

@Controller('workspaces')
@UseGuards(JwtAuthGuard)
export class WorkspaceColumnsController {
  constructor(private readonly columnService: ColumnService) {}

  @Post(':workspaceId/columns')
  create(
    @CurrentUser() user: UserEntity,
    @Param('workspaceId') workspaceId: string,
    @Body() dto: CreateColumnDto,
  ) {
    return this.columnService.create(workspaceId, user.id, dto);
  }

  @Patch(':workspaceId/columns/reorder')
  reorder(
    @CurrentUser() user: UserEntity,
    @Param('workspaceId') workspaceId: string,
    @Body() dto: ReorderColumnsDto,
  ) {
    return this.columnService.reorder(workspaceId, user.id, dto);
  }
}
