import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

const RESET = '\x1b[0m';
const DIM = '\x1b[2m';

const METHOD_COLOR_CODES: Record<string, string> = {
  GET: '36', // cyan
  POST: '32', // green
  PATCH: '33', // yellow
  PUT: '33',
  DELETE: '31', // red
};

function paint(colorCode: string, text: string): string {
  return `\x1b[${colorCode}m${text}${RESET}`;
}

function statusColorCode(status: number): string {
  if (status >= 500) return '31'; // red
  if (status >= 400) return '33'; // yellow
  if (status >= 300) return '36'; // cyan
  return '32'; // green
}

@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(request: Request, response: Response, next: NextFunction): void {
    const { method, originalUrl } = request;
    const start = Date.now();

    // Nghe sự kiện 'finish' thay vì đọc response.statusCode ngay trong
    // interceptor: Nest chỉ thật sự set status code sau khi interceptor
    // chain chạy xong, đọc sớm sẽ luôn ra giá trị mặc định (200) sai lệch.
    response.on('finish', () => {
      const duration = Date.now() - start;
      const methodLabel = paint(
        METHOD_COLOR_CODES[method] ?? '37',
        method.padEnd(6),
      );
      const statusLabel = paint(
        statusColorCode(response.statusCode),
        String(response.statusCode),
      );
      this.logger.log(
        `${methodLabel} ${originalUrl} ${statusLabel} ${DIM}+${duration}ms${RESET}`,
      );
    });

    next();
  }
}
