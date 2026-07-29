import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { UploadApiErrorResponse, UploadApiResponse } from 'cloudinary';
import { Readable } from 'node:stream';
import { CLOUDINARY_CLIENT } from '../../config/cloudinary.module';
import { UserRepository } from './user.repository';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UserEntity } from './entities/user.entity';

type CloudinaryClient = typeof import('cloudinary').v2;

const AVATAR_FOLDER = 'ndt-task/avatars';

@Injectable()
export class UserService {
  constructor(
    private readonly userRepository: UserRepository,
    @Inject(CLOUDINARY_CLIENT) private readonly cloudinary: CloudinaryClient,
  ) {}

  async getProfile(userId: string): Promise<UserEntity> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new NotFoundException('Không tìm thấy người dùng');
    }
    return this.toEntity(user);
  }

  async findByEmail(email: string): Promise<UserEntity | null> {
    const user = await this.userRepository.findByEmail(email);
    return user ? this.toEntity(user) : null;
  }

  async updateProfile(
    userId: string,
    dto: UpdateProfileDto,
  ): Promise<UserEntity> {
    const user = await this.userRepository.updateProfile(userId, {
      name: dto.name,
      settings: dto.settings as Prisma.InputJsonValue | undefined,
    });
    return this.toEntity(user);
  }

  async updateAvatar(
    userId: string,
    file: Express.Multer.File,
  ): Promise<UserEntity> {
    const result = await this.uploadToCloudinary(file.buffer, userId);
    const user = await this.userRepository.updateAvatar(
      userId,
      result.secure_url,
      result.public_id,
    );
    return this.toEntity(user);
  }

  private uploadToCloudinary(
    buffer: Buffer,
    userId: string,
  ): Promise<UploadApiResponse> {
    return new Promise((resolve, reject) => {
      const uploadStream = this.cloudinary.uploader.upload_stream(
        {
          folder: AVATAR_FOLDER,
          public_id: userId,
          overwrite: true,
          resource_type: 'image',
        },
        (error?: UploadApiErrorResponse, result?: UploadApiResponse) => {
          if (error || !result) {
            reject(new Error(error?.message ?? 'Cloudinary upload thất bại'));
            return;
          }
          resolve(result);
        },
      );
      Readable.from(buffer).pipe(uploadStream);
    });
  }

  private toEntity(user: {
    id: string;
    email: string;
    name: string;
    avatarUrl: string | null;
    avatarPublicId: string | null;
    settings: unknown;
    systemRole: UserEntity['systemRole'];
    createdAt: Date;
    updatedAt: Date;
  }): UserEntity {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      avatarPublicId: user.avatarPublicId,
      settings: user.settings as Record<string, unknown> | null,
      systemRole: user.systemRole,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
