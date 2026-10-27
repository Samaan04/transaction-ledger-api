import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

export type TransactionType = 'credit' | 'debit';

@Entity('transactions')
export class Transaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'account_id', type: 'uuid' })
  accountId: string;

  @Column({ type: 'varchar', length: 6 })
  type: TransactionType;

  @Column({ type: 'numeric', precision: 19, scale: 2 })
  amount: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description: string | null;

  @Column({ name: 'reference_id', type: 'varchar', length: 100 })
  referenceId: string;

  @Column({ name: 'transfer_id', type: 'uuid', nullable: true })
  transferId: string | null;

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'clock_timestamp()' })
  createdAt: Date;
}
