import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { BullModule } from '@nestjs/bullmq';
import type { StringValue } from 'ms';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './modules/auth/auth.module';
import { UserModule } from './modules/user/user.module';
import { WorkspaceModule } from './modules/workspace/workspace.module';
import { BoardModule } from './modules/board/board.module';
import { ColumnModule } from './modules/column/column.module';
import { TaskModule } from './modules/task/task.module';
import { SprintModule } from './modules/sprint/sprint.module';
import { CommentModule } from './modules/comment/comment.module';
import { AttachmentModule } from './modules/attachment/attachment.module';
import { ChecklistModule } from './modules/checklist/checklist.module';
import { LabelModule } from './modules/label/label.module';
import { SearchModule } from './modules/search/search.module';
import { PrismaModule } from './database/prisma.module';
import { RedisModule } from './config/redis.module';
import { MailModule } from './config/mail.module';
import { CloudinaryModule } from './config/cloudinary.module';
import appConfig from './config/app.config';
import corsConfig from './config/cors.config';
import jwtConfig from './config/jwt.config';
import redisConfig from './config/redis.config';
import mailConfig from './config/mail.config';
import cloudinaryConfig from './config/cloudinary.config';
import googleConfig from './config/google.config';
import { RequestLoggerMiddleware } from './common/middleware/request-logger.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [
        appConfig,
        corsConfig,
        jwtConfig,
        redisConfig,
        mailConfig,
        cloudinaryConfig,
        googleConfig,
      ],
    }),
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('jwt.accessToken.secret'),
        signOptions: {
          expiresIn: configService.get<string>(
            'jwt.accessToken.expiresIn',
          ) as StringValue,
        },
      }),
    }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.get<string>('redis.host'),
          port: configService.get<number>('redis.port'),
          password: configService.get<string>('redis.password'),
          tls: configService.get<Record<string, never>>('redis.tls'),
        },
      }),
    }),
    PrismaModule,
    RedisModule,
    MailModule,
    CloudinaryModule,
    AuthModule,
    UserModule,
    WorkspaceModule,
    BoardModule,
    ColumnModule,
    TaskModule,
    SprintModule,
    CommentModule,
    AttachmentModule,
    ChecklistModule,
    LabelModule,
    SearchModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestLoggerMiddleware).forRoutes('{*path}');
  }
}
