import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AccountIdPipe } from '../accounts/accounts.controller';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { TransactionQueryDto } from './dto/transaction-query.dto';
import { CreatedTransactionResponseDto, TransactionHistoryResponseDto } from './dto/transaction-response.dto';
import { TransactionsService } from './transactions.service';

@ApiTags('transactions')
@Controller('accounts/:id/transactions')
export class TransactionsController {
  constructor(private readonly service: TransactionsService) {}

  @Post()
  @ApiOperation({ summary: 'Add a credit or debit transaction to an account' })
  @ApiResponse({ status: 201, type: CreatedTransactionResponseDto })
  @ApiResponse({ status: 400, description: 'Validation error / malformed account id' })
  @ApiResponse({ status: 404, description: 'Account not found' })
  @ApiResponse({ status: 409, description: 'Duplicate reference_id for this account (nothing changed)' })
  @ApiResponse({ status: 422, description: 'Insufficient balance (nothing changed)' })
  create(@Param('id', AccountIdPipe) id: string, @Body() dto: CreateTransactionDto) {
    return this.service.create(id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Transaction history: latest first, optional type filter, paginated' })
  @ApiResponse({ status: 200, type: TransactionHistoryResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid type, page or limit / malformed account id' })
  @ApiResponse({ status: 404, description: 'Account not found' })
  history(@Param('id', AccountIdPipe) id: string, @Query() query: TransactionQueryDto) {
    return this.service.history(id, query);
  }
}
