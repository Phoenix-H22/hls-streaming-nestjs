import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VideosModule } from './videos/videos.module';
import { StreamController } from './stream.controller';
import {VideoStatusScannerService} from "./utils/VideoStatusScannerService";

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'mysql',
      host: 'localhost',
      port: 3306,
      username: 'hls',
      password: 'axaS9b1Xkz1mfgv74TWj',
      database: 'hls',
      autoLoadEntities: true,
      synchronize: true, // ✅ only for development!
    }),
    VideosModule,
  ],
  controllers: [AppController,StreamController],
  providers: [AppService,    VideoStatusScannerService],
})
export class AppModule {}
