import "reflect-metadata";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";
import { getFrontendOrigins } from "./config/app-config";
import { PrismaService } from "./prisma/prisma.service";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  const prisma = app.get(PrismaService);

  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    origin: getFrontendOrigins(config),
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle("Chave Auth API")
    .setDescription("Authentication and authorization microservice")
    .setVersion("1.0.0")
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup("docs", app, document);

  await prisma.enableShutdownHooks(app);
  await app.listen(config.getOrThrow<number>("PORT"));
}

bootstrap();
