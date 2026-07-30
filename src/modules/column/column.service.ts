import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { WorkspaceRole } from '@prisma/client';
import { ColumnRepository } from './column.repository';
import { WorkspaceService } from '../workspace/workspace.service';
import { ActivityLogService } from '../activity/activity-log.service';
import { CreateColumnDto } from './dto/create-column.dto';
import { UpdateColumnDto } from './dto/update-column.dto';
import { ReorderColumnsDto } from './dto/reorder-columns.dto';
import { ColumnEntity } from './entities/column.entity';

// column.md #4.4: "không vi phạm quy tắc tối thiểu số lượng Column" — chọn
// tối thiểu 1 Column/Board (không cho xóa Column cuối cùng).
const MIN_COLUMNS_PER_BOARD = 1;

type ColumnRecord = {
  id: string;
  boardId: string;
  name: string;
  order: number;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class ColumnService {
  constructor(
    private readonly columnRepository: ColumnRepository,
    private readonly workspaceService: WorkspaceService,
    private readonly activityLogService: ActivityLogService,
  ) {}

  async create(
    workspaceId: string,
    userId: string,
    dto: CreateColumnDto,
  ): Promise<ColumnEntity> {
    await this.workspaceService.assertActiveWorkspace(workspaceId);
    await this.assertManageRole(workspaceId, userId);

    const board = await this.getActiveBoardOrThrow(workspaceId);

    const existing = await this.columnRepository.findActiveByBoardIdAndName(
      board.id,
      dto.name,
    );
    if (existing) {
      throw new ConflictException('Tên Column đã tồn tại trong Board này');
    }

    const order = await this.columnRepository.countActiveColumns(board.id);
    const column = await this.columnRepository.create({
      boardId: board.id,
      name: dto.name,
      order,
    });

    await this.activityLogService.record({
      workspaceId,
      actorId: userId,
      entityType: 'Column',
      entityId: column.id,
      action: 'column.created',
    });

    return this.toEntity(column);
  }

  async update(
    columnId: string,
    userId: string,
    dto: UpdateColumnDto,
  ): Promise<ColumnEntity> {
    const column = await this.getActiveColumnOrThrow(columnId);
    const workspaceId = column.board.workspaceId;
    await this.assertManageRole(workspaceId, userId);

    const existing = await this.columnRepository.findActiveByBoardIdAndName(
      column.boardId,
      dto.name,
    );
    if (existing && existing.id !== columnId) {
      throw new ConflictException('Tên Column đã tồn tại trong Board này');
    }

    const updated = await this.columnRepository.updateName(columnId, dto.name);

    await this.activityLogService.record({
      workspaceId,
      actorId: userId,
      entityType: 'Column',
      entityId: columnId,
      action: 'column.updated',
    });

    return this.toEntity(updated);
  }

  async remove(columnId: string, userId: string): Promise<void> {
    const column = await this.getActiveColumnOrThrow(columnId);
    const workspaceId = column.board.workspaceId;
    await this.assertManageRole(workspaceId, userId);

    const totalColumns = await this.columnRepository.countActiveColumns(
      column.boardId,
    );
    if (totalColumns <= MIN_COLUMNS_PER_BOARD) {
      throw new BadRequestException('Board phải có ít nhất 1 Column');
    }

    const taskCount =
      await this.columnRepository.countActiveTasksInColumn(columnId);
    if (taskCount > 0) {
      throw new BadRequestException(
        'Column còn Task — hãy chuyển hết Task sang Column khác trước khi xóa',
      );
    }

    await this.columnRepository.softDelete(columnId, userId);

    await this.activityLogService.record({
      workspaceId,
      actorId: userId,
      entityType: 'Column',
      entityId: columnId,
      action: 'column.deleted',
    });
  }

  async reorder(
    workspaceId: string,
    userId: string,
    dto: ReorderColumnsDto,
  ): Promise<ColumnEntity[]> {
    await this.workspaceService.assertActiveWorkspace(workspaceId);
    await this.assertManageRole(workspaceId, userId);

    const board = await this.getActiveBoardOrThrow(workspaceId);
    const existingColumns = await this.columnRepository.listActiveByBoardId(
      board.id,
    );
    const existingIds = new Set(existingColumns.map((item) => item.id));
    const inputIds = new Set(dto.orderedColumnIds);

    if (
      existingIds.size !== inputIds.size ||
      dto.orderedColumnIds.some((id) => !existingIds.has(id))
    ) {
      throw new BadRequestException(
        'Danh sách Column không khớp với Board hiện tại',
      );
    }

    const reordered = await this.columnRepository.reorder(dto.orderedColumnIds);

    await this.activityLogService.record({
      workspaceId,
      actorId: userId,
      entityType: 'Column',
      entityId: board.id,
      action: 'column.moved',
    });

    return reordered.map((column) => this.toEntity(column));
  }

  private async getActiveBoardOrThrow(workspaceId: string) {
    const board =
      await this.columnRepository.findActiveBoardByWorkspaceId(workspaceId);
    if (!board) {
      throw new NotFoundException('Không tìm thấy Board của Workspace này');
    }
    return board;
  }

  private async getActiveColumnOrThrow(columnId: string) {
    const column = await this.columnRepository.findActiveWithBoard(columnId);
    if (!column) {
      throw new NotFoundException('Không tìm thấy Column');
    }
    return column;
  }

  private async assertManageRole(workspaceId: string, userId: string) {
    const member = await this.workspaceService.assertMembership(
      workspaceId,
      userId,
    );
    if (
      member.role !== WorkspaceRole.OWNER &&
      member.role !== WorkspaceRole.ADMIN
    ) {
      throw new ForbiddenException('Chỉ Owner/Admin được quản lý Column');
    }
  }

  private toEntity(column: ColumnRecord): ColumnEntity {
    return {
      id: column.id,
      boardId: column.boardId,
      name: column.name,
      order: column.order,
      createdAt: column.createdAt,
      updatedAt: column.updatedAt,
    };
  }
}
