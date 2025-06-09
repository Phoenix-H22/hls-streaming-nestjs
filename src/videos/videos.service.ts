import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Video } from './video.entity';
import * as fs from "node:fs";
import * as path from "node:path";
import {Injectable} from "@nestjs/common";
import { exec } from 'child_process';
import { promisify } from 'util';
const execAsync = promisify(exec);
import slugify from 'slugify';
import * as crypto from 'crypto';
import { spawn } from 'child_process';

@Injectable()
export class VideosService {
    constructor(
        @InjectRepository(Video)
        private readonly videoRepo: Repository<Video>,
    ) {}
    async convertToHLS(inputPath: string, outputDir: string, title: string) {
        const safeTitle = slugify(title, { lower: true, strict: true });
        fs.mkdirSync(outputDir, { recursive: true });

        const m3u8Path = path.join(outputDir, `${safeTitle}.m3u8`);
        const cmd = `ffmpeg -i "${inputPath}" -codec: copy -start_number 0 -hls_time 10 -hls_list_size 0 -f hls "${m3u8Path}"`;

        try {
            await execAsync(cmd);
        } catch (error) {
            console.error('FFmpeg conversion failed:', error);
            throw new Error('HLS conversion failed');
        }

    }

    async checkAllChunksExist(title: string, totalChunks: number): Promise<boolean> {
        const safeTitle = slugify(title, { lower: true, strict: true });

        const tempDir = path.resolve(`./storage/temp_chunks/${safeTitle}.mp4`);
        for (let i = 1; i <= totalChunks; i++) {
            if (!fs.existsSync(path.join(tempDir, `chunk_${i}`))) return false;
        }
        return true;
    }
    async findAll(): Promise<Video[]> {
        return this.videoRepo.find({
            order: { createdAt: 'DESC' },
        });
    }

    async mergeChunks(title: string, totalChunks: number): Promise<void> {
        const safeTitle = slugify(title, { lower: true, strict: true });
        const tempDir = path.resolve(`./storage/temp_chunks/${safeTitle}.mp4`);
        const finalPath = path.resolve(`./storage/videos/original/${safeTitle}.mp4`);
        fs.mkdirSync(path.dirname(finalPath), { recursive: true });

        const writeStream = fs.createWriteStream(finalPath);

        for (let i = 1; i <= totalChunks; i++) {
            const chunkPath = path.join(tempDir, `chunk_${i}`);
            const data = fs.readFileSync(chunkPath);
            writeStream.write(data);
            fs.unlinkSync(chunkPath);
        }

        writeStream.end();
        fs.rmdirSync(tempDir, { recursive: true });

        this.convertToHLSInBackground(finalPath, `./storage/videos/hls/${safeTitle}`, safeTitle);

        // ✅ Save to database
        // @ts-ignore
        const hlsPath = `storage/videos/hls/${safeTitle}/${safeTitle}.m3u8`;

        await this.videoRepo.save({
            title,
            originalPath: `storage/videos/original/${safeTitle}.mp4`,
            path: hlsPath, // ✅ سجل مسار m3u8
            uploadTarget: 'local',
            progress: 100,
            status: 'processing',
        });
    }
    convertToHLSInBackground(inputPath: string, outputDir: string, title: string) {
        const safeTitle = slugify(title, { lower: true, strict: true });
        fs.mkdirSync(outputDir, { recursive: true });

        const m3u8Path = path.join(outputDir, `${safeTitle}.m3u8`);
        const ffmpegArgs = [
            '-i', inputPath,
            '-codec:', 'copy',
            '-start_number', '0',
            '-hls_time', '10',
            '-hls_list_size', '0',
            '-f', 'hls',
            m3u8Path
        ];

        const ffmpeg = spawn('ffmpeg', ffmpegArgs, {
            detached: true,
            stdio: 'ignore'
        });

        ffmpeg.unref();

        // You could also create a file like: `${outputDir}/.processing`
        // and remove it later in a simple cron job or status watcher
    }
}
