# HLS Streaming with NestJS

[![CI](https://github.com/Phoenix-H22/hls-streaming-nestjs/actions/workflows/ci.yml/badge.svg)](https://github.com/Phoenix-H22/hls-streaming-nestjs/actions/workflows/ci.yml)

A NestJS service that takes large video uploads in chunks, packages them as HLS with FFmpeg, and serves playback only through short-lived HMAC-signed playlist and segment URLs.

## How it works

1. **Chunked upload** — the upload page (`views/index.ejs`) gives each file a random `uploadId` and posts it in 5 MB chunks to `POST /videos/upload-chunk` with `title`, `chunkNumber` (1-based) and `totalChunks`. Every field is validated before it touches a path, and each upload's chunks live in their own `storage/temp_chunks/<uploadId>/` folder.
2. **Merge** — when the last missing chunk arrives (in any order), the chunks are streamed into `storage/videos/original/<slug>.mp4`. The slug comes from the title and is made unique (`demo`, `demo-2`, …), so reusing a title never overwrites an earlier video.
3. **HLS packaging** — FFmpeg runs with stream copy and 10-second segments, writing `storage/videos/hls/<slug>/<slug>.m3u8` and `<slug><n>.ts`. Its exit code moves the video to `completed` or `failed`, and the stderr tail is logged on failure. Streams are not re-encoded, so the source must already use HLS-compatible codecs (for example H.264/AAC).
4. **Signed playback** — `GET /watch?video=<slug>` renders a Video.js player with a playlist URL valid for 5 minutes. The token is an HMAC-SHA256 of the slug, expiry and client IP.
5. **Segment rewriting** — `GET /secure/<slug>.m3u8` verifies the expiry and token, then rewrites every segment line to `/secure/<slug>/<segment>.ts` with its own token. `GET /secure/<slug>/<segment>.ts` accepts only segment names of that video and verifies the token before streaming.
6. **Recovery** — on startup, rows created before slugs were stored get one, and conversions interrupted by a restart are re-run (or marked `failed` if the source file is gone).

`storage/` is never served statically, so originals and segments are reachable only through the signed routes. Tokens are compared in constant time, and pages send `frame-ancestors 'self'`, `nosniff` and a same-origin referrer policy.

## Stack

NestJS 11 · TypeScript · TypeORM · MySQL · FFmpeg · Multer · class-validator · EJS · Video.js · Jest

## Source map

| Path | Responsibility |
| --- | --- |
| `src/videos/videos.controller.ts` | Video list and chunk upload endpoint |
| `src/videos/upload-chunk.dto.ts` | Upload field validation and size limits |
| `src/videos/videos.service.ts` | Chunk storage, merge, unique slugs, video rows |
| `src/videos/merge-chunks.ts` | Streams chunks into one file and waits for the flush |
| `src/videos/hls-packager.service.ts` | Runs FFmpeg and records the outcome |
| `src/videos/video-recovery.service.ts` | Startup slug backfill and interrupted-conversion recovery |
| `src/streaming/stream-signer.ts` | Token signing, verification and playlist rewriting |
| `src/streaming/stream.controller.ts` | Signed playlist and segment delivery |
| `src/app.controller.ts` | Upload page and watch page |
| `src/storage-paths.ts` | Every on-disk location in one place |
| `views/` | EJS templates for upload and playback |

## Requirements

- Node.js 22 and npm
- MySQL
- FFmpeg on `PATH`

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
| `APP_ORIGIN` | No | — | Public origin (e.g. `https://videos.example.com`); when set, `/secure` requests must come from this app's pages |
| `TRUST_PROXY` | No | `loopback` | Express `trust proxy` value used to read the client IP behind a reverse proxy |
| `PORT` | No | `3006` | HTTP port |

TypeORM `synchronize` is enabled, so the `videos` table is created and updated on start. Switch to migrations before relying on this in production.

## Run

```bash
npm run start:dev    # watch mode
npm run build
npm run start:prod   # runs dist/main
```

Open `http://localhost:3006/` to upload a video and get a watch link.

## Tests

```bash
npm test
npm run lint
```

The unit tests use real files in a temporary folder and need neither MySQL nor FFmpeg. They cover chunk ordering and validation (including path-traversal input), unique slugs, token binding and expiry, playlist rewriting, segment-name checks and the `APP_ORIGIN` Referer check. CI runs lint, build and tests on every push.
