import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';

interface RequestWithId extends Request {
  requestId?: string;
}

interface ErrorBody {
  code: string;
  message: string | string[];
  details?: unknown;
}

@Catch()
export class BadRequestExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<RequestWithId>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const error = this.normalizeError(exception, status);

    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.originalUrl ?? request.url,
      requestId: request.requestId,
      error: {
        ...error,
        message: Array.isArray(error.message)
          ? error.message.join(', ')
          : error.message,
      },
    });
  }

  private normalizeError(exception: unknown, status: number): ErrorBody {
    if (exception instanceof HttpException) {
      const payload = exception.getResponse();

      if (
        typeof payload === 'object' &&
        payload !== null &&
        'code' in payload &&
        'message' in payload
      ) {
        const body = payload as ErrorBody;
        return body;
      }

      if (typeof payload === 'string') {
        return {
          code: this.getDefaultCode(status),
          message: payload,
        };
      }
    }

    if (exception instanceof Error) {
      return {
        code: this.getDefaultCode(status),
        message: exception.message,
      };
    }

    return {
      code: this.getDefaultCode(status),
      message: 'An unexpected error occurred',
    };
  }

  private getDefaultCode(status: number): string {
    if (status === HttpStatus.BAD_REQUEST) return 'BAD_REQUEST';
    if (status === HttpStatus.UNAUTHORIZED) return 'UNAUTHORIZED';
    if (status === HttpStatus.FORBIDDEN) return 'FORBIDDEN';
    if (status === HttpStatus.NOT_FOUND) return 'NOT_FOUND';
    if (status === HttpStatus.CONFLICT) return 'CONFLICT';

    return 'INTERNAL_SERVER_ERROR';
  }
}
