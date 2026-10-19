import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VideosModule } from './videos/videos.module';
import { StreamController } from './stream.controller';
import { VideoStatusScannerService } from './utils/VideoStatusScannerService';

const REQUIRED_ENV = [
  'DB_USERNAME',
  'DB_PASSWORD',
  'DB_DATABASE',
  'STREAM_SECRET',
];

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: (env) => {
        const missing = REQUIRED_ENV.filter((key) => !env[key]);
        if (missing.length) {
          throw new Error(
            `Missing required environment variables: ${missing.join(', ')}`,
          );
        }
        return env;
      },
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'mysql',
        host: config.get<string>('DB_HOST', 'localhost'),
        port: Number(config.get<string>('DB_PORT', '3306')),
        username: config.getOrThrow<string>('DB_USERNAME'),
        password: config.getOrThrow<string>('DB_PASSWORD'),
        database: config.getOrThrow<string>('DB_DATABASE'),
        autoLoadEntities: true,
        synchronize: true, // ✅ only for development!
      }),
    }),
    VideosModule,
  ],
  controllers: [AppController, StreamController],
  providers: [AppService, VideoStatusScannerService],
})
export class AppModule {}
