"use client";

import { useState } from "react";

const STEPS = [
  {
    num: "①",
    color: "text-green-400",
    border: "border-green-800",
    bg: "bg-green-900/10",
    title: "클립 다운로드",
    auto: true,
    items: [
      "⬇ 클립 다운로드 버튼 클릭",
      "~/Downloads/clips/ 폴더에 mp4 + 썸네일 jpg 자동 저장",
      "파일명: 제목_시작시간-종료시간.mp4",
    ],
  },
  {
    num: "②",
    color: "text-blue-400",
    border: "border-blue-800",
    bg: "bg-blue-900/10",
    title: "자막 직접 입력 (Vrew)",
    auto: false,
    items: [
      "Vrew 실행 → 새 프로젝트 → mp4 불러오기",
      "AI 자동 자막 생성 후 오탈자/띄어쓰기 수정",
      "자막 스타일: 하단 중앙, 흰색 굵은 글씨, 검정 테두리",
      "완료 후 mp4로 내보내기 (원본 덮어쓰기 가능)",
    ],
  },
  {
    num: "③",
    color: "text-yellow-400",
    border: "border-yellow-800",
    bg: "bg-yellow-900/10",
    title: "썸네일 제작 (미리캔버스)",
    auto: false,
    items: [
      "미리캔버스 → 유튜브 썸네일 템플릿 검색",
      "클립 폴더의 _thumb.jpg를 배경 이미지로 삽입",
      "썸네일 텍스트(위에서 복사한 문구) 붙여넣기",
      "1280×720px로 내보내기",
    ],
  },
  {
    num: "④",
    color: "text-purple-400",
    border: "border-purple-800",
    bg: "bg-purple-900/10",
    title: "YouTube 업로드",
    auto: false,
    items: [
      "YouTube Studio → 업로드 → 자막 완성된 mp4 선택",
      "제목: 위에서 선택한 제목 붙여넣기",
      "설명란 첫 줄: 해시태그 전체 복사 붙여넣기",
      "썸네일: 제작한 1280×720 이미지 업로드",
      "공개 범위 설정 후 게시",
    ],
  },
];

export default function ManualGuide() {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-2xl border border-gray-800 overflow-hidden">
      {/* 토글 헤더 */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-3 bg-gray-900 hover:bg-gray-800 transition-colors text-left"
      >
        <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">
          수동 작업 가이드
        </span>
        <span className="text-gray-600 text-sm">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="bg-gray-950 p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {STEPS.map((step) => (
            <div
              key={step.num}
              className={`rounded-xl border ${step.border} ${step.bg} p-4 space-y-2`}
            >
              <div className="flex items-center gap-2">
                <span className={`text-sm font-bold ${step.color}`}>{step.num} {step.title}</span>
                {step.auto && (
                  <span className="text-xs bg-green-900/40 text-green-400 border border-green-800 px-1.5 py-0.5 rounded-full">
                    자동
                  </span>
                )}
              </div>
              <ol className="space-y-1">
                {step.items.map((item, i) => (
                  <li key={i} className="flex gap-2 text-xs text-gray-400 leading-relaxed">
                    <span className="text-gray-600 shrink-0">{i + 1}.</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
