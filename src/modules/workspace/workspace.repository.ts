import { randomInt } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import {
  InvitationStatus,
  WorkspaceRole,
  WorkspaceType,
  WorkspaceVisibility,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

const DEFAULT_BOARD_NAME = 'Main Board';
const DEFAULT_COLUMN_NAMES = ['To Do', 'In Progress', 'Done'];

// Bỏ ký tự dễ nhầm lẫn (0/O, 1/I).
const SHORT_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const SHORT_CODE_LENGTH = 6;

@Injectable()
export class WorkspaceRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------------
  // Workspace
  // ---------------------------------------------------------------------

  async createWithDefaults(data: {
    name: string;
    type: WorkspaceType;
    description?: string;
    ownerId: string;
    avatarEmoji: string;
    avatarColor: string;
  }) {
    const shortCode = await this.generateUniqueShortCode();

    return this.prisma.$transaction(async (tx) => {
      const workspace = await tx.workspace.create({
        data: {
          name: data.name,
          type: data.type,
          description: data.description,
          ownerId: data.ownerId,
          shortCode,
          avatarEmoji: data.avatarEmoji,
          avatarColor: data.avatarColor,
          deletedAt: null,
          deletedBy: null,
        },
      });

      await tx.workspaceMember.create({
        data: {
          workspaceId: workspace.id,
          userId: data.ownerId,
          role: WorkspaceRole.OWNER,
          invitedBy: null,
          deletedAt: null,
          deletedBy: null,
        },
      });

      const board = await tx.board.create({
        data: {
          workspaceId: workspace.id,
          name: DEFAULT_BOARD_NAME,
          deletedAt: null,
          deletedBy: null,
        },
      });

      await tx.column.createMany({
        data: DEFAULT_COLUMN_NAMES.map((name, index) => ({
          boardId: board.id,
          name,
          order: index,
          deletedAt: null,
          deletedBy: null,
        })),
      });

      return workspace;
    });
  }

  private async generateUniqueShortCode(): Promise<string> {
    for (;;) {
      let code = '';
      for (let i = 0; i < SHORT_CODE_LENGTH; i++) {
        code += SHORT_CODE_ALPHABET[randomInt(SHORT_CODE_ALPHABET.length)];
      }
      const existing = await this.prisma.workspace.findFirst({
        where: { shortCode: code },
        select: { id: true },
      });
      if (!existing) return code;
    }
  }

  findActiveById(id: string) {
    return this.prisma.workspace.findFirst({ where: { id, deletedAt: null } });
  }

  findDeletedById(id: string) {
    return this.prisma.workspace.findFirst({
      where: { id, NOT: { deletedAt: null } },
    });
  }

  listArchivedForOwner(ownerId: string) {
    return this.prisma.workspace.findMany({
      where: { ownerId, NOT: { deletedAt: null } },
      orderBy: { deletedAt: 'desc' },
    });
  }

  countActiveMembers(workspaceId: string) {
    return this.prisma.workspaceMember.count({
      where: { workspaceId, deletedAt: null },
    });
  }

  /**
   * Đếm Task active theo từng Workspace (qua chuỗi quan hệ Board -> Column ->
   * Task) trong đúng 3 query bất kể số lượng Workspace, tránh N+1 khi liệt kê
   * nhiều Workspace cùng lúc (GET /workspaces).
   */
  async countActiveTasksByWorkspaceIds(
    workspaceIds: string[],
  ): Promise<Record<string, number>> {
    if (workspaceIds.length === 0) return {};

    const boards = await this.prisma.board.findMany({
      where: { workspaceId: { in: workspaceIds }, deletedAt: null },
      select: { id: true, workspaceId: true },
    });
    if (boards.length === 0) return {};
    const boardIdToWorkspaceId = new Map(
      boards.map((board) => [board.id, board.workspaceId]),
    );

    const columns = await this.prisma.column.findMany({
      where: {
        boardId: { in: boards.map((board) => board.id) },
        deletedAt: null,
      },
      select: { id: true, boardId: true },
    });
    if (columns.length === 0) return {};
    const columnIdToBoardId = new Map(
      columns.map((column) => [column.id, column.boardId]),
    );

    const grouped = await this.prisma.task.groupBy({
      by: ['columnId'],
      where: {
        columnId: { in: columns.map((column) => column.id) },
        deletedAt: null,
      },
      _count: { _all: true },
    });

    const counts: Record<string, number> = {};
    for (const group of grouped) {
      const boardId = columnIdToBoardId.get(group.columnId);
      const workspaceId = boardId
        ? boardIdToWorkspaceId.get(boardId)
        : undefined;
      if (!workspaceId) continue;
      counts[workspaceId] = (counts[workspaceId] ?? 0) + group._count._all;
    }
    return counts;
  }

  async listForUser(userId: string, starredOnly?: boolean) {
    const memberships = await this.prisma.workspaceMember.findMany({
      where: {
        userId,
        deletedAt: null,
        ...(starredOnly ? { isStarred: true } : {}),
      },
      include: { workspace: true },
      orderBy: { lastAccessedAt: 'desc' },
    });
    return memberships
      .filter((membership) => membership.workspace.deletedAt === null)
      .map((membership) => ({
        workspace: membership.workspace,
        role: membership.role,
        isStarred: membership.isStarred,
        lastAccessedAt: membership.lastAccessedAt,
      }));
  }

  touchLastAccessed(memberId: string) {
    return this.prisma.workspaceMember.update({
      where: { id: memberId },
      data: { lastAccessedAt: new Date() },
    });
  }

  updateWorkspace(
    id: string,
    data: {
      name?: string;
      description?: string;
      visibility?: WorkspaceVisibility;
    },
  ) {
    return this.prisma.workspace.update({ where: { id }, data });
  }

  async softDeleteCascade(workspaceId: string, deletedBy: string) {
    const board = await this.prisma.board.findFirst({
      where: { workspaceId, deletedAt: null },
    });
    const deletedAt = new Date();

    await this.prisma.$transaction([
      this.prisma.workspace.update({
        where: { id: workspaceId },
        data: { deletedAt, deletedBy },
      }),
      this.prisma.workspaceMember.updateMany({
        where: { workspaceId, deletedAt: null },
        data: { deletedAt, deletedBy },
      }),
      this.prisma.workspaceInvitation.updateMany({
        where: { workspaceId, deletedAt: null },
        data: { deletedAt, deletedBy },
      }),
      ...(board
        ? [
            this.prisma.board.update({
              where: { id: board.id },
              data: { deletedAt, deletedBy },
            }),
            this.prisma.column.updateMany({
              where: { boardId: board.id, deletedAt: null },
              data: { deletedAt, deletedBy },
            }),
          ]
        : []),
    ]);
  }

  /** Đối xứng với softDeleteCascade — khôi phục đúng các entity đã bị cascade xóa. */
  async restoreCascade(workspaceId: string) {
    const board = await this.prisma.board.findFirst({
      where: { workspaceId },
    });

    const [workspace] = await this.prisma.$transaction([
      this.prisma.workspace.update({
        where: { id: workspaceId },
        data: { deletedAt: null, deletedBy: null },
      }),
      this.prisma.workspaceMember.updateMany({
        where: { workspaceId, NOT: { deletedAt: null } },
        data: { deletedAt: null, deletedBy: null },
      }),
      this.prisma.workspaceInvitation.updateMany({
        where: { workspaceId, NOT: { deletedAt: null } },
        data: { deletedAt: null, deletedBy: null },
      }),
      ...(board
        ? [
            this.prisma.board.update({
              where: { id: board.id },
              data: { deletedAt: null, deletedBy: null },
            }),
            this.prisma.column.updateMany({
              where: { boardId: board.id, NOT: { deletedAt: null } },
              data: { deletedAt: null, deletedBy: null },
            }),
          ]
        : []),
    ]);

    return workspace;
  }

  // ---------------------------------------------------------------------
  // Member
  // ---------------------------------------------------------------------

  findActiveMemberByUserId(workspaceId: string, userId: string) {
    return this.prisma.workspaceMember.findFirst({
      where: { workspaceId, userId, deletedAt: null },
    });
  }

  findActiveMemberById(workspaceId: string, memberId: string) {
    return this.prisma.workspaceMember.findFirst({
      where: { id: memberId, workspaceId, deletedAt: null },
    });
  }

  listActiveMembers(workspaceId: string) {
    return this.prisma.workspaceMember.findMany({
      where: { workspaceId, deletedAt: null },
      include: {
        user: {
          select: { id: true, name: true, email: true, avatarUrl: true },
        },
      },
      orderBy: { joinedAt: 'asc' },
    });
  }

  createMember(data: {
    workspaceId: string;
    userId: string;
    role: WorkspaceRole;
    invitedBy?: string;
  }) {
    return this.prisma.workspaceMember.create({
      data: {
        workspaceId: data.workspaceId,
        userId: data.userId,
        role: data.role,
        invitedBy: data.invitedBy ?? null,
        deletedAt: null,
        deletedBy: null,
      },
    });
  }

  updateMemberRole(memberId: string, role: WorkspaceRole) {
    return this.prisma.workspaceMember.update({
      where: { id: memberId },
      data: { role },
    });
  }

  softDeleteMember(memberId: string, deletedBy: string) {
    return this.prisma.workspaceMember.update({
      where: { id: memberId },
      data: { deletedAt: new Date(), deletedBy },
    });
  }

  setMemberStarred(memberId: string, isStarred: boolean) {
    return this.prisma.workspaceMember.update({
      where: { id: memberId },
      data: { isStarred },
    });
  }

  transferOwnership(data: {
    workspaceId: string;
    currentOwnerMemberId: string;
    newOwnerMemberId: string;
    newOwnerId: string;
  }) {
    return this.prisma.$transaction([
      this.prisma.workspace.update({
        where: { id: data.workspaceId },
        data: { ownerId: data.newOwnerId },
      }),
      this.prisma.workspaceMember.update({
        where: { id: data.currentOwnerMemberId },
        data: { role: WorkspaceRole.ADMIN },
      }),
      this.prisma.workspaceMember.update({
        where: { id: data.newOwnerMemberId },
        data: { role: WorkspaceRole.OWNER },
      }),
    ]);
  }

  // ---------------------------------------------------------------------
  // Invitation
  // ---------------------------------------------------------------------

  findPendingInvitationByEmail(workspaceId: string, email: string) {
    return this.prisma.workspaceInvitation.findFirst({
      where: {
        workspaceId,
        email,
        status: InvitationStatus.PENDING,
        deletedAt: null,
      },
    });
  }

  createInvitation(data: {
    workspaceId: string;
    email: string;
    role: WorkspaceRole;
    token: string;
    invitedBy: string;
    expiresAt: Date;
  }) {
    return this.prisma.workspaceInvitation.create({
      data: {
        ...data,
        status: InvitationStatus.PENDING,
        deletedAt: null,
        deletedBy: null,
      },
    });
  }

  findInvitationByToken(token: string) {
    return this.prisma.workspaceInvitation.findFirst({
      where: { token, deletedAt: null },
    });
  }

  findActiveInvitationById(workspaceId: string, invitationId: string) {
    return this.prisma.workspaceInvitation.findFirst({
      where: { id: invitationId, workspaceId, deletedAt: null },
    });
  }

  listPendingInvitations(workspaceId: string) {
    return this.prisma.workspaceInvitation.findMany({
      where: {
        workspaceId,
        status: InvitationStatus.PENDING,
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  updateInvitationStatus(id: string, status: InvitationStatus) {
    return this.prisma.workspaceInvitation.update({
      where: { id },
      data: { status },
    });
  }

  revokeInvitation(id: string, deletedBy: string) {
    return this.prisma.workspaceInvitation.update({
      where: { id },
      data: {
        status: InvitationStatus.REVOKED,
        deletedAt: new Date(),
        deletedBy,
      },
    });
  }
}
