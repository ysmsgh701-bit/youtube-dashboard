import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";
import os from "os";
import fs from "fs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120; // 2분 타임아웃

function runYtDlp(args: string[]): Promise<{ ok: boolean; stderr: string }> {
  return new Promise((resolve) => {
    // winget 설치 경로 우선 시도, 없으면 PATH에서 찾기
    const candidates = [
      path.join(os.homedir(), "AppData", "Local", "Microsoft", "WinGet", "Links", "yt-dlp.exe"),
      "yt-dlp",
    ];

    function tryNext(i: number) {
      if (i >= candidates.length) {
        resolve({ ok: false, stderr: "yt-dlp를 찾을 수 없습니다. 설치 후 터미널을 재시작해주세요." });
        return;
      }
      const proc = spawn(candidates[i], args, { shell: true });
      let stderr = "";
      proc.stderr.on("data", (d) => (stderr += d.toString()));
      proc.on("close", (code) => resolve({ ok: code === 0, stderr }));
      proc.on("error", () => tryNext(i + 1));
    }
    tryNext(0);
  });
}

export async function POST(req: NextRequest) {
  try {
    const { videoId, startTime, endTime, title } = await req.json();
    if (!videoId || !startTime || !endTime) {
      return NextResponse.json({ error: "videoId, startTime, endTime가 필요합니다." }, { status: 400 });
    }

    // 저장 폴더: ~/Downloads/clips/
    const clipsDir = path.join(os.homedir(), "Downloads", "clips");
    if (!fs.existsSync(clipsDir)) fs.mkdirSync(clipsDir, { recursive: true });

    const safeTitle = (title || videoId)
      .replace(/[\\/:*?"<>|]/g, "_")
      .replace(/\s+/g, "_")
      .slice(0, 40);
    const timeTag = `${startTime.replace(/:/g, "")}-${endTime.replace(/:/g, "")}`;
    const outputFile = path.join(clipsDir, `${safeTitle}_${timeTag}.mp4`);

    const url = `https://www.youtube.com/watch?v=${videoId}`;

    const { ok, stderr } = await runYtDlp([
      url,
      "--download-sections", `*${startTime}-${endTime}`,
      "--merge-output-format", "mp4",
      "--force-keyframes-at-cuts",
      "-o", outputFile,
      "--no-playlist",
      "-q",
    ]);

    if (!ok) {
      return NextResponse.json(
        { error: `다운로드 실패: ${stderr.slice(0, 300) || "알 수 없는 오류"}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, path: outputFile });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "다운로드 오류" },
      { status: 500 }
    );
  }
}
