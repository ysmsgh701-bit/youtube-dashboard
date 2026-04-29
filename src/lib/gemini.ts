import { GoogleGenAI } from "@google/genai";

const genai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

export interface ShortsAnalysis {
  startTime: string;
  endTime: string;
  clipScript: string;
  reason: string;
  titles: string[];
  hashtags: string[];
  thumbnailText: string;
  category: "청문회" | "브리핑" | "격돌" | "정책발표" | "기타";
}

export interface WeeklyItem {
  title: string;
  clipScript: string;
  sourceUrl: string;
}

const MODELS = [
  "gemini-2.5-flash",       // 우선 시도 (503이면 다음으로)
  "gemini-2.5-flash-lite",  // 확인된 동작 모델
  "gemini-flash-latest",    // 확인된 동작 모델
  "gemini-2.0-flash",       // fallback
];

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function generate(prompt: string): Promise<string> {
  let lastMsg = "";

  for (const model of MODELS) {
    // 모델당 최대 3번 재시도 (429 rate-limit 대비)
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const response = await genai.models.generateContent({ model, contents: prompt });
        return (response.text ?? "").trim();
      } catch (e: unknown) {
        lastMsg = e instanceof Error ? e.message : String(e);
        const isRetryable =
          lastMsg.includes("503") ||
          lastMsg.includes("UNAVAILABLE") ||
          lastMsg.includes("429") ||
          lastMsg.includes("overloaded") ||
          lastMsg.includes("quota");

        if (!isRetryable) throw e; // 인증오류 등 재시도 불필요

        if (attempt < 3) {
          // 같은 모델 재시도: 2s → 4s 대기
          await sleep(attempt * 2000);
        }
        // 마지막 시도 실패 → 다음 모델로
      }
    }
    // 모델 전환 전 1초 대기
    await sleep(1000);
  }

  throw new Error(
    `Gemini API가 일시적으로 혼잡합니다. 잠시 후 다시 시도해주세요.\n(오류: ${lastMsg.slice(0, 80)})`
  );
}

export async function analyzeForShorts(
  transcript: string,
  videoTitle = ""
): Promise<ShortsAnalysis> {
  const prompt = `당신은 정치/정책 유튜브 쇼츠 전문 편집자입니다.
아래 자막에서 시청자 반응이 가장 폭발적일 구간을 찾아주세요.

⚠️ 중요 규칙:
- startTime과 endTime의 차이는 반드시 55초~65초 사이여야 합니다 (정확히 1분 분량)
- 예: startTime이 00:02:10이면 endTime은 00:03:10~00:03:15 사이

선택 기준:
- 날카로운 질의·응답, 여야 격돌, 팩트 충돌이 일어나는 순간
- 국민 생활과 직결되는 정책 핵심 발표 순간
- "사이다" 발언이나 예상 밖 반전이 있는 순간

영상 제목: ${videoTitle}
자막:
${transcript.slice(0, 6000)}

반드시 JSON만 출력 (마크다운 없이):
{
  "startTime": "HH:MM:SS",
  "endTime": "HH:MM:SS",  ← startTime + 55~65초
  "clipScript": "해당 구간 핵심 발언 2~3문장 요약",
  "reason": "이 구간을 선택한 이유 1문장",
  "titles": ["제목1 (30자 이내, 숫자/충격 포함)", "제목2", "제목3", "제목4", "제목5"],
  "hashtags": ["#정치", "#국회", "#청문회", "#정책", "#쇼츠", "#국정감사", "#여야", "#정부", "#브리핑", "#1분요약"],
  "thumbnailText": "10자이내임팩트문구",
  "category": "청문회 또는 브리핑 또는 격돌 또는 정책발표 또는 기타"
}`;

  const text = await generate(prompt);
  const jsonStr = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  return JSON.parse(jsonStr) as ShortsAnalysis;
}

export async function generateWeeklyScript(items: WeeklyItem[]): Promise<string> {
  const summary = items
    .map((item, i) => `${i + 1}. ${item.title}\n${item.clipScript}`)
    .join("\n\n");

  const prompt = `당신은 정치/정책 유튜브 해설 전문가입니다.
이번 주 주요 이슈 ${items.length}개를 바탕으로 5~7분짜리 주간 요약 해설 대본을 작성해주세요.

작성 가이드:
- 오프닝: 이번 주 핵심 이슈를 한 문장으로 압축하는 훅
- 각 이슈: 배경(30초) → 핵심 발언(1분) → 의미 해설(30초)
- 클로징: 다음 주 주목 포인트 + 구독/좋아요 CTA
- 문체: 짧고 명확한 구어체, ~입니다/~이죠 종결어미

이번 주 이슈:
${summary}

대본만 출력 (제목·설명 없이 바로 시작):`;

  return generate(prompt);
}
