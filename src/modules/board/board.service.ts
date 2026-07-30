import { Injectable, NotFoundException } from '@nestjs/common';
import { BoardRepository } from './board.repository';
import { WorkspaceService } from '../workspace/workspace.service';

@Injectable()
export class BoardService {
  constructor(
    private readonly boardRepository: BoardRepository,
    private readonly workspaceService: WorkspaceService,
  ) {}

  async getByWorkspaceId(workspaceId: string, userId: string) {
    await this.workspaceService.assertActiveWorkspace(workspaceId);
    await this.workspaceService.assertMembership(workspaceId, userId);

    const board =
      await this.boardRepository.findActiveByWorkspaceId(workspaceId);
    if (!board) {
      throw new NotFoundException('Không tìm thấy Board của Workspace này');
    }

    return {
      id: board.id,
      workspaceId: board.workspaceId,
      name: board.name,
      createdAt: board.createdAt,
      updatedAt: board.updatedAt,
      columns: board.columns.map((column) => ({
        id: column.id,
        boardId: column.boardId,
        name: column.name,
        order: column.order,
        mappedStatus: column.mappedStatus,
      })),
    };
  }
}
