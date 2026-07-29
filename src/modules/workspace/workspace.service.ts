import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  InvitationStatus,
  NotificationType,
  WorkspaceRole,
} from '@prisma/client';
import ms from 'ms';
import { WorkspaceRepository } from './workspace.repository';
import { ActivityLogService } from '../activity/activity-log.service';
import { NotificationService } from '../notification/notification.service';
import { MailQueueService } from '../../config/mail-queue.service';
import { UserService } from '../user/user.service';
import { UserEntity } from '../user/entities/user.entity';
import { withTimeout } from '../../common/utils/with-timeout.util';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { UpdateWorkspaceDto } from './dto/update-workspace.dto';
import { InviteMemberDto } from './dto/invite-member.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';
import { TransferOwnerDto } from './dto/transfer-owner.dto';
import { WorkspaceEntity } from './entities/workspace.entity';
import { WorkspaceMemberEntity } from './entities/workspace-member.entity';
import { WorkspaceInvitationEntity } from './entities/workspace-invitation.entity';

const INVITATION_TTL_MS = ms('7d');
const ENQUEUE_TIMEOUT_MS = 3000;

type WorkspaceRecord = NonNullable<
  Awaited<ReturnType<WorkspaceRepository['findActiveById']>>
>;
type MemberRecord = NonNullable<
  Awaited<ReturnType<WorkspaceRepository['findActiveMemberByUserId']>>
>;
type InvitationRecord = NonNullable<
  Awaited<ReturnType<WorkspaceRepository['findInvitationByToken']>>
>;

@Injectable()
export class WorkspaceService {
  private readonly logger = new Logger(WorkspaceService.name);

  constructor(
    private readonly workspaceRepository: WorkspaceRepository,
    private readonly userService: UserService,
    private readonly activityLogService: ActivityLogService,
    private readonly notificationService: NotificationService,
    private readonly mailQueueService: MailQueueService,
    private readonly configService: ConfigService,
  ) {}

  // ---------------------------------------------------------------------
  // Workspace
  // ---------------------------------------------------------------------

  async create(
    ownerId: string,
    dto: CreateWorkspaceDto,
  ): Promise<WorkspaceEntity> {
    const workspace = await this.workspaceRepository.createWithDefaults({
      name: dto.name,
      type: dto.type,
      description: dto.description,
      ownerId,
    });

    await this.activityLogService.record({
      workspaceId: workspace.id,
      actorId: ownerId,
      entityType: 'Workspace',
      entityId: workspace.id,
      action: 'workspace.created',
    });

    return this.toWorkspaceEntity(workspace);
  }

  async listMine(
    userId: string,
    starredOnly?: boolean,
  ): Promise<
    (WorkspaceEntity & { myRole: WorkspaceRole; isStarred: boolean })[]
  > {
    const memberships = await this.workspaceRepository.listForUser(
      userId,
      starredOnly,
    );
    return memberships.map(({ workspace, role, isStarred }) => ({
      ...this.toWorkspaceEntity(workspace),
      myRole: role,
      isStarred,
    }));
  }

  async star(workspaceId: string, userId: string): Promise<void> {
    await this.getActiveWorkspaceOrThrow(workspaceId);
    const member = await this.assertMember(workspaceId, userId);
    await this.workspaceRepository.setMemberStarred(member.id, true);
  }

  async unstar(workspaceId: string, userId: string): Promise<void> {
    await this.getActiveWorkspaceOrThrow(workspaceId);
    const member = await this.assertMember(workspaceId, userId);
    await this.workspaceRepository.setMemberStarred(member.id, false);
  }

  /**
   * Public wrapper cho các module domain khác (Board/Task/Sprint...) tái sử
   * dụng để xác thực Workspace tồn tại mà không phải tự query Prisma.
   */
  async assertActiveWorkspace(workspaceId: string): Promise<WorkspaceEntity> {
    const workspace = await this.getActiveWorkspaceOrThrow(workspaceId);
    return this.toWorkspaceEntity(workspace);
  }

  /** Public wrapper: throw 403 nếu user không phải Member Active của Workspace. */
  async assertMembership(
    workspaceId: string,
    userId: string,
  ): Promise<WorkspaceMemberEntity> {
    const member = await this.assertMember(workspaceId, userId);
    return this.toMemberEntity(member);
  }

  /** Không throw — dùng để validate 1 user BẤT KỲ (vd. assigneeId) có phải Member Active hay không. */
  async findMembership(
    workspaceId: string,
    userId: string,
  ): Promise<WorkspaceMemberEntity | null> {
    const member = await this.workspaceRepository.findActiveMemberByUserId(
      workspaceId,
      userId,
    );
    return member ? this.toMemberEntity(member) : null;
  }

  async getDetail(
    workspaceId: string,
    userId: string,
  ): Promise<WorkspaceEntity & { membersCount: number }> {
    const workspace = await this.getActiveWorkspaceOrThrow(workspaceId);
    await this.assertMember(workspaceId, userId);

    const membersCount =
      await this.workspaceRepository.countActiveMembers(workspaceId);

    return { ...this.toWorkspaceEntity(workspace), membersCount };
  }

  async update(
    workspaceId: string,
    userId: string,
    dto: UpdateWorkspaceDto,
  ): Promise<WorkspaceEntity> {
    await this.getActiveWorkspaceOrThrow(workspaceId);
    await this.assertRole(workspaceId, userId, [WorkspaceRole.OWNER]);

    const updated = await this.workspaceRepository.updateWorkspace(
      workspaceId,
      { name: dto.name, description: dto.description },
    );

    await this.activityLogService.record({
      workspaceId,
      actorId: userId,
      entityType: 'Workspace',
      entityId: workspaceId,
      action: 'workspace.updated',
    });

    return this.toWorkspaceEntity(updated);
  }

  async remove(workspaceId: string, userId: string): Promise<void> {
    await this.getActiveWorkspaceOrThrow(workspaceId);
    await this.assertRole(workspaceId, userId, [WorkspaceRole.OWNER]);

    await this.workspaceRepository.softDeleteCascade(workspaceId, userId);

    await this.activityLogService.record({
      workspaceId,
      actorId: userId,
      entityType: 'Workspace',
      entityId: workspaceId,
      action: 'workspace.deleted',
    });
  }

  async transferOwner(
    workspaceId: string,
    userId: string,
    dto: TransferOwnerDto,
  ): Promise<void> {
    await this.getActiveWorkspaceOrThrow(workspaceId);
    const currentOwnerMember = await this.assertRole(workspaceId, userId, [
      WorkspaceRole.OWNER,
    ]);

    if (dto.newOwnerId === userId) {
      throw new BadRequestException('Bạn đã là Owner của Workspace này');
    }

    const newOwnerMember =
      await this.workspaceRepository.findActiveMemberByUserId(
        workspaceId,
        dto.newOwnerId,
      );
    if (!newOwnerMember) {
      throw new BadRequestException(
        'Người được chuyển quyền phải là thành viên của Workspace',
      );
    }

    await this.workspaceRepository.transferOwnership({
      workspaceId,
      currentOwnerMemberId: currentOwnerMember.id,
      newOwnerMemberId: newOwnerMember.id,
      newOwnerId: dto.newOwnerId,
    });

    await this.activityLogService.record({
      workspaceId,
      actorId: userId,
      entityType: 'Workspace',
      entityId: workspaceId,
      action: 'workspace.owner_changed',
      metadata: { previousOwnerId: userId, newOwnerId: dto.newOwnerId },
    });
  }

  async leave(workspaceId: string, userId: string): Promise<void> {
    await this.getActiveWorkspaceOrThrow(workspaceId);
    const member = await this.assertMember(workspaceId, userId);

    if (member.role === WorkspaceRole.OWNER) {
      throw new ForbiddenException(
        'Owner phải chuyển quyền trước khi rời Workspace',
      );
    }

    await this.workspaceRepository.softDeleteMember(member.id, userId);

    await this.activityLogService.record({
      workspaceId,
      actorId: userId,
      entityType: 'Member',
      entityId: member.id,
      action: 'member.left',
    });
  }

  // ---------------------------------------------------------------------
  // Member
  // ---------------------------------------------------------------------

  async listMembers(workspaceId: string, userId: string) {
    await this.getActiveWorkspaceOrThrow(workspaceId);
    await this.assertMember(workspaceId, userId);

    const members =
      await this.workspaceRepository.listActiveMembers(workspaceId);
    return members.map((member) => ({
      id: member.id,
      workspaceId: member.workspaceId,
      role: member.role,
      joinedAt: member.joinedAt,
      user: {
        id: member.user.id,
        name: member.user.name,
        email: member.user.email,
        avatarUrl: member.user.avatarUrl,
      },
    }));
  }

  async inviteMember(
    workspaceId: string,
    actorId: string,
    dto: InviteMemberDto,
  ): Promise<WorkspaceInvitationEntity> {
    const workspace = await this.getActiveWorkspaceOrThrow(workspaceId);
    await this.assertRole(workspaceId, actorId, [
      WorkspaceRole.OWNER,
      WorkspaceRole.ADMIN,
    ]);

    if (dto.role === WorkspaceRole.OWNER) {
      throw new BadRequestException(
        'Không thể mời thành viên với vai trò Owner',
      );
    }

    const email = dto.email.toLowerCase();
    const actor = await this.userService.getProfile(actorId);
    if (email === actor.email.toLowerCase()) {
      throw new BadRequestException('Không thể mời chính mình');
    }

    const existingUser = await this.userService.findByEmail(email);
    if (existingUser) {
      const existingMember =
        await this.workspaceRepository.findActiveMemberByUserId(
          workspaceId,
          existingUser.id,
        );
      if (existingMember) {
        throw new ConflictException(
          'Người dùng đã là thành viên của Workspace',
        );
      }
    }

    const pendingInvitation =
      await this.workspaceRepository.findPendingInvitationByEmail(
        workspaceId,
        email,
      );
    if (pendingInvitation) {
      throw new ConflictException('Đã có lời mời đang chờ xử lý cho email này');
    }

    const token = randomBytes(32).toString('hex');
    const invitation = await this.workspaceRepository.createInvitation({
      workspaceId,
      email,
      role: dto.role,
      token,
      invitedBy: actorId,
      expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
    });

    await this.activityLogService.record({
      workspaceId,
      actorId,
      entityType: 'Member',
      entityId: invitation.id,
      action: 'member.invited',
      metadata: { email, role: dto.role },
    });

    if (existingUser) {
      await this.notificationService.notify({
        workspaceId,
        recipientId: existingUser.id,
        type: NotificationType.WORKSPACE_INVITATION,
        title: 'Lời mời tham gia Workspace',
        message: `Bạn được mời tham gia Workspace "${workspace.name}"`,
        metadata: { invitationId: invitation.id },
      });
    }

    await this.sendInvitationEmail(email, workspace.name, token);

    return this.toInvitationEntity(invitation);
  }

  async listInvitations(workspaceId: string, actorId: string) {
    await this.getActiveWorkspaceOrThrow(workspaceId);
    await this.assertRole(workspaceId, actorId, [
      WorkspaceRole.OWNER,
      WorkspaceRole.ADMIN,
    ]);

    const invitations =
      await this.workspaceRepository.listPendingInvitations(workspaceId);
    return invitations.map((invitation) => this.toInvitationEntity(invitation));
  }

  async revokeInvitation(
    workspaceId: string,
    actorId: string,
    invitationId: string,
  ): Promise<void> {
    await this.getActiveWorkspaceOrThrow(workspaceId);
    await this.assertRole(workspaceId, actorId, [
      WorkspaceRole.OWNER,
      WorkspaceRole.ADMIN,
    ]);

    const invitation = await this.workspaceRepository.findActiveInvitationById(
      workspaceId,
      invitationId,
    );
    if (!invitation || invitation.status !== InvitationStatus.PENDING) {
      throw new NotFoundException('Không tìm thấy lời mời đang chờ xử lý');
    }

    await this.workspaceRepository.revokeInvitation(invitationId, actorId);

    await this.activityLogService.record({
      workspaceId,
      actorId,
      entityType: 'Member',
      entityId: invitationId,
      action: 'member.invitation_revoked',
    });
  }

  async acceptInvitation(
    token: string,
    currentUser: UserEntity,
  ): Promise<WorkspaceMemberEntity> {
    const invitation =
      await this.workspaceRepository.findInvitationByToken(token);
    this.assertUsableInvitation(invitation, currentUser);

    const workspace = await this.getActiveWorkspaceOrThrow(
      invitation.workspaceId,
    );

    const existingMember =
      await this.workspaceRepository.findActiveMemberByUserId(
        workspace.id,
        currentUser.id,
      );
    if (existingMember) {
      throw new ConflictException('Bạn đã là thành viên của Workspace này');
    }

    const member = await this.workspaceRepository.createMember({
      workspaceId: workspace.id,
      userId: currentUser.id,
      role: invitation.role,
      invitedBy: invitation.invitedBy,
    });

    await this.workspaceRepository.updateInvitationStatus(
      invitation.id,
      InvitationStatus.ACCEPTED,
    );

    await this.activityLogService.record({
      workspaceId: workspace.id,
      actorId: currentUser.id,
      entityType: 'Member',
      entityId: member.id,
      action: 'member.joined',
    });

    return this.toMemberEntity(member);
  }

  async rejectInvitation(
    token: string,
    currentUser: UserEntity,
  ): Promise<void> {
    const invitation =
      await this.workspaceRepository.findInvitationByToken(token);
    this.assertUsableInvitation(invitation, currentUser);

    await this.workspaceRepository.updateInvitationStatus(
      invitation.id,
      InvitationStatus.REVOKED,
    );

    await this.activityLogService.record({
      workspaceId: invitation.workspaceId,
      actorId: currentUser.id,
      entityType: 'Member',
      entityId: invitation.id,
      action: 'member.invitation_rejected',
    });
  }

  async updateMemberRole(
    workspaceId: string,
    actorId: string,
    memberId: string,
    dto: UpdateMemberRoleDto,
  ): Promise<WorkspaceMemberEntity> {
    await this.getActiveWorkspaceOrThrow(workspaceId);
    await this.assertRole(workspaceId, actorId, [WorkspaceRole.OWNER]);

    if (dto.role === WorkspaceRole.OWNER) {
      throw new BadRequestException(
        'Dùng chức năng chuyển quyền Owner để đổi Owner',
      );
    }

    const targetMember = await this.workspaceRepository.findActiveMemberById(
      workspaceId,
      memberId,
    );
    if (!targetMember) {
      throw new NotFoundException('Không tìm thấy thành viên');
    }
    if (targetMember.role === WorkspaceRole.OWNER) {
      throw new ForbiddenException('Không thể thay đổi vai trò của Owner');
    }

    const updated = await this.workspaceRepository.updateMemberRole(
      memberId,
      dto.role,
    );

    await this.activityLogService.record({
      workspaceId,
      actorId,
      entityType: 'Member',
      entityId: memberId,
      action: 'member.role_changed',
      metadata: { previousRole: targetMember.role, newRole: dto.role },
    });

    return this.toMemberEntity(updated);
  }

  async removeMember(
    workspaceId: string,
    actorId: string,
    memberId: string,
  ): Promise<void> {
    await this.getActiveWorkspaceOrThrow(workspaceId);
    const actorMember = await this.assertMember(workspaceId, actorId);

    const targetMember = await this.workspaceRepository.findActiveMemberById(
      workspaceId,
      memberId,
    );
    if (!targetMember) {
      throw new NotFoundException('Không tìm thấy thành viên');
    }
    if (targetMember.role === WorkspaceRole.OWNER) {
      throw new ForbiddenException('Không thể xóa Owner khỏi Workspace');
    }
    if (targetMember.userId === actorId) {
      throw new BadRequestException(
        'Không thể tự xóa chính mình, hãy dùng chức năng rời Workspace',
      );
    }
    if (actorMember.role === WorkspaceRole.MEMBER) {
      throw new ForbiddenException('Bạn không có quyền xóa thành viên');
    }
    if (
      actorMember.role === WorkspaceRole.ADMIN &&
      targetMember.role === WorkspaceRole.ADMIN
    ) {
      throw new ForbiddenException('Admin không được xóa Admin khác');
    }

    await this.workspaceRepository.softDeleteMember(memberId, actorId);

    await this.activityLogService.record({
      workspaceId,
      actorId,
      entityType: 'Member',
      entityId: memberId,
      action: 'member.removed',
    });
  }

  // ---------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------

  private async getActiveWorkspaceOrThrow(
    workspaceId: string,
  ): Promise<WorkspaceRecord> {
    const workspace =
      await this.workspaceRepository.findActiveById(workspaceId);
    if (!workspace) {
      throw new NotFoundException('Không tìm thấy Workspace');
    }
    return workspace;
  }

  private async assertMember(
    workspaceId: string,
    userId: string,
  ): Promise<MemberRecord> {
    const member = await this.workspaceRepository.findActiveMemberByUserId(
      workspaceId,
      userId,
    );
    if (!member) {
      throw new ForbiddenException(
        'Bạn không phải là thành viên của Workspace này',
      );
    }
    return member;
  }

  private async assertRole(
    workspaceId: string,
    userId: string,
    allowedRoles: WorkspaceRole[],
  ): Promise<MemberRecord> {
    const member = await this.assertMember(workspaceId, userId);
    if (!allowedRoles.includes(member.role)) {
      throw new ForbiddenException(
        'Bạn không có quyền thực hiện hành động này',
      );
    }
    return member;
  }

  private assertUsableInvitation(
    invitation: InvitationRecord | null,
    currentUser: UserEntity,
  ): asserts invitation is InvitationRecord {
    if (!invitation) {
      throw new NotFoundException('Không tìm thấy lời mời');
    }
    if (invitation.status !== InvitationStatus.PENDING) {
      throw new BadRequestException('Lời mời không còn hiệu lực');
    }
    if (invitation.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('Lời mời đã hết hạn');
    }
    if (invitation.email.toLowerCase() !== currentUser.email.toLowerCase()) {
      throw new ForbiddenException(
        'Lời mời này không dành cho tài khoản của bạn',
      );
    }
  }

  private async sendInvitationEmail(
    email: string,
    workspaceName: string,
    token: string,
  ): Promise<void> {
    const frontendUrl = this.configService.get<string>('app.frontendUrl');
    const inviteLink = `${frontendUrl}/invitations/${token}`;

    try {
      await withTimeout(
        this.mailQueueService.enqueueSend({
          to: email,
          subject: `Lời mời tham gia Workspace "${workspaceName}" trên NDT Task`,
          html: `<p>Bạn được mời tham gia Workspace <strong>${workspaceName}</strong> trên NDT Task.</p><p><a href="${inviteLink}">Nhấn vào đây để xem lời mời</a></p>`,
        }),
        ENQUEUE_TIMEOUT_MS,
      );
    } catch (error) {
      this.logger.warn(
        `Không thể enqueue mail mời tham gia workspace cho ${email}: ${(error as Error).message}`,
      );
    }
  }

  private toWorkspaceEntity(workspace: WorkspaceRecord): WorkspaceEntity {
    return {
      id: workspace.id,
      name: workspace.name,
      type: workspace.type,
      description: workspace.description,
      ownerId: workspace.ownerId,
      createdAt: workspace.createdAt,
      updatedAt: workspace.updatedAt,
    };
  }

  private toMemberEntity(member: MemberRecord): WorkspaceMemberEntity {
    return {
      id: member.id,
      workspaceId: member.workspaceId,
      userId: member.userId,
      role: member.role,
      invitedBy: member.invitedBy,
      joinedAt: member.joinedAt,
    };
  }

  private toInvitationEntity(
    invitation: InvitationRecord,
  ): WorkspaceInvitationEntity {
    return {
      id: invitation.id,
      workspaceId: invitation.workspaceId,
      email: invitation.email,
      role: invitation.role,
      status: invitation.status,
      invitedBy: invitation.invitedBy,
      expiresAt: invitation.expiresAt,
      createdAt: invitation.createdAt,
    };
  }
}
