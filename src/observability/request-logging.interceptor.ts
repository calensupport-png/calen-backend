import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { Request, Response } from 'express';

interface RequestWithId extends Request {
  requestId?: string;
}

@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const startedAt = Date.now();
    const request = context.switchToHttp().getRequest<RequestWithId>();
    const response = context.switchToHttp().getResponse<Response>();
    const requestId = request.requestId ?? 'unknown';
    const method = request.method;
    const path = request.originalUrl ?? request.url;
    const ip = request.ip ?? request.socket.remoteAddress ?? 'unknown';

    this.logger.log(`[${requestId}] -> ${method} ${path} ip=${ip}`);

    return next.handle().pipe(
      tap(() => {
        const duration = Date.now() - startedAt;
        this.logger.log(
          `[${requestId}] <- ${method} ${path} ${response.statusCode} ${duration}ms`,
        );
      }),
      catchError((error: unknown) => {
        const duration = Date.now() - startedAt;
        const statusCode =
          error instanceof HttpException ? error.getStatus() : 500;
        const message =
          error instanceof Error ? error.message : 'Unknown error';

        this.logger.error(
          `[${requestId}] <- ${method} ${path} ${statusCode} ${duration}ms error="${message}"`,
        );

        return throwError(() => error);
      }),
    );
  }
}
