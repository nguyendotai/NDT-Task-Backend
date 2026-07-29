import { Injectable } from '@nestjs/common';
import { InvitationStatus, WorkspaceRole, WorkspaceType } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

const DEFAULT_BOARD_NAME = 'Main Board';
const DEFAULT_COLUMN_NAMES = ['To Do', 'In Progress', 'Done'];

@Injectable()
export class WorkspaceRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------------
  // Workspace
  // ---------------------------------------------------------------------

  createWithDefaults(data: {
    name: string;
    type: WorkspaceType;
    description?: string;
    ownerId: string;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const workspace = await tx.workspace.create({
        data: {
          name: data.name,
          type: data.type,
          description: data.description,
          ownerId: data.ownerId,
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

  findActiveById(id: string) {
    return this.prisma.workspace.findFirst({ where: { id, deletedAt: null } });
  }

  countActiveMembers(workspaceId: string) {
    return this.prisma.workspaceMember.count({
      where: { workspaceId, deletedAt: null },
    });
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

  updateWorkspace(id: string, data: { name?: string; description?: string }) {
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
