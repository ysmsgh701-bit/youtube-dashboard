import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";
import os from "os";
import fs from "fs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 180;

// ─── 경로 헬퍼 ───
const FFMPEG_PATH = (() => {
  const candidates = [
    // winget 설치 경로
    path.join(os.homedir(), "AppData", "Local", "Microsoft", "WinGet", "Packages",
      "yt-dlp.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe",
      "ffmpeg-N-123778-g3b55818764-win64-gpl", "bin", "ffmpeg.exe"),
    path.join(process.cwd(), "bin", "ffmpeg.exe"),
    "ffmpeg",
  ];
  return candidates.find((p) => p === "ffmpeg" || fs.existsSync(p)) ?? "ffmpeg";
})();

// yt-dlp --ffmpeg-location은 디렉토리를 받아야 ffprobe도 찾을 수 있음
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
function secToSRT(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.round((sec - Math.floor(sec)) * 1000);
  return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")},${String(ms).padStart(3,"0")}`;
}

// ─── SRT 생성 (클립 구간의 자막만, 상대 시간으로) ───
function buildSRT(timedText: string, clipStartSec: number, clipEndSec: number): string {
  const lines = timedText.split("\n").flatMap((line) => {
    const m = line.match(/\[(\d{2}:\d{2}:\d{2})\] (.+)/);
    if (!m || !m[2].trim()) return [];
    return [{ sec: timeToSec(m[1]), text: m[2].trim() }];
  });

  const clip = lines.filter((l) => l.sec >= clipStartSec - 1 && l.sec <= clipEndSec + 1);
  let srt = "";
  let idx = 1;
  for (let i = 0; i < clip.length; i++) {
    const relStart = Math.max(0, clip[i].sec - clipStartSec);
    const relEnd = clip[i + 1]
      ? Math.min(clipEndSec - clipStartSec, clip[i + 1].sec - clipStartSec)
      : relStart + 3;
    if (relEnd <= relStart) continue;
    srt += `${idx++}\n${secToSRT(relStart)} --> ${secToSRT(relEnd)}\n${clip[i].text}\n\n`;
  }
  return srt;
}

// ─── ffmpeg 필터용 경로 이스케이프 ───
// subtitles 필터: 백슬래시→슬래시, 드라이브 콜론은 \\: 로 이스케이프
function escapePath(p: string): string {
  return p.replace(/\\/g, "/").replace(/^([A-Za-z]):/, "$1\\:");
}
// drawtext의 fontfile: 백슬래시→슬래시, 드라이브 콜론 이스케이프
function escapeFontPath(p: string): string {
  return p.replace(/\\/g, "/").replace(/^([A-Za-z]):/, "$1\\:");
}
function escapeText(t: string): string {
  return t.replace(/\\/g, "\\\\").replace(/’/g, "\\’").replace(/:/g, "\\:");
}

// ─── API Route ───
export async function POST(req: NextRequest) {
  const tmpFiles: string[] = [];

  try {
    const { videoId, startTime, endTime, title, transcript, thumbnailText } = await req.json();
    if (!videoId || !startTime || !endTime) {
      return NextResponse.json({ error: "videoId, startTime, endTime가 필요합니다." }, { status: 400 });
    }

    // 클립 길이 보정 (55초 미만이면 60초로 확장)
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
    const srtFile = path.join(clipsDir, `${safeTitle}_${timeTag}.srt`);
    const thumbRaw = path.join(clipsDir, `${safeTitle}_${timeTag}_thumb_raw.jpg`);
    const thumbFinal = path.join(clipsDir, `${safeTitle}_${timeTag}_thumb.jpg`);
    tmpFiles.push(rawVideo, srtFile, thumbRaw);

    // ── STEP 1: 클립 다운로드 ──
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
      return NextResponse.json({ error: `다운로드 실패: ${dlResult.stderr.slice(0, 300)}` }, { status: 500 });
    }

    // ── STEP 2: 자막 소각 ──
    let videoPath = rawVideo;
    let subLog = "";
    if (transcript) {
      const srtContent = buildSRT(transcript, startSec, endSec);
      if (srtContent.trim()) {
        fs.writeFileSync(srtFile, srtContent, "utf8");

        // subtitles 필터: Windows 경로 이스케이프 (드라이브 콜론 → \\:)
        const escapedSrt = escapePath(srtFile);
        const subStyle = [
          "FontName=Malgun Gothic Bold",
          "FontSize=20",
          "Bold=1",
          "PrimaryColour=&H00FFFFFF",
          "OutlineColour=&H00000000",
          "Outline=2",
          "Alignment=2",
          "MarginV=30",
        ].join(",");

        const subsFilter = `subtitles='${escapedSrt}':force_style='${subStyle}'`;
        const subResult = await run(FFMPEG_PATH, [
          "-i", rawVideo,
          "-vf", subsFilter,
          "-c:a", "copy",
          "-y", finalVideo,
        ]);
        if (subResult.ok) {
          videoPath = finalVideo;
          subLog = "자막소각OK";
        } else {
          subLog = `자막소각실패: ${subResult.stderr.slice(0, 200)}`;
          fs.copyFileSync(rawVideo, finalVideo);
          videoPath = finalVideo;
        }
      } else {
        subLog = "SRT없음(자막라인0)";
        fs.copyFileSync(rawVideo, finalVideo);
        videoPath = finalVideo;
      }
    } else {
      subLog = "transcript없음";
      fs.copyFileSync(rawVideo, finalVideo);
      videoPath = finalVideo;
    }

    // ── STEP 3: 썸네일 프레임 추출 (클립 시작 후 10초 지점) ──
    const thumbTimeSec = Math.min(10, (endSec - startSec) / 2);
    const thumbTime = secToTime(thumbTimeSec);

    await run(FFMPEG_PATH, [
      "-ss", thumbTime,
      "-i", videoPath,
      "-frames:v", "1",
      "-q:v", "2",
      "-y", thumbRaw,
    ]);

    // ── STEP 4: 썸네일에 텍스트 오버레이 ──
    let finalThumb = thumbRaw;
    const fontExists = fs.existsSync("C:/Windows/Fonts/malgunbd.ttf");

    if (thumbnailText && fontExists && fs.existsSync(thumbRaw)) {
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
        tmpFiles.push(thumbRaw); // 텍스트 없는 원본 삭제
      }
    } else if (fs.existsSync(thumbRaw)) {
      fs.copyFileSync(thumbRaw, thumbFinal);
      finalThumb = thumbFinal;
    }

    // ── 임시 파일 정리 ──
    for (const f of tmpFiles) {
      if (fs.existsSync(f)) {
        try { fs.unlinkSync(f); } catch { /* ignore */ }
      }
    }

    return NextResponse.json({
      success: true,
      videoPath: finalVideo,
      thumbnailPath: fs.existsSync(finalThumb) ? finalThumb : null,
      debug: subLog,
    });
  } catch (e: unknown) {
    for (const f of tmpFiles) {
      if (fs.existsSync(f)) try { fs.unlinkSync(f); } catch { /* ignore */ }
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "처리 오류" },
      { status: 500 }
    );
  }
}
