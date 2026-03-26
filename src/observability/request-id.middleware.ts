import { randomUUID } from 'crypto';
import { NextFunction, Request, Response } from 'express';

interface RequestWithId extends Request {
  requestId?: string;
}

export function assignRequestId(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const request = req as RequestWithId;
  const incomingRequestId = req.header('x-request-id');
  const requestId = incomingRequestId?.trim() || randomUUID();

  request.requestId = requestId;
  res.setHeader('x-request-id', requestId);

  next();
}
