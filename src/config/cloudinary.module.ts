import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';

export const CLOUDINARY_CLIENT = 'CLOUDINARY_CLIENT';

@Global()
@Module({
  providers: [
    {
      provide: CLOUDINARY_CLIENT,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        cloudinary.config({
          cloud_name: configService.get<string>('cloudinary.cloudName'),
          api_key: configService.get<string>('cloudinary.apiKey'),
          api_secret: configService.get<string>('cloudinary.apiSecret'),
        });
        return cloudinary;
      },
    },
  ],
  exports: [CLOUDINARY_CLIENT],
})
export class CloudinaryModule {}
