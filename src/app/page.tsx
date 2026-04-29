"use client";

import { useState } from "react";
import URLInput from "@/components/URLInput";
import SearchBar from "@/components/SearchBar";
import ShortsResult from "@/components/ChapterCard";
import { ShortsAnalysis } from "@/lib/gemini";

interface ResultItem {
  analysis: ShortsAnalysis;
  sourceUrl: string;
}

interface WeeklyItem {
  title: string;
  clipScript: string;
  sourceUrl: string;
}

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState<ResultItem[]>([]);
  const [weeklyItems, setWeeklyItems] = useState<WeeklyItem[]>([]);
  const [weeklyScript, setWeeklyScript] = useState("");
  const [loadingWeekly, setLoadingWeekly] = useState(false);

  async function analyzeUrl(url: string) {
    setError("");
    setLoading(true);
    try {
      // 1. 자막 추출
      const tRes = await fetch("/api/transcript", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const tData = await tRes.json();
      if (!tRes.ok) throw new Error(tData.error);

      // 2. Gemini 분석
      await handleResult(tData.transcript, tData.videoId, url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "분석 실패");
      setLoading(false);
    }
  }

  async function handleResult(transcript: string, videoId: string, url: string) {
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "shorts", transcript, videoTitle: videoId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResults((prev) => [{ analysis: data.analysis, sourceUrl: url }, ...prev]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "분석 실패");
    } finally {
      setLoading(false);
    }
  }

  function handleAddToWeekly(item: WeeklyItem) {
    setWeeklyItems((prev) => {
      if (prev.some((w) => w.sourceUrl === item.sourceUrl)) return prev;
      return [...prev, item];
    });
  }

  async function generateWeekly() {
    if (!weeklyItems.length) return;
    setLoadingWeekly(true);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "weekly", items: weeklyItems }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setWeeklyScript(data.script);
    } catch (e) {
      alert(e instanceof Error ? e.message : "주간 대본 생성 실패");
    } finally {
      setLoadingWeekly(false);
    }
  }

  function downloadTxt(content: string, filename: string) {
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* 헤더 */}
      <header className="border-b border-gray-800 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white">유튜브 요약 대시보드</h1>
            <p className="text-xs text-gray-500 mt-0.5">
              YouTube URL 검색 → 자막 추출 → 최고 클립 구간 + 제목 / 해시태그 + 구간 자동 다운로드
            </p>
          </div>
          {weeklyItems.length > 0 && (
            <span className="text-xs bg-blue-900/40 text-blue-400 border border-blue-700 px-3 py-1 rounded-full">
              주간 {weeklyItems.length}개 수집됨
            </span>
          )}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-6">

        {/* 검색 */}
        <SearchBar onSelect={analyzeUrl} loading={loading} />

        {/* URL 직접 입력 */}
        <URLInput onResult={handleResult} loading={loading} />

        {/* 에러 */}
        {error && (
          <div className="bg-red-900/30 border border-red-800 rounded-2xl p-4">
            <p className="text-red-400 text-sm whitespace-pre-line">{error}</p>
          </div>
        )}

        {/* 로딩 */}
        {loading && (
          <div className="text-center py-10">
            <div className="inline-block w-7 h-7 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mb-3" />
            <p className="text-gray-400 text-sm">자막 분석 중... 최고 클립 구간을 찾고 있습니다.</p>
          </div>
        )}

        {/* 분석 결과 카드 */}
        {results.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-semibold text-white">STEP 2 — 클립 검수 및 편집 준비</h2>
                <p className="text-xs text-gray-500 mt-1">
                  클립 다운로드 버튼으로 해당 구간을 바로 저장하거나, 타임코드를 복사해 CapCut/Vrew에서 사용하세요.
                </p>
              </div>
            </div>
            <div className="space-y-4">
              {results.map((item, i) => (
                <ShortsResult
                  key={i}
                  analysis={item.analysis}
                  sourceUrl={item.sourceUrl}
                  onAddToWeekly={handleAddToWeekly}
                />
              ))}
            </div>
          </div>
        )}

        {/* 주간 요약 섹션 */}
        {weeklyItems.length > 0 && (
          <div className="bg-gray-900 rounded-2xl border border-gray-800 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-white">주간 요약 (미드폼용)</h2>
                <p className="text-xs text-gray-500 mt-1">
                  수집된 {weeklyItems.length}개 이슈로 5~7분 해설 대본을 생성합니다.
                </p>
              </div>
              <button
                onClick={generateWeekly}
                disabled={loadingWeekly}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm rounded-xl transition-colors"
              >
                {loadingWeekly ? "생성 중..." : "주간 대본 생성"}
              </button>
            </div>

            <div className="space-y-2">
              {weeklyItems.map((item, i) => (
                <div key={i} className="flex items-start gap-3 bg-gray-800 rounded-xl p-3">
                  <span className="text-xs text-gray-500 mt-0.5 w-4 shrink-0">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">{item.title}</p>
                    <p className="text-xs text-gray-500 mt-0.5 truncate">{item.sourceUrl}</p>
                  </div>
                  <button
                    onClick={() => setWeeklyItems((prev) => prev.filter((_, idx) => idx !== i))}
                    className="text-xs text-gray-600 hover:text-red-400 transition-colors shrink-0"
                  >
                    삭제
                  </button>
                </div>
              ))}
            </div>

            {weeklyScript && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold text-green-400 uppercase tracking-widest">
                    주간 해설 대본
                  </label>
                  <button
                    onClick={() => downloadTxt(weeklyScript, "weekly_script.txt")}
                    className="text-xs text-green-400 hover:text-green-300 transition-colors"
                  >
                    다운로드
                  </button>
                </div>
                <textarea
                  className="w-full bg-gray-800 text-gray-200 rounded-xl px-4 py-3 text-xs leading-relaxed border border-gray-700 focus:border-green-500 focus:outline-none resize-y"
                  rows={12}
                  value={weeklyScript}
                  onChange={(e) => setWeeklyScript(e.target.value)}
                />
              </div>
            )}
          </div>
        )}

        {/* 편집 가이드 */}
        {results.length > 0 && (
          <div className="bg-gray-900 rounded-2xl border border-gray-800 p-5">
            <h3 className="text-xs font-bold text-white uppercase tracking-widest mb-3">편집 가이드</h3>
            <div className="space-y-2 text-xs text-gray-400 leading-relaxed">
              <p>
                <span className="text-green-400 font-medium">1. 클립 저장</span>
                {" — "}⬇ 클립 다운로드 버튼 클릭 → ~/Downloads/clips/ 폴더에 mp4 자동 저장
              </p>
              <p>
                <span className="text-blue-400 font-medium">2. 컷 편집</span>
                {" — "}CapCut 또는 Vrew에서 저장된 mp4 파일 불러오기
              </p>
              <p>
                <span className="text-yellow-400 font-medium">3. 썸네일</span>
                {" — "}썸네일 텍스트 복사 → 캔바 또는 미리캔버스 뉴스 템플릿에 붙여넣기
              </p>
              <p>
                <span className="text-purple-400 font-medium">4. 업로드</span>
                {" — "}선택한 제목 + 해시태그 복사 → YouTube Studio 업로드
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
