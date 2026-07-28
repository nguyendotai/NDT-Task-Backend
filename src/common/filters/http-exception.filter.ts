import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

interface ParsedError {
  message: string;
  details: string[];
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status: number =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const { message, details } = this.parseException(exception);

    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url}`,
        (exception as Error)?.stack,
      );
    }

    response.status(status).json({
      success: false,
      message,
      error: {
        code: HttpStatus[status] ?? 'INTERNAL_SERVER_ERROR',
        details,
      },
      timestamp: new Date().toISOString(),
    });
  }

  private parseException(exception: unknown): ParsedError {
    if (!(exception instanceof HttpException)) {
      return { message: 'Internal server error', details: [] };
    }

    const response = exception.getResponse();
    if (typeof response === 'string') {
      return { message: response, details: [] };
    }

    const { message } = response as { message?: string | string[] };
    if (Array.isArray(message)) {
      return { message: 'Validation failed', details: message };
    }
    return { message: message ?? exception.message, details: [] };
  }
}
