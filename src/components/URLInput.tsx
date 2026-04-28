"use client";

import { useState } from "react";

interface Props {
  onResult: (transcript: string, videoId: string, url: string) => void;
  loading: boolean;
}

export default function URLInput({ onResult, loading }: Props) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    try {
      const res = await fetch("/api/transcript", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onResult(data.transcript, data.videoId, url);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "오류가 발생했습니다.");
    }
  }

  return (
    <div className="bg-gray-900 rounded-2xl p-6 border border-gray-800">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs font-bold text-blue-400 uppercase tracking-widest">STEP 1</span>
        <span className="text-xs text-gray-500">KTV · 국회방송 · 뉴스 YouTube URL 입력</span>
      </div>
      <p className="text-xs text-gray-600 mb-4">
        자막이 있는 영상만 지원됩니다. KTV(공공저작물) 또는 NATV 권장.
      </p>
      <form onSubmit={handleSubmit} className="flex gap-3">
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.youtube.com/watch?v=..."
          className="flex-1 bg-gray-800 text-white rounded-xl px-4 py-3 text-sm border border-gray-700 focus:border-blue-500 focus:outline-none placeholder-gray-600"
        />
        <button
          type="submit"
          disabled={loading || !url.trim()}
          className="px-6 py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-medium rounded-xl transition-colors whitespace-nowrap"
        >
          {loading ? "분석 중..." : "자막 추출 + 분석"}
        </button>
      </form>
      {error && <p className="mt-3 text-red-400 text-sm">{error}</p>}
    </div>
  );
}
