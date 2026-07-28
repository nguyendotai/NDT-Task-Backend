import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { UserEntity } from '../../modules/user/entities/user.entity';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): UserEntity => {
    const request = ctx
      .switchToHttp()
      .getRequest<Request & { user: UserEntity }>();
    return request.user;
  },
);
