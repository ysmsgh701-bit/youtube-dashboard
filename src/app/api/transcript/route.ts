import { NextRequest, NextResponse } from "next/server";
import https from "https";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// ─── YouTube InnerTube API로 직접 자막 가져오기 (Next.js fetch 패치 완전 우회) ───

const INNERTUBE_API_URL = "www.youtube.com";
const INNERTUBE_PATH = "/youtubei/v1/player?prettyPrint=false";
const INNERTUBE_CLIENT_VERSION = "20.10.38";
const RE_CLASSIC = /<text start="([^"]*)" dur="([^"]*)">([^<]*)<\/text>/g;
const RE_SRV3_P = /<p t="(\d+)"(?:\s+d="(\d+)")?[^>]*>([\s\S]*?)<\/p>/g;
const RE_SRV3_S = /<s[^>]*>([^<]*)<\/s>/g;

function httpsPost(hostname: string, path: string, body: string, headers: Record<string, string>): Promise<string> {
  return new Promise((resolve, reject) => {
    const data = Buffer.from(body, "utf-8");
    const req = https.request(
      { hostname, path, method: "POST", headers: { ...headers, "Content-Length": data.length } },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
      }
    );
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

function httpsGet(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { "User-Agent": "Mozilla/5.0" } }, (res) => {
      // 리다이렉트 처리
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return httpsGet(res.headers.location).then(resolve).catch(reject);
      }
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    }).on("error", reject);
  });
}

interface TranscriptItem {
  text: string;
  offset: number;
  duration: number;
}

async function fetchTranscript(videoId: string): Promise<TranscriptItem[]> {
  // 1단계: InnerTube API로 captionTracks 가져오기
  const body = JSON.stringify({
    context: { client: { clientName: "ANDROID", clientVersion: INNERTUBE_CLIENT_VERSION } },
    videoId,
  });
  const raw = await httpsPost(INNERTUBE_API_URL, INNERTUBE_PATH, body, {
    "Content-Type": "application/json",
    "User-Agent": `com.google.android.youtube/${INNERTUBE_CLIENT_VERSION} (Linux; U; Android 14)`,
  });

  let captionTracks: { baseUrl: string; languageCode: string }[] = [];
  try {
    const data = JSON.parse(raw);
    captionTracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
  } catch {
    // InnerTube 파싱 실패 → 빈 배열 유지
  }

  if (captionTracks.length === 0) {
    throw new Error("이 영상은 자막이 비활성화되어 있습니다.\nCC(자막) 버튼이 있는 영상을 선택해주세요.");
  }

  // 2단계: ko 우선, 없으면 첫 번째 트랙
  const track =
    captionTracks.find((t) => t.languageCode === "ko") ??
    captionTracks.find((t) => t.languageCode === "ko-KR") ??
    captionTracks[0];

  // 3단계: 자막 XML 다운로드 및 파싱
  const xmlText = await httpsGet(track.baseUrl);
  const results: TranscriptItem[] = [];

  function decodeEntities(s: string) {
    return s
      .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
      .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
      .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)));
  }

  // srv3 포맷: <p t="ms" d="ms"><s>text</s></p>
  if (xmlText.includes('format="3"') || xmlText.includes("<p t=")) {
    RE_SRV3_P.lastIndex = 0;
    let pm: RegExpExecArray | null;
    while ((pm = RE_SRV3_P.exec(xmlText)) !== null) {
      const offsetMs = parseInt(pm[1], 10);
      const durMs = pm[2] ? parseInt(pm[2], 10) : 0;
      const inner = pm[3];
      // <s> 태그에서 텍스트 추출
      RE_SRV3_S.lastIndex = 0;
      let sm: RegExpExecArray | null;
      let text = "";
      while ((sm = RE_SRV3_S.exec(inner)) !== null) text += sm[1];
      if (!text) text = inner.replace(/<[^>]+>/g, "");
      text = decodeEntities(text).trim();
      if (text) results.push({ text, offset: offsetMs, duration: durMs });
    }
  } else {
    // classic 포맷: <text start="s" dur="s">text</text>
    RE_CLASSIC.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = RE_CLASSIC.exec(xmlText)) !== null) {
      results.push({
        offset: parseFloat(m[1]) * 1000,
        duration: parseFloat(m[2]) * 1000,
        text: decodeEntities(m[3]).trim(),
      });
    }
  }
  return results;
}

// ─── URL → videoId 파싱 ───

function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
    /^([a-zA-Z0-9_-]{11})$/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

// ─── API Route ───

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();
    if (!url) return NextResponse.json({ error: "URL이 필요합니다." }, { status: 400 });

    const videoId = extractVideoId(url);
    if (!videoId) return NextResponse.json({ error: "유효하지 않은 YouTube URL입니다." }, { status: 400 });

    const transcript = await fetchTranscript(videoId);

    if (!transcript.length) {
      return NextResponse.json(
        { error: "자막을 가져왔지만 내용이 비어 있습니다. 다른 영상을 시도해주세요." },
        { status: 500 }
      );
    }

    // 타임스탬프 포함 텍스트 (Gemini용)
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
