import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configureApp(app);

  const doc = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Transaction Ledger API')
      .setDescription('Accounts, credit/debit transactions, balances, history and transfers.')
      .setVersion('1.0')
      .build(),
  );
  SwaggerModule.setup('docs', app, doc);

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  console.log(`Ledger API listening on http://localhost:${port}  (Swagger: /docs)`);
}
bootstrap();
