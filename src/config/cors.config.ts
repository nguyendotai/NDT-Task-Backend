import { registerAs } from '@nestjs/config';

export default registerAs('cors', () => ({
  origin: (process.env.CORS_ORIGIN ?? 'http://localhost:3001').split(','),
  credentials: true,
}));
