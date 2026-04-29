import { NextRequest, NextResponse } from "next/server";
import { YoutubeTranscript } from "youtube-transcript";

function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
    /^([a-zA-Z0-9_-]{11})$/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();
    if (!url) return NextResponse.json({ error: "URL이 필요합니다." }, { status: 400 });

    const videoId = extractVideoId(url);
    if (!videoId) return NextResponse.json({ error: "유효하지 않은 YouTube URL입니다." }, { status: 400 });

    // 한국어 자막 우선, 없으면 기본 언어로 재시도
    const transcript = await YoutubeTranscript.fetchTranscript(videoId, { lang: "ko" })
      .catch(() => YoutubeTranscript.fetchTranscript(videoId))
      .catch(() => {
        throw new Error(
          "이 영상은 자막이 비활성화되어 있습니다.\n" +
          "KTV/국회방송에서 CC(자막) 버튼이 있는 영상을 선택해주세요."
        );
      });

    // 타임스탬프 포함 텍스트 구성 (Gemini가 시간대를 파악할 수 있도록)
    const timedText = transcript
      .map((t) => {
        const sec = Math.floor(t.offset / 1000);
        const h = String(Math.floor(sec / 3600)).padStart(2, "0");
        const m = String(Math.floor((sec % 3600) / 60)).padStart(2, "0");
        const s = String(sec % 60).padStart(2, "0");
        return `[${h}:${m}:${s}] ${t.text}`;
      })
      .join("\n");

    const plainText = transcript.map((t) => t.text).join(" ");

    return NextResponse.json({ transcript: timedText, plainText, videoId });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "자막 추출 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
