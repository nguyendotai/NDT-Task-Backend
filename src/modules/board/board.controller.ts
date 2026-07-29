import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserEntity } from '../user/entities/user.entity';
import { BoardService } from './board.service';

@Controller('workspaces')
@UseGuards(JwtAuthGuard)
export class BoardController {
  constructor(private readonly boardService: BoardService) {}

  @Get(':workspaceId/board')
  getByWorkspace(
    @CurrentUser() user: UserEntity,
    @Param('workspaceId') workspaceId: string,
  ) {
    return this.boardService.getByWorkspaceId(workspaceId, user.id);
  }
}
