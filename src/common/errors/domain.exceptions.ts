import { HttpException, HttpStatus } from '@nestjs/common';

export enum ErrorCode {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  INVALID_ACCOUNT_ID = 'INVALID_ACCOUNT_ID',
  ACCOUNT_NOT_FOUND = 'ACCOUNT_NOT_FOUND',
  DUPLICATE_TRANSACTION = 'DUPLICATE_TRANSACTION',
  INSUFFICIENT_BALANCE = 'INSUFFICIENT_BALANCE',
  SAME_ACCOUNT_TRANSFER = 'SAME_ACCOUNT_TRANSFER',
  INVALID_REQUEST_BODY = 'INVALID_REQUEST_BODY',
  NOT_FOUND = 'NOT_FOUND',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

export class DomainException extends HttpException {
  constructor(
    status: HttpStatus,
    readonly code: ErrorCode | string,
    message: string,
    readonly details?: unknown,
  ) {
    super({ code, message, details }, status);
  }
}

export class AccountNotFoundException extends DomainException {
  constructor(accountId: string) {
    super(HttpStatus.NOT_FOUND, ErrorCode.ACCOUNT_NOT_FOUND, `Account ${accountId} not found`, {
      account_id: accountId,
    });
  }
}

export class InvalidAccountIdException extends DomainException {
  constructor() {
    super(HttpStatus.BAD_REQUEST, ErrorCode.INVALID_ACCOUNT_ID, 'Account id must be a valid UUID');
  }
}

export class DuplicateTransactionException extends DomainException {
  constructor(existing?: unknown) {
    super(
      HttpStatus.CONFLICT,
      ErrorCode.DUPLICATE_TRANSACTION,
      'A transaction with this reference_id already exists for this account',
      existing ? { transaction: existing } : undefined,
    );
  }
}

export class InsufficientBalanceException extends DomainException {
  constructor(accountId: string, requestedAmount: string) {
    super(HttpStatus.UNPROCESSABLE_ENTITY, ErrorCode.INSUFFICIENT_BALANCE, 'Insufficient balance for this debit', {
      account_id: accountId,
      requested_amount: requestedAmount,
    });
  }
}
