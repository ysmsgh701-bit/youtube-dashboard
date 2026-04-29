import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const CHANNEL_IDS: Record<string, string> = {
  ktv: "UCIMOytYIzaUpoAM2bpT4JZQ",   // KTV 국민방송
  natv: "UCL-WOj1FxKR8Hlzg5tvnWKg",  // NATV 국회방송
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() || "";
  const channel = searchParams.get("channel") || "all";
  const order = searchParams.get("order") || "date"; // date | viewCount | relevance

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "YOUTUBE_API_KEY가 설정되지 않았습니다. .env.local을 확인해주세요." },
      { status: 500 }
    );
  }

  // 키워드도 없고 채널도 전체면 기본 검색어 사용
  const finalQuery = q || (channel === "all" ? "KTV 국민방송 OR 국회방송 브리핑" : "");

  const params: Record<string, string> = {
    part: "snippet",
    type: "video",
    maxResults: "12",
    order,
    relevanceLanguage: "ko",
    regionCode: "KR",
    key: apiKey,
  };

  if (finalQuery) params.q = finalQuery;

  // 채널 필터: 특정 채널 ID로 제한
  const channelId = CHANNEL_IDS[channel];
  if (channelId) params.channelId = channelId;

  const res = await fetch(
    `https://www.googleapis.com/youtube/v3/search?${new URLSearchParams(params)}`,
    { cache: "no-store" }
  );
  const data = await res.json();

  if (!res.ok) {
    return NextResponse.json(
      { error: data.error?.message || "YouTube API 오류" },
      { status: res.status }
    );
  }

  const items = (data.items ?? [])
    .filter((item: { id: { videoId?: string } }) => item.id?.videoId)
    .map((item: {
      id: { videoId: string };
      snippet: {
        title: string;
        channelTitle: string;
        publishedAt: string;
        thumbnails: { medium: { url: string } };
      };
    }) => ({
      videoId: item.id.videoId,
      title: item.snippet.title,
      channelTitle: item.snippet.channelTitle,
      publishedAt: item.snippet.publishedAt.slice(0, 10),
      thumbnail: item.snippet.thumbnails.medium.url,
      url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
    }));

  return NextResponse.json({ items });
}
