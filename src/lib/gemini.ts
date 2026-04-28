import { GoogleGenerativeAI } from "@google/generative-ai";

const genai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

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

export async function analyzeForShorts(
  transcript: string,
  videoTitle = ""
): Promise<ShortsAnalysis> {
  const model = genai.getGenerativeModel({ model: "gemini-1.5-flash" });

  const prompt = `당신은 정치/정책 유튜브 쇼츠 전문 편집자입니다.
아래 자막에서 시청자 반응이 가장 폭발적일 1분 구간을 찾아주세요.

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
  "endTime": "HH:MM:SS",
  "clipScript": "해당 구간 핵심 발언 2~3문장 요약",
  "reason": "이 구간을 선택한 이유 1문장",
  "titles": ["제목1 (30자 이내, 숫자/충격 포함)", "제목2", "제목3", "제목4", "제목5"],
  "hashtags": ["#정치", "#국회", "#청문회", "#정책", "#쇼츠", "#국정감사", "#여야", "#정부", "#브리핑", "#1분요약"],
  "thumbnailText": "10자이내임팩트문구",
  "category": "청문회 또는 브리핑 또는 격돌 또는 정책발표 또는 기타"
}`;

  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();
  const jsonStr = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  return JSON.parse(jsonStr) as ShortsAnalysis;
}

export async function generateWeeklyScript(items: WeeklyItem[]): Promise<string> {
  const model = genai.getGenerativeModel({ model: "gemini-1.5-flash" });

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

  const result = await model.generateContent(prompt);
  return result.response.text().trim();
}
