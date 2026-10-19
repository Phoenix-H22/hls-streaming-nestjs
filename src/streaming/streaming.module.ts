import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StreamController } from './stream.controller';
import { StreamSigner } from './stream-signer';

@Module({
  controllers: [StreamController],
  providers: [
    {
      provide: StreamSigner,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new StreamSigner(config.getOrThrow<string>('STREAM_SECRET')),
    },
  ],
  exports: [StreamSigner],
})
export class StreamingModule {}
