# HLS Streaming with NestJS

A NestJS service that takes large video uploads in chunks, packages them as HLS with FFmpeg, and serves playback through short-lived HMAC-signed playlist and segment URLs.

## How it works

1. **Chunked upload** — the upload page (`views/index.ejs`) splits the file into 5 MB pieces and posts each one to `POST /videos/upload-chunk` with `title`, `chunkNumber` (1-based) and `totalChunks`. Chunks are stored under `storage/temp_chunks/<slug>.mp4/`.
2. **Merge** — once every chunk is present, the service joins them into `storage/videos/original/<slug>.mp4` and saves a `videos` row with status `processing`.
3. **HLS packaging** — FFmpeg runs as a detached background process with stream copy (`-codec: copy`, 10-second segments), writing `storage/videos/hls/<slug>/<slug>.m3u8` and its `.ts` segments. Streams are not re-encoded, so the source must already use HLS-compatible codecs (for example H.264/AAC).
4. **Status tracking** — `VideoStatusScannerService` checks processing videos every 15 seconds and marks them `completed` when the playlist exists.
5. **Signed playback** — `GET /watch?title=<slug>` renders a Video.js player with a playlist URL that expires after 5 minutes. The token is an HMAC-SHA256 of the slug, expiry and client IP.
6. **Segment rewriting** — `GET /secure/<slug>.m3u8` checks the expiry, referer and token, then rewrites every segment line to `/secure/<slug>/<segment>.ts` with its own HMAC token. `GET /secure/:folder/:chunk` verifies that token before streaming the segment.

Responses also send `Content-Security-Policy: frame-ancestors` and `X-Frame-Options: SAMEORIGIN` so pages can only be framed by the same origin and `hls-nest.phoenixtechs.net` (set in `src/main.ts`).

## Stack

NestJS 11 · TypeScript · TypeORM · MySQL · FFmpeg · Multer · EJS · Video.js

## Source map

| Path | Responsibility |
| --- | --- |
| `src/videos/videos.controller.ts` | Video list and chunk upload endpoint |
| `src/videos/videos.service.ts` | Chunk checks, merge, background FFmpeg packaging |
| `src/videos/video.entity.ts` | `videos` table: paths, status, progress |
| `src/stream.controller.ts` | Signed playlist and segment delivery |
| `src/utils/token.ts` | HMAC token generation |
| `src/utils/VideoStatusScannerService.ts` | Marks finished conversions as completed |
| `src/app.controller.ts` | Upload page and watch page |
| `views/` | EJS templates for upload and playback |

## Requirements

- Node.js and npm
- MySQL
- FFmpeg available on `PATH`

## Setup

```bash
npm install
cp .env.example .env
```

Fill in `.env`. The app refuses to start if `DB_USERNAME`, `DB_PASSWORD`, `DB_DATABASE` or `STREAM_SECRET` is missing.

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `DB_HOST` | No | `localhost` | MySQL host |
| `DB_PORT` | No | `3306` | MySQL port |
| `DB_USERNAME` | Yes | — | MySQL user |
| `DB_PASSWORD` | Yes | — | MySQL password |
| `DB_DATABASE` | Yes | — | MySQL database |
| `STREAM_SECRET` | Yes | — | HMAC key for playback tokens |

TypeORM `synchronize` is enabled, so the `videos` table is created on first start. Turn it off and use migrations before relying on this in production.

## Run

```bash
npm run start:dev    # watch mode
npm run build
npm run start:prod   # runs dist/main
```

The server listens on port `3006`. Open `http://localhost:3006/` to upload a video and get a watch link.
