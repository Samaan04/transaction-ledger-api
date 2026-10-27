import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AccountNotFoundException } from '../common/errors/domain.exceptions';
import { Account } from './account.entity';
import { CreateAccountDto } from './dto/create-account.dto';

@Injectable()
export class AccountsService {
  constructor(@InjectRepository(Account) private readonly accounts: Repository<Account>) {}

  /** Balance is never taken from the client; the DB default (0) applies. */
  create(dto: CreateAccountDto): Promise<Account> {
    return this.accounts.save(this.accounts.create({ name: dto.name }));
  }

  async getOrFail(id: string): Promise<Account> {
    const account = await this.accounts.findOne({ where: { id } });
    if (!account) throw new AccountNotFoundException(id);
    return account;
  }
}
