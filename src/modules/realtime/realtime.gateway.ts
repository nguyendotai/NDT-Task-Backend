import { Inject, forwardRef } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import type { Server, Socket } from 'socket.io';
import { UserService } from '../user/user.service';
import { WorkspaceService } from '../workspace/workspace.service';

interface JwtPayload {
  sub: string;
}

interface SocketData {
  userId?: string;
  userName?: string;
  workspaceIds?: Set<string>;
}

function getSocketUserId(client: Socket): string | undefined {
  return (client.data as SocketData).userId;
}

function getSocketUserName(client: Socket): string | undefined {
  return (client.data as SocketData).userName;
}

function setSocketUser(client: Socket, userId: string, userName: string): void {
  const data = client.data as SocketData;
  data.userId = userId;
  data.userName = userName;
}

function trackJoinedWorkspace(client: Socket, workspaceId: string): void {
  const data = client.data as SocketData;
  if (!data.workspaceIds) data.workspaceIds = new Set();
  data.workspaceIds.add(workspaceId);
}

function untrackJoinedWorkspace(client: Socket, workspaceId: string): void {
  (client.data as SocketData).workspaceIds?.delete(workspaceId);
}

function getJoinedWorkspaces(client: Socket): string[] {
  return Array.from((client.data as SocketData).workspaceIds ?? []);
}

// board.md/task.md/sprint.md/notification.md: sync Board/Task/Column/Sprint/
// Comment/Checklist/Label/Watcher/Attachment/Notification theo thời gian
// thực cho mọi Member đang mở cùng Workspace — mỗi client join 1 room theo
// workspaceId sau khi xác thực JWT + kiểm tra đúng là Member Active. Kèm
// Presence (online theo Workspace) và Typing Indicator (theo Task).
@WebSocketGateway({
  cors: {
    origin: (process.env.CORS_ORIGIN ?? 'http://localhost:3000').split(','),
    credentials: true,
  },
})
export class RealtimeGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  // Presence: workspaceId -> userId -> Set<socketId> đang mở Workspace đó —
  // dùng Set(socketId) thay vì đếm số vì 1 user có thể mở nhiều tab/thiết bị,
  // chỉ coi là "offline" khi tab/thiết bị CUỐI CÙNG rời đi.
  private readonly presenceByWorkspace = new Map<
    string,
    Map<string, Set<string>>
  >();

  constructor(
    private readonly jwtService: JwtService,
    private readonly userService: UserService,
    @Inject(forwardRef(() => WorkspaceService))
    private readonly workspaceService: WorkspaceService,
  ) {}

  // Dùng middleware socket.io (server.use) thay vì xác thực trong
  // handleConnection: handleConnection chạy SAU khi connection đã thiết lập
  // nên client có thể emit message (vd. join-workspace) trước khi phần xác
  // thực bất đồng bộ (verify JWT + tra DB) kịp chạy xong — middleware chạy và
  // phải hoàn tất trước khi socket.io coi là "connected", đảm bảo
  // client.data.userId luôn có sẵn trước mọi message từ client.
  afterInit(server: Server): void {
    server.use((client, next) => {
      this.authenticate(client)
        .then(() => next())
        .catch(() => next(new Error('Unauthorized')));
    });
  }

  handleConnection(): void {
    // Xác thực đã xong trong middleware ở afterInit trước khi sự kiện này
    // được phát — không cần làm gì thêm ở đây.
  }

  // Client có thể đóng tab/mất mạng mà không kịp gọi leave-workspace — dọn
  // Presence cho toàn bộ Workspace socket này đã join, đúng theo Set(socketId)
  // để không tắt "online" nhầm khi user còn tab khác đang mở.
  handleDisconnect(client: Socket): void {
    const userId = getSocketUserId(client);
    if (!userId) return;
    for (const workspaceId of getJoinedWorkspaces(client)) {
      const wentOffline = this.removePresence(workspaceId, userId, client.id);
      if (wentOffline) {
        this.emitToWorkspace(workspaceId, 'presence.offline', { userId });
      }
    }
  }

  private async authenticate(client: Socket): Promise<void> {
    const token = this.extractToken(client);
    const payload = await this.jwtService.verifyAsync<JwtPayload>(token);
    const user = await this.userService.getProfile(payload.sub);
    setSocketUser(client, user.id, user.name);
    // notification.md #11: chuông thông báo cá nhân — tự join room riêng theo
    // userId ngay khi xác thực xong, không cần client chủ động "join" như
    // Workspace (mỗi user chỉ có đúng 1 room riêng, không cần chọn phạm vi).
    await client.join(this.userRoomName(user.id));
  }

  @SubscribeMessage('join-workspace')
  async handleJoinWorkspace(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { workspaceId?: string },
  ): Promise<void> {
    const userId = getSocketUserId(client);
    const workspaceId = body?.workspaceId;
    if (!userId || !workspaceId) return;

    const member = await this.workspaceService.findMembership(
      workspaceId,
      userId,
    );
    if (!member) {
      client.emit('error', {
        message: 'Bạn không phải Member của Workspace này',
      });
      return;
    }
    await client.join(this.roomName(workspaceId));
    trackJoinedWorkspace(client, workspaceId);

    // Gửi lại cho chính client vừa join danh sách đang online (họ có thể vào
    // sau khi người khác đã online từ trước), rồi báo cho cả room biết nếu
    // đây là kết nối đầu tiên của user này trong Workspace.
    client.emit('presence.snapshot', {
      onlineUserIds: this.getOnlineUserIds(workspaceId),
    });
    const isNewlyOnline = this.addPresence(workspaceId, userId, client.id);
    if (isNewlyOnline) {
      this.emitToWorkspace(workspaceId, 'presence.online', { userId });
    }
  }

  @SubscribeMessage('leave-workspace')
  handleLeaveWorkspace(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { workspaceId?: string },
  ): void {
    const userId = getSocketUserId(client);
    const workspaceId = body?.workspaceId;
    if (!workspaceId) return;

    void client.leave(this.roomName(workspaceId));
    untrackJoinedWorkspace(client, workspaceId);
    if (!userId) return;
    const wentOffline = this.removePresence(workspaceId, userId, client.id);
    if (wentOffline) {
      this.emitToWorkspace(workspaceId, 'presence.offline', { userId });
    }
  }

  // Typing Indicator (Task Detail Modal) — không lưu DB, chỉ relay tức thời
  // cho các Member khác đang mở cùng Workspace; Frontend tự lọc theo taskId.
  @SubscribeMessage('typing.start')
  handleTypingStart(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { workspaceId?: string; taskId?: string },
  ): void {
    const userId = getSocketUserId(client);
    const userName = getSocketUserName(client);
    if (!userId || !body?.workspaceId || !body.taskId) return;
    // Chỉ relay nếu socket này thật sự đã join Workspace đó (qua join-workspace
    // đã kiểm tra Member Active) — chặn giả mạo workspaceId tuỳ ý.
    if (!getJoinedWorkspaces(client).includes(body.workspaceId)) return;

    client.to(this.roomName(body.workspaceId)).emit('typing.start', {
      taskId: body.taskId,
      userId,
      userName,
    });
  }

  @SubscribeMessage('typing.stop')
  handleTypingStop(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { workspaceId?: string; taskId?: string },
  ): void {
    const userId = getSocketUserId(client);
    if (!userId || !body?.workspaceId || !body.taskId) return;
    if (!getJoinedWorkspaces(client).includes(body.workspaceId)) return;

    client.to(this.roomName(body.workspaceId)).emit('typing.stop', {
      taskId: body.taskId,
      userId,
    });
  }

  // Các Service khác (Task/Column/Sprint/Comment/Checklist/Label/Attachment)
  // gọi hàm này ngay sau khi ghi Activity Log để phát sự kiện cho mọi Member
  // đang mở cùng Workspace.
  emitToWorkspace(workspaceId: string, event: string, payload: unknown): void {
    this.server?.to(this.roomName(workspaceId)).emit(event, payload);
  }

  // Gọi ngay sau notificationService.notify() để chuông thông báo cập nhật
  // tức thời thay vì chờ Frontend poll lại mỗi 30s.
  emitToUser(userId: string, event: string, payload: unknown): void {
    this.server?.to(this.userRoomName(userId)).emit(event, payload);
  }

  private addPresence(
    workspaceId: string,
    userId: string,
    socketId: string,
  ): boolean {
    let byUser = this.presenceByWorkspace.get(workspaceId);
    if (!byUser) {
      byUser = new Map();
      this.presenceByWorkspace.set(workspaceId, byUser);
    }
    let sockets = byUser.get(userId);
    const isNewlyOnline = !sockets || sockets.size === 0;
    if (!sockets) {
      sockets = new Set();
      byUser.set(userId, sockets);
    }
    sockets.add(socketId);
    return isNewlyOnline;
  }

  private removePresence(
    workspaceId: string,
    userId: string,
    socketId: string,
  ): boolean {
    const byUser = this.presenceByWorkspace.get(workspaceId);
    const sockets = byUser?.get(userId);
    if (!sockets) return false;
    sockets.delete(socketId);
    if (sockets.size > 0) return false;
    byUser!.delete(userId);
    if (byUser!.size === 0) this.presenceByWorkspace.delete(workspaceId);
    return true;
  }

  private getOnlineUserIds(workspaceId: string): string[] {
    const byUser = this.presenceByWorkspace.get(workspaceId);
    return byUser ? Array.from(byUser.keys()) : [];
  }

  private roomName(workspaceId: string): string {
    return `workspace:${workspaceId}`;
  }

  private userRoomName(userId: string): string {
    return `user:${userId}`;
  }

  private extractToken(client: Socket): string {
    const authToken = client.handshake.auth?.token as string | undefined;
    const headerToken = client.handshake.headers.authorization?.replace(
      'Bearer ',
      '',
    );
    const token = authToken ?? headerToken;
    if (!token) {
      throw new Error('Thiếu access token');
    }
    return token;
  }
}
