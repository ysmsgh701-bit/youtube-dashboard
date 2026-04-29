"use client";

import { useState, useEffect } from "react";

interface VideoItem {
  videoId: string;
  title: string;
  channelTitle: string;
  publishedAt: string;
  thumbnail: string;
  url: string;
}

interface Props {
  onSelect: (url: string) => void;
  loading: boolean;
}

const CHANNELS = [
  { key: "all", label: "전체" },
  { key: "ktv", label: "KTV 국민방송" },
  { key: "natv", label: "국회방송" },
];

const ORDERS = [
  { key: "date", label: "최신순" },
  { key: "viewCount", label: "인기순" },
  { key: "relevance", label: "관련순" },
];

export default function SearchBar({ onSelect, loading }: Props) {
  const [query, setQuery] = useState("");
  const [channel, setChannel] = useState("ktv");
  const [order, setOrder] = useState("date");
  const [results, setResults] = useState<VideoItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const [noApiKey, setNoApiKey] = useState(false);

  // 채널 탭 바꾸면 자동으로 최신 영상 로드
  useEffect(() => {
    fetchVideos("", channel, order);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel]);

  async function fetchVideos(q: string, ch: string, ord: string) {
    setSearching(true);
    setError("");
    setResults([]);
    try {
      const params = new URLSearchParams({ q, channel: ch, order: ord });
      const res = await fetch(`/api/search?${params}`);
      const data = await res.json();
      if (!res.ok) {
        if (data.error?.includes("YOUTUBE_API_KEY")) setNoApiKey(true);
        else setError(data.error || "검색 실패");
        return;
      }
      if (!data.items?.length) setError("검색 결과가 없습니다.");
      setResults(data.items ?? []);
    } catch {
      setError("네트워크 오류");
    } finally {
      setSearching(false);
    }
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    fetchVideos(query, channel, order);
  }

  function handleOrderChange(newOrder: string) {
    setOrder(newOrder);
    fetchVideos(query, channel, newOrder);
  }

  return (
    <div className="bg-gray-900 rounded-2xl border border-gray-800 p-5 space-y-4">
      <div>
        <h2 className="text-base font-semibold text-white">STEP 1 — 영상 검색</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          채널을 선택하면 최신 영상을 바로 볼 수 있어요
        </p>
      </div>

      {/* 채널 + 정렬 필터 */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex gap-2">
          {CHANNELS.map((c) => (
            <button
              key={c.key}
              onClick={() => setChannel(c.key)}
              className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                channel === c.key
                  ? "bg-blue-600 text-white"
                  : "bg-gray-800 text-gray-400 hover:bg-gray-700"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          {ORDERS.map((o) => (
            <button
              key={o.key}
              onClick={() => handleOrderChange(o.key)}
              className={`px-2.5 py-1 text-xs rounded-lg transition-colors ${
                order === o.key
                  ? "bg-gray-600 text-white"
                  : "bg-gray-800 text-gray-500 hover:bg-gray-700"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {/* 검색 입력 */}
      <form onSubmit={handleSearch} className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="키워드 입력 (비우면 채널 전체 영상 표시)"
          className="flex-1 bg-gray-800 text-white placeholder-gray-600 rounded-xl px-4 py-2.5 text-sm border border-gray-700 focus:border-blue-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={searching}
          className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm rounded-xl transition-colors whitespace-nowrap"
        >
          {searching ? "검색 중..." : "검색"}
        </button>
      </form>

      {/* YouTube API 키 없을 때 안내 */}
      {noApiKey && (
        <div className="bg-yellow-900/20 border border-yellow-800 rounded-xl p-4 text-xs text-yellow-300 space-y-2">
          <p className="font-bold">YouTube API 키가 필요해요</p>
          <ol className="list-decimal list-inside space-y-1 text-yellow-400">
            <li>
              <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" className="underline">
                Google Cloud Console
              </a>에서 API 키 생성
            </li>
            <li><code className="bg-gray-800 px-1 rounded">.env.local</code>에 <code className="bg-gray-800 px-1 rounded">YOUTUBE_API_KEY=키</code> 추가</li>
            <li>서버 재시작</li>
          </ol>
        </div>
      )}

      {/* 로딩 */}
      {searching && (
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <div className="w-3 h-3 border border-blue-500 border-t-transparent rounded-full animate-spin" />
          불러오는 중...
        </div>
      )}

      {/* 에러 */}
      {!searching && error && (
        <p className="text-red-400 text-xs">{error}</p>
      )}

      {/* 검색 결과 */}
      {results.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[500px] overflow-y-auto pr-1">
          {results.map((item) => (
            <div key={item.videoId} className="flex gap-3 bg-gray-800 rounded-xl p-3">
              <img
                src={item.thumbnail}
                alt={item.title}
                className="w-28 h-16 object-cover rounded-lg shrink-0"
              />
              <div className="flex-1 min-w-0 flex flex-col justify-between">
                <p className="text-xs text-white leading-snug line-clamp-2" title={item.title}>
                  {item.title}
                </p>
                <div className="mt-1">
                  <p className="text-xs text-gray-500 truncate">
                    {item.channelTitle} · {item.publishedAt}
                  </p>
                  <button
                    onClick={() => onSelect(item.url)}
                    disabled={loading}
                    className="mt-1.5 w-full py-1 bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white text-xs rounded-lg transition-colors"
                  >
                    {loading ? "분석 중..." : "분석하기"}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
