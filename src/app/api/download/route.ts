import { NextRequest } from "next/server";
import { spawn } from "child_process";
import path from "path";
import os from "os";
import fs from "fs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

// ─── 경로 헬퍼 ───
const FFMPEG_PATH = (() => {
  const candidates = [
    path.join(os.homedir(), "AppData", "Local", "Microsoft", "WinGet", "Packages",
      "yt-dlp.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe",
      "ffmpeg-N-123778-g3b55818764-win64-gpl", "bin", "ffmpeg.exe"),
    path.join(process.cwd(), "bin", "ffmpeg.exe"),
    "ffmpeg",
  ];
  return candidates.find((p) => p === "ffmpeg" || fs.existsSync(p)) ?? "ffmpeg";
})();

const FFMPEG_DIR = FFMPEG_PATH === "ffmpeg" ? "ffmpeg" : path.dirname(FFMPEG_PATH);

const YTDLP_PATH = (() => {
  const candidates = [
    path.join(process.cwd(), "bin", "yt-dlp.exe"),
    path.join(os.homedir(), "AppData", "Local", "Microsoft", "WinGet", "Links", "yt-dlp.exe"),
    "yt-dlp",
  ];
  return candidates.find((p) => p === "yt-dlp" || fs.existsSync(p)) ?? "yt-dlp";
})();

const DENO_PATH = (() => {
  const p = path.join(process.cwd(), "bin", "deno.exe");
  return fs.existsSync(p) ? p : "deno";
})();

const KOREAN_FONT = "C:/Windows/Fonts/malgunbd.ttf";

// ─── 프로세스 실행 ───
function run(cmd: string, args: string[]): Promise<{ ok: boolean; stderr: string }> {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args);
    let stderr = "";
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("close", (code) => resolve({ ok: code === 0, stderr }));
    proc.on("error", (e) => resolve({ ok: false, stderr: e.message }));
  });
}

// ─── 시간 변환 ───
function timeToSec(t: string): number {
  const [h, m, s] = t.split(":").map(Number);
  return h * 3600 + m * 60 + s;
}
function secToTime(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

// ─── ffmpeg 필터용 이스케이프 ───
function escapeFontPath(p: string): string {
  return p.replace(/\\/g, "/").replace(/^([A-Za-z]):/, "$1\\:");
}
function escapeText(t: string): string {
  return t.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/:/g, "\\:");
}

// ─── SSE 이벤트 타입 ───
type SSEEvent =
  | { type: "progress"; step: number; total: number; message: string }
  | { type: "done"; videoPath: string; thumbnailPath: string | null }
  | { type: "error"; message: string };

// ─── API Route (스트리밍) ───
export async function POST(req: NextRequest) {
  const { videoId, startTime, endTime, title, thumbnailText } = await req.json();

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (ev: SSEEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(ev)}\n\n`));
      };

      const tmpFiles: string[] = [];
      try {
        if (!videoId || !startTime || !endTime) {
          send({ type: "error", message: "videoId, startTime, endTime가 필요합니다." });
          controller.close();
          return;
        }

        const startSec = timeToSec(startTime);
        let endSec = timeToSec(endTime);
        if (endSec - startSec < 55) endSec = startSec + 60;
        const adjustedEnd = secToTime(endSec);

        const clipsDir = path.join(os.homedir(), "Downloads", "clips");
        if (!fs.existsSync(clipsDir)) fs.mkdirSync(clipsDir, { recursive: true });

        const safeTitle = (title || videoId).replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, "_").slice(0, 40);
        const timeTag = `${startTime.replace(/:/g, "")}-${adjustedEnd.replace(/:/g, "")}`;
        const url = `https://www.youtube.com/watch?v=${videoId}`;

        const rawVideo = path.join(clipsDir, `${safeTitle}_${timeTag}_raw.mp4`);
        const finalVideo = path.join(clipsDir, `${safeTitle}_${timeTag}.mp4`);
        const thumbRaw = path.join(clipsDir, `${safeTitle}_${timeTag}_thumb_raw.jpg`);
        const thumbFinal = path.join(clipsDir, `${safeTitle}_${timeTag}_thumb.jpg`);
        tmpFiles.push(rawVideo, thumbRaw);

        // STEP 1: 다운로드
        send({ type: "progress", step: 1, total: 3, message: "📥 영상 다운로드 중... (1~2분 소요)" });
        const dlResult = await run(YTDLP_PATH, [
          url,
          "--download-sections", `*${startTime}-${adjustedEnd}`,
          "--merge-output-format", "mp4",
          "--force-keyframes-at-cuts",
          "--ffmpeg-location", FFMPEG_DIR,
          "--js-runtimes", DENO_PATH !== "deno" ? `deno:${DENO_PATH}` : "deno",
          "-o", rawVideo,
          "--no-playlist",
          "-q",
        ]);
        if (!dlResult.ok) {
          send({ type: "error", message: `다운로드 실패: ${dlResult.stderr.slice(0, 300)}` });
          controller.close();
          return;
        }
        fs.copyFileSync(rawVideo, finalVideo);

        // STEP 2: 썸네일 추출
        send({ type: "progress", step: 2, total: 3, message: "🖼 썸네일 프레임 추출 중..." });
        const thumbTimeSec = Math.min(10, (endSec - startSec) / 2);
        await run(FFMPEG_PATH, [
          "-ss", secToTime(thumbTimeSec),
          "-i", finalVideo,
          "-frames:v", "1",
          "-q:v", "2",
          "-y", thumbRaw,
        ]);

        // STEP 3: 썸네일 텍스트 오버레이
        let finalThumb = thumbRaw;
        const fontExists = fs.existsSync("C:/Windows/Fonts/malgunbd.ttf");

        if (thumbnailText && fontExists && fs.existsSync(thumbRaw)) {
          send({ type: "progress", step: 3, total: 3, message: "✏️ 썸네일 텍스트 합성 중..." });
          const text = escapeText(thumbnailText);
          const drawFilter = [
            `drawtext=fontfile='${escapeFontPath(KOREAN_FONT)}'`,
            `text='${text}'`,
            `fontcolor=white`,
            `fontsize=72`,
            `bold=1`,
            `x=(w-text_w)/2`,
            `y=h-text_h-60`,
            `shadowcolor=black`,
            `shadowx=3`,
            `shadowy=3`,
          ].join(":");

          const thumbResult = await run(FFMPEG_PATH, [
            "-i", thumbRaw,
            "-vf", drawFilter,
            "-q:v", "2",
            "-y", thumbFinal,
          ]);
          if (thumbResult.ok) {
            finalThumb = thumbFinal;
            tmpFiles.push(thumbRaw);
          }
        } else if (fs.existsSync(thumbRaw)) {
          fs.copyFileSync(thumbRaw, thumbFinal);
          finalThumb = thumbFinal;
        }

        // 임시 파일 정리
        for (const f of tmpFiles) {
          if (fs.existsSync(f)) try { fs.unlinkSync(f); } catch { /* ignore */ }
        }

        send({
          type: "done",
          videoPath: finalVideo,
          thumbnailPath: fs.existsSync(finalThumb) ? finalThumb : null,
        });
      } catch (e: unknown) {
        for (const f of tmpFiles) {
          if (fs.existsSync(f)) try { fs.unlinkSync(f); } catch { /* ignore */ }
        }
        send({ type: "error", message: e instanceof Error ? e.message : "처리 오류" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
