"use client";

import { useState } from "react";
import { ShortsAnalysis } from "@/lib/gemini";

const CATEGORY_COLOR: Record<string, string> = {
  청문회: "text-red-400 bg-red-900/30",
  격돌: "text-orange-400 bg-orange-900/30",
  브리핑: "text-blue-400 bg-blue-900/30",
  정책발표: "text-green-400 bg-green-900/30",
  기타: "text-gray-400 bg-gray-800",
};

interface Props {
  analysis: ShortsAnalysis;
  sourceUrl: string;
  onAddToWeekly: (item: { title: string; clipScript: string; sourceUrl: string }) => void;
}

export default function ShortsResult({ analysis, sourceUrl, onAddToWeekly }: Props) {
  const [selectedTitle, setSelectedTitle] = useState(0);
  const [editedScript, setEditedScript] = useState(analysis.clipScript);
  const [editedThumbnail, setEditedThumbnail] = useState(analysis.thumbnailText);
  const [copied, setCopied] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadMsg, setDownloadMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  }

  async function downloadClip() {
    setDownloading(true);
    setDownloadMsg(null);
    // sourceUrl에서 videoId 추출
    const match = sourceUrl.match(/[?&]v=([^&]+)/);
    const videoId = match?.[1];
    if (!videoId) {
      setDownloadMsg({ ok: false, text: "영상 ID를 찾을 수 없습니다." });
      setDownloading(false);
      return;
    }
    try {
      const res = await fetch("/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoId,
          startTime: analysis.startTime,
          endTime: analysis.endTime,
          title: analysis.titles[selectedTitle],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setDownloadMsg({ ok: true, text: `저장됨: ${data.path}` });
    } catch (e) {
      setDownloadMsg({ ok: false, text: e instanceof Error ? e.message : "다운로드 실패" });
    } finally {
      setDownloading(false);
    }
  }

  const colorClass = CATEGORY_COLOR[analysis.category] ?? CATEGORY_COLOR["기타"];

  return (
    <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${colorClass}`}>
          {analysis.category}
        </span>
        <span className="text-xs text-gray-600 font-mono">
          {analysis.startTime} → {analysis.endTime}
        </span>
      </div>

      <div className="p-5 space-y-5">
        {/* 추천 이유 */}
        <div className="bg-gray-800/50 rounded-xl p-3">
          <p className="text-xs text-gray-400 leading-relaxed">
            <span className="text-yellow-400 font-medium">추천 이유: </span>
            {analysis.reason}
          </p>
        </div>

        {/* 타임코드 복사 */}
        <div>
          <label className="text-xs font-bold text-blue-400 uppercase tracking-widest block mb-2">
            편집 구간 (CapCut / Vrew용)
          </label>
          <div className="flex items-center gap-2 bg-gray-800 rounded-xl px-4 py-3">
            <span className="text-white font-mono text-sm flex-1">
              {analysis.startTime} ~ {analysis.endTime}
            </span>
            <button
              onClick={() => copy(`${analysis.startTime} ~ ${analysis.endTime}`, "time")}
              className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
            >
              {copied === "time" ? "복사됨!" : "복사"}
            </button>
          </div>
        </div>

        {/* 핵심 대본 */}
        <div>
          <label className="text-xs font-bold text-green-400 uppercase tracking-widest block mb-2">
            핵심 발언 요약
          </label>
          <textarea
            className="w-full bg-gray-800 text-gray-200 rounded-xl px-4 py-3 text-xs leading-relaxed border border-gray-700 focus:border-green-500 focus:outline-none resize-none"
            rows={3}
            value={editedScript}
            onChange={(e) => setEditedScript(e.target.value)}
          />
        </div>

        {/* 제목 5개 선택 */}
        <div>
          <label className="text-xs font-bold text-purple-400 uppercase tracking-widest block mb-2">
            제목 선택 (클릭하여 선택 → 복사)
          </label>
          <div className="space-y-2">
            {analysis.titles.map((title, i) => (
              <div
                key={i}
                onClick={() => setSelectedTitle(i)}
                className={`flex items-center justify-between px-4 py-2.5 rounded-xl cursor-pointer transition-colors text-sm
                  ${selectedTitle === i
                    ? "bg-purple-900/40 border border-purple-600 text-white"
                    : "bg-gray-800 border border-transparent text-gray-300 hover:bg-gray-750"
                  }`}
              >
                <span className="flex-1">{title}</span>
                {selectedTitle === i && (
                  <button
                    onClick={(e) => { e.stopPropagation(); copy(title, `title${i}`); }}
                    className="text-xs text-purple-400 hover:text-purple-300 ml-3 whitespace-nowrap"
                  >
                    {copied === `title${i}` ? "복사됨!" : "복사"}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* 해시태그 */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-bold text-cyan-400 uppercase tracking-widest">
              해시태그
            </label>
            <button
              onClick={() => copy(analysis.hashtags.join(" "), "tags")}
              className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
            >
              {copied === "tags" ? "복사됨!" : "전체 복사"}
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {analysis.hashtags.map((tag, i) => (
              <span key={i} className="text-xs bg-gray-800 text-cyan-300 px-2 py-1 rounded-lg">
                {tag}
              </span>
            ))}
          </div>
        </div>

        {/* 썸네일 텍스트 */}
        <div>
          <label className="text-xs font-bold text-yellow-400 uppercase tracking-widest block mb-2">
            썸네일 텍스트
          </label>
          <div className="flex items-center gap-2">
            <input
              className="flex-1 bg-gray-800 text-white rounded-xl px-4 py-2.5 text-sm border border-gray-700 focus:border-yellow-500 focus:outline-none font-bold"
              value={editedThumbnail}
              onChange={(e) => setEditedThumbnail(e.target.value)}
              maxLength={15}
            />
            <button
              onClick={() => copy(editedThumbnail, "thumb")}
              className="text-xs text-yellow-400 hover:text-yellow-300 whitespace-nowrap transition-colors"
            >
              {copied === "thumb" ? "복사됨!" : "복사"}
            </button>
          </div>
        </div>

        {/* 클립 다운로드 */}
        <div className="space-y-2">
          <button
            onClick={downloadClip}
            disabled={downloading}
            className="w-full py-2.5 text-xs font-medium rounded-xl bg-green-900/40 hover:bg-green-900/60 disabled:opacity-50 text-green-400 border border-green-800 transition-colors"
          >
            {downloading ? "⏳ 다운로드 중... (1분 내외)" : "⬇ 클립 다운로드 (.mp4)"}
          </button>
          {downloadMsg && (
            <p className={`text-xs px-3 py-2 rounded-lg break-all ${
              downloadMsg.ok
                ? "bg-green-900/20 text-green-400 border border-green-800"
                : "bg-red-900/20 text-red-400 border border-red-800"
            }`}>
              {downloadMsg.text}
            </p>
          )}
        </div>

        {/* 주간 요약에 추가 */}
        <button
          onClick={() =>
            onAddToWeekly({
              title: analysis.titles[selectedTitle],
              clipScript: editedScript,
              sourceUrl,
            })
          }
          className="w-full py-2.5 text-xs font-medium rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors border border-gray-700"
        >
          + 이번 주 요약에 추가
        </button>
      </div>
    </div>
  );
}
