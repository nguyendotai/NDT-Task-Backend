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
}

function getSocketUserId(client: Socket): string | undefined {
  return (client.data as SocketData).userId;
}

function setSocketUserId(client: Socket, userId: string): void {
  (client.data as SocketData).userId = userId;
}

// board.md/task.md/sprint.md: sync Board/Task/Column/Sprint theo thời gian
// thực cho mọi Member đang mở cùng Workspace — mỗi client join 1 room theo
// workspaceId sau khi xác thực JWT + kiểm tra đúng là Member Active.
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

  handleDisconnect(): void {
    // socket.io tự rời hết room khi disconnect — không cần dọn thủ công.
  }

  private async authenticate(client: Socket): Promise<void> {
    const token = this.extractToken(client);
    const payload = await this.jwtService.verifyAsync<JwtPayload>(token);
    const user = await this.userService.getProfile(payload.sub);
    setSocketUserId(client, user.id);
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
  }

  @SubscribeMessage('leave-workspace')
  handleLeaveWorkspace(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { workspaceId?: string },
  ): void {
    if (body?.workspaceId) {
      void client.leave(this.roomName(body.workspaceId));
    }
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
