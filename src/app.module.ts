import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountsModule } from './accounts/accounts.module';
import { buildDataSourceOptions } from './config/database.config';
import { TransactionsModule } from './transactions/transactions.module';
import { TransfersModule } from './transfers/transfers.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      useFactory: () => ({ ...buildDataSourceOptions(), migrationsRun: true, retryAttempts: 3 }),
    }),
    AccountsModule,
    TransactionsModule,
    TransfersModule,
  ],
})
export class AppModule {}
