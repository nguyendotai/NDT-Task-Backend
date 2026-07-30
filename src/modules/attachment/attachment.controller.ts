import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { extname } from 'node:path';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserEntity } from '../user/entities/user.entity';
import { AttachmentService } from './attachment.service';

// attachment.md #5.5: giới hạn dung lượng + chặn định dạng thực thi nguy hiểm
// (spec không đưa whitelist cụ thể — hệ thống cho phép hầu hết định dạng,
// chỉ chặn nhóm rủi ro cao).
const MAX_ATTACHMENT_SIZE_BYTES = 20 * 1024 * 1024;
const BLOCKED_EXTENSIONS = ['.exe', '.bat', '.cmd', '.sh', '.msi', '.dll'];

@Controller('tasks')
@UseGuards(JwtAuthGuard)
export class TaskAttachmentsController {
  constructor(private readonly attachmentService: AttachmentService) {}

  @Post(':taskId/attachments')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_ATTACHMENT_SIZE_BYTES },
      fileFilter: (_req, file, callback) => {
        if (
          BLOCKED_EXTENSIONS.includes(extname(file.originalname).toLowerCase())
        ) {
          callback(
            new BadRequestException('Định dạng file này không được phép'),
            false,
          );
          return;
        }
        callback(null, true);
      },
    }),
  )
  upload(
    @CurrentUser() user: UserEntity,
    @Param('taskId') taskId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('Thiếu file đính kèm');
    }
    return this.attachmentService.upload(taskId, user.id, file);
  }

  @Get(':taskId/attachments')
  listByTask(@CurrentUser() user: UserEntity, @Param('taskId') taskId: string) {
    return this.attachmentService.listByTask(taskId, user.id);
  }
}

@Controller('attachments')
@UseGuards(JwtAuthGuard)
export class AttachmentController {
  constructor(private readonly attachmentService: AttachmentService) {}

  @Delete(':id')
  remove(@CurrentUser() user: UserEntity, @Param('id') id: string) {
    return this.attachmentService.remove(id, user.id);
  }
}
