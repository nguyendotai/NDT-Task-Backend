import { registerAs } from '@nestjs/config';

export default registerAs('redis', () => ({
  host: process.env.REDIS_HOST ?? 'localhost',
  port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
  // Redis cloud (Upstash...) yêu cầu kết nối TLS — Redis local thường không cần.
  tls: process.env.REDIS_TLS === 'true' ? {} : undefined,
}));
