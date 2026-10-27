import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response } from 'express';
import { QueryFailedError } from 'typeorm';
import { DomainException, ErrorCode } from './domain.exceptions';

interface ErrorBody {
  statusCode: number;
  error: string;
  message: string;
  details?: unknown;
}

const STATUS_CODES: Record<number, string> = {
  // Plain 400s are body-parser failures (malformed JSON) that Nest wraps; our own 400s are DomainExceptions.
  400: ErrorCode.INVALID_REQUEST_BODY,
  404: ErrorCode.NOT_FOUND,
  405: 'METHOD_NOT_ALLOWED',
  413: 'PAYLOAD_TOO_LARGE',
};

/** Turns every thrown error into the single response shape the API documents. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    const body = this.toBody(exception);

    if (body.statusCode >= 500) {
      this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    }
    res.status(body.statusCode).json({ ...body, path: req.originalUrl, timestamp: new Date().toISOString() });
  }

  private toBody(e: unknown): ErrorBody {
    if (e instanceof DomainException) {
      return { statusCode: e.getStatus(), error: e.code, message: e.message, details: e.details };
    }
    if (e instanceof HttpException) {
      const status = e.getStatus();
      const r = e.getResponse() as any;
      const message = typeof r === 'string' ? r : Array.isArray(r?.message) ? r.message.join('; ') : r?.message ?? e.message;
      return { statusCode: status, error: STATUS_CODES[status] ?? 'ERROR', message };
    }
    if (e instanceof QueryFailedError) {
      const code = (e as any).driverError?.code;
      const constraint: string | undefined = (e as any).driverError?.constraint;
      if (code === '23505') {
        return {
          statusCode: HttpStatus.CONFLICT,
          error: ErrorCode.DUPLICATE_TRANSACTION,
          message: 'A transaction with this reference_id already exists for this account',
        };
      }
      if (code === '23514' && constraint === 'chk_accounts_balance_non_negative') {
        return {
          statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
          error: ErrorCode.INSUFFICIENT_BALANCE,
          message: 'Insufficient balance for this debit',
        };
      }
      if (code === '23503') {
        return { statusCode: HttpStatus.NOT_FOUND, error: ErrorCode.ACCOUNT_NOT_FOUND, message: 'Account not found' };
      }
    }
    // body-parser errors (malformed JSON, payload too large) arrive as plain errors with a `type`.
    const type = (e as any)?.type;
    if (type === 'entity.parse.failed') {
      return { statusCode: 400, error: ErrorCode.INVALID_REQUEST_BODY, message: 'Request body is not valid JSON' };
    }
    if (type === 'entity.too.large') {
      return { statusCode: 413, error: 'PAYLOAD_TOO_LARGE', message: 'Request body is too large' };
    }
    return { statusCode: 500, error: ErrorCode.INTERNAL_ERROR, message: 'Internal server error' };
  }
}
