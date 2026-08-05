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
import { DocsService } from './docs.service';
import { CreateDocDto } from './dto/create-doc.dto';
import { UpdateDocDto } from './dto/update-doc.dto';

@Controller('docs')
@UseGuards(JwtAuthGuard)
export class DocsController {
  constructor(private readonly docsService: DocsService) {}

  @Get(':id')
  getDetail(@CurrentUser() user: UserEntity, @Param('id') id: string) {
    return this.docsService.getDetail(id, user.id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: UserEntity,
    @Param('id') id: string,
    @Body() dto: UpdateDocDto,
  ) {
    return this.docsService.update(id, user.id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: UserEntity, @Param('id') id: string) {
    return this.docsService.remove(id, user.id);
  }
}

@Controller('workspaces')
@UseGuards(JwtAuthGuard)
export class WorkspaceDocsController {
  constructor(private readonly docsService: DocsService) {}

  @Post(':workspaceId/docs')
  create(
    @CurrentUser() user: UserEntity,
    @Param('workspaceId') workspaceId: string,
    @Body() dto: CreateDocDto,
  ) {
    return this.docsService.create(workspaceId, user.id, dto);
  }

  @Get(':workspaceId/docs')
  listByWorkspace(
    @CurrentUser() user: UserEntity,
    @Param('workspaceId') workspaceId: string,
  ) {
    return this.docsService.listByWorkspace(workspaceId, user.id);
  }
}
