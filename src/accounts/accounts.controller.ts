import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { InvalidAccountIdException } from '../common/errors/domain.exceptions';
import { AccountsService } from './accounts.service';
import { AccountResponseDto, BalanceResponseDto } from './dto/account-response.dto';
import { CreateAccountDto } from './dto/create-account.dto';

export const AccountIdPipe = new ParseUUIDPipe({ exceptionFactory: () => new InvalidAccountIdException() });

@ApiTags('accounts')
@Controller('accounts')
export class AccountsController {
  constructor(private readonly service: AccountsService) {}

  @Post()
  @ApiOperation({ summary: 'Create an account (balance always starts at 0)' })
  @ApiResponse({ status: 201, type: AccountResponseDto })
  @ApiResponse({ status: 400, description: 'Validation error (missing name, unknown field such as balance)' })
  async create(@Body() dto: CreateAccountDto): Promise<AccountResponseDto> {
    return AccountResponseDto.from(await this.service.create(dto));
  }

  @Get(':id/balance')
  @ApiOperation({ summary: 'Get current balance of an account' })
  @ApiResponse({ status: 200, type: BalanceResponseDto })
  @ApiResponse({ status: 400, description: 'Malformed account id' })
  @ApiResponse({ status: 404, description: 'Account not found' })
  async balance(@Param('id', AccountIdPipe) id: string): Promise<BalanceResponseDto> {
    const account = await this.service.getOrFail(id);
    return { account_id: account.id, balance: account.balance };
  }
}
