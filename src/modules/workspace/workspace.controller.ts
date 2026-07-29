import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserEntity } from '../user/entities/user.entity';
import { WorkspaceService } from './workspace.service';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { UpdateWorkspaceDto } from './dto/update-workspace.dto';
import { InviteMemberDto } from './dto/invite-member.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';
import { TransferOwnerDto } from './dto/transfer-owner.dto';

@Controller('workspaces')
@UseGuards(JwtAuthGuard)
export class WorkspaceController {
  constructor(private readonly workspaceService: WorkspaceService) {}

  @Post()
  create(@CurrentUser() user: UserEntity, @Body() dto: CreateWorkspaceDto) {
    return this.workspaceService.create(user.id, dto);
  }

  @Get()
  listMine(
    @CurrentUser() user: UserEntity,
    @Query('starred') starred?: string,
  ) {
    return this.workspaceService.listMine(
      user.id,
      starred === undefined ? undefined : starred === 'true',
    );
  }

  @Post('invitations/:token/accept')
  acceptInvitation(
    @CurrentUser() user: UserEntity,
    @Param('token') token: string,
  ) {
    return this.workspaceService.acceptInvitation(token, user);
  }

  @Post('invitations/:token/reject')
  rejectInvitation(
    @CurrentUser() user: UserEntity,
    @Param('token') token: string,
  ) {
    return this.workspaceService.rejectInvitation(token, user);
  }

  @Get(':id')
  getDetail(@CurrentUser() user: UserEntity, @Param('id') id: string) {
    return this.workspaceService.getDetail(id, user.id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: UserEntity,
    @Param('id') id: string,
    @Body() dto: UpdateWorkspaceDto,
  ) {
    return this.workspaceService.update(id, user.id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: UserEntity, @Param('id') id: string) {
    return this.workspaceService.remove(id, user.id);
  }

  @Post(':id/transfer-owner')
  transferOwner(
    @CurrentUser() user: UserEntity,
    @Param('id') id: string,
    @Body() dto: TransferOwnerDto,
  ) {
    return this.workspaceService.transferOwner(id, user.id, dto);
  }

  @Post(':id/leave')
  leave(@CurrentUser() user: UserEntity, @Param('id') id: string) {
    return this.workspaceService.leave(id, user.id);
  }

  @Post(':id/star')
  star(@CurrentUser() user: UserEntity, @Param('id') id: string) {
    return this.workspaceService.star(id, user.id);
  }

  @Delete(':id/star')
  unstar(@CurrentUser() user: UserEntity, @Param('id') id: string) {
    return this.workspaceService.unstar(id, user.id);
  }

  @Get(':id/members')
  listMembers(@CurrentUser() user: UserEntity, @Param('id') id: string) {
    return this.workspaceService.listMembers(id, user.id);
  }

  @Post(':id/members/invite')
  inviteMember(
    @CurrentUser() user: UserEntity,
    @Param('id') id: string,
    @Body() dto: InviteMemberDto,
  ) {
    return this.workspaceService.inviteMember(id, user.id, dto);
  }

  @Patch(':id/members/:memberId/role')
  updateMemberRole(
    @CurrentUser() user: UserEntity,
    @Param('id') id: string,
    @Param('memberId') memberId: string,
    @Body() dto: UpdateMemberRoleDto,
  ) {
    return this.workspaceService.updateMemberRole(id, user.id, memberId, dto);
  }

  @Delete(':id/members/:memberId')
  removeMember(
    @CurrentUser() user: UserEntity,
    @Param('id') id: string,
    @Param('memberId') memberId: string,
  ) {
    return this.workspaceService.removeMember(id, user.id, memberId);
  }

  @Get(':id/invitations')
  listInvitations(@CurrentUser() user: UserEntity, @Param('id') id: string) {
    return this.workspaceService.listInvitations(id, user.id);
  }

  @Delete(':id/invitations/:invitationId')
  revokeInvitation(
    @CurrentUser() user: UserEntity,
    @Param('id') id: string,
    @Param('invitationId') invitationId: string,
  ) {
    return this.workspaceService.revokeInvitation(id, user.id, invitationId);
  }
}
