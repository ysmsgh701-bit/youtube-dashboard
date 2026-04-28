import { NextRequest, NextResponse } from "next/server";
import { analyzeForShorts, generateWeeklyScript, WeeklyItem } from "@/lib/gemini";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;

    if (action === "shorts") {
      const { transcript, videoTitle } = body;
      if (!transcript) return NextResponse.json({ error: "자막이 필요합니다." }, { status: 400 });
      const analysis = await analyzeForShorts(transcript, videoTitle ?? "");
      return NextResponse.json({ analysis });
    }

    if (action === "weekly") {
      const { items } = body as { items: WeeklyItem[] };
      if (!items?.length) return NextResponse.json({ error: "아이템이 필요합니다." }, { status: 400 });
      const script = await generateWeeklyScript(items);
      return NextResponse.json({ script });
    }

    return NextResponse.json({ error: "알 수 없는 action" }, { status: 400 });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "생성 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
