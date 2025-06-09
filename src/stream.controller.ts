// stream.controller.ts
import {
    Controller, Get, Param, Query, Req, Res,
    BadRequestException, NotFoundException
} from '@nestjs/common';
import { Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

@Controller('secure')
export class StreamController {
    // Serve TS chunks (token + expiry + ip)
    @Get(':folder/:chunk')
    streamChunk(
        @Param('folder') folder: string,
        @Param('chunk') chunk: string,
        @Query('expires') expires: string,
        @Query('token') token: string,
        @Req() req: Request,
        @Res() res: Response
    ) {
        const now = Math.floor(Date.now() / 1000);
        if (!expires || !token || now > +expires) {
            throw new BadRequestException('Token expired or invalid');
        }

        // ✅ بدل origin، تحقق من referer لو حبيت (اختياري)
        const referer = req.headers['referer'] || '';
        if (!referer.includes('hls-nest.phoenixtechs.net') && !referer.includes('/watch')) {
            return res.status(403).end();
        }

        const secret = process.env.STREAM_SECRET || 'test';
        const payload = `${folder}/${chunk}|${expires}`;
        const validToken = crypto.createHmac('sha256', secret).update(payload).digest('hex');
        if (token !== validToken) {
            throw new BadRequestException('Invalid token');
        }

        const filePath = path.resolve(`./storage/videos/hls/${folder}/${chunk}`);
        if (!fs.existsSync(filePath)) {
            throw new NotFoundException('Chunk not found');
        }

        res.setHeader('Content-Type', 'video/MP2T');
        return fs.createReadStream(filePath).pipe(res);
    }


    // Serve M3U8 (rewrite TS URLs on-the-fly)
    @Get(':file')
    streamPlaylist(
        @Param('file') file: string,
        @Query('expires') expires: string,
        @Query('token') token: string,
        @Req() req: Request,
        @Res() res: Response
    ) {
        const now = Math.floor(Date.now() / 1000);
        const origin = req.headers['origin'] as string || '';

        // 1) expiry & token
        if (!expires || !token || now > +expires) {
            return res.status(403).end('#EXTM3U\n#EXT-X-ENDLIST');
        }
        // 2) only your domain
        const referer = req.headers['referer'] || '';
        if (!referer.includes('hls-nest.phoenixtechs.net') && !referer.includes('/watch')) {
            return res.status(403).end('#EXTM3U\n#EXT-X-ENDLIST');
        }

        console.log('Referer:', req.headers['referer']);
        console.log('Origin:', req.headers['origin']);


        const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
            || (req.connection as any)?.remoteAddress || '';
        const secret = process.env.STREAM_SECRET || 'test';
        const safeTitle = file.replace('.m3u8', '');
        const filePath = path.resolve(`./storage/videos/hls/${safeTitle}/${safeTitle}.m3u8`);
        if (!fs.existsSync(filePath)) {
            return res.status(404).end('#EXTM3U\n#EXT-X-ENDLIST');
        }

        // 3) verify token
        const playlistPayload = `${safeTitle}|${expires}|${ip}`;
        const validPlaylistToken = crypto.createHmac('sha256', secret)
            .update(playlistPayload).digest('hex');
        if (token !== validPlaylistToken) {
            return res.status(403).end('#EXTM3U\n#EXT-X-ENDLIST');
        }

        // 4) rewrite TS URLs with the same expires & token
        let raw = fs.readFileSync(filePath, 'utf8');
        const secure = raw.split('\n').map(line => {
            if (line.trim().endsWith('.ts')) {
                const chunk = line.trim();
                const chunkPayload = `${safeTitle}/${chunk}|${expires}`;
                const chunkToken = crypto.createHmac('sha256', secret)
                    .update(chunkPayload).digest('hex');
                return `/secure/${safeTitle}/${chunk}?expires=${expires}&token=${chunkToken}`;
            }
            return line;
        }).join('\n');

        res.setHeader('Content-Type', 'application/x-mpegURL');
        return res.end(secure);
    }
}
