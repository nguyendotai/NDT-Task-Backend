import { registerAs } from '@nestjs/config';

export default registerAs('jwt', () => ({
  accessToken: {
    secret: process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret',
    expiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
  },
  refreshToken: {
    secret: process.env.JWT_REFRESH_SECRET ?? 'dev-refresh-secret',
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
  },
}));
