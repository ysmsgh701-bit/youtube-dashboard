#!/usr/bin/env python3
"""
make_capcut_draft.py
사용법: python make_capcut_draft.py <clip_path> <draft_name> [srt_path]
결과: JSON stdout {"ok": true, "draft": "...", "drafts_dir": "..."}
"""
import sys
import os
import json


def find_capcut_drafts() -> str | None:
    """CapCut 초안 폴더 자동 탐색 (Windows 공통 경로)"""
    home = os.path.expanduser("~")
    username = os.environ.get("USERNAME", "")
    candidates = [
        os.path.join(home, "AppData", "Local", "CapCut", "User Data", "Projects", "com.lveditor.draft"),
        os.path.join(home, "Documents", "CapCut", "User Data", "Projects", "com.lveditor.draft"),
        os.path.join(f"C:\\Users\\{username}", "AppData", "Local", "CapCut", "User Data", "Projects", "com.lveditor.draft"),
    ]
    for p in candidates:
        if os.path.isdir(p):
            return p
    return None


def get_video_duration(clip_path: str) -> float:
    """pymediainfo로 영상 길이(초) 반환"""
    try:
        from pymediainfo import MediaInfo
        info = MediaInfo.parse(clip_path)
        for track in info.tracks:
            if track.track_type == "Video" and track.duration:
                return float(track.duration) / 1000.0
    except Exception:
        pass
    return 60.0  # fallback


def main():
    args = sys.argv[1:]
    if len(args) < 2:
        print(json.dumps({"ok": False, "error": "인자 부족: clip_path draft_name [srt_path]"}))
        sys.exit(1)

    clip_path = args[0]
    draft_name = args[1]
    srt_path = args[2] if len(args) > 2 else None

    if not os.path.exists(clip_path):
        print(json.dumps({"ok": False, "error": f"클립 파일 없음: {clip_path}"}))
        sys.exit(1)

    drafts_dir = find_capcut_drafts()
    if not drafts_dir:
        print(json.dumps({
            "ok": False,
            "error": "CapCut 초안 폴더를 찾을 수 없습니다. CapCut을 먼저 한 번 실행해주세요."
        }))
        sys.exit(1)

    import pycapcut as cc
    from pycapcut import trange

    duration_sec = get_video_duration(clip_path)

    # 초안 생성 (9:16 세로형 쇼츠)
    draft_folder = cc.DraftFolder(drafts_dir)
    script = draft_folder.create_draft(draft_name, 1080, 1920, allow_replace=True)

    # 비디오 트랙 추가
    script.add_track(cc.TrackType.video)
    video_seg = cc.VideoSegment(clip_path, trange("0s", f"{duration_sec:.3f}s"))
    script.add_segment(video_seg)

    # 자막 트랙 (SRT가 있을 때만)
    if srt_path and os.path.exists(srt_path):
        script.add_track(cc.TrackType.text, track_name="자막")
        sub_style = cc.TextStyle(
            size=8.0,
            color=(1.0, 1.0, 1.0),  # 흰색
            bold=True,
        )
        sub_border = cc.TextBorder(color=(0.0, 0.0, 0.0), width=0.08)
        script.import_srt(
            srt_path,
            track_name="자막",
            text_style=sub_style,
            clip_settings=cc.ClipSettings(transform_y=-0.75),
        )

    script.save()
    print(json.dumps({"ok": True, "draft": draft_name, "drafts_dir": drafts_dir}))


if __name__ == "__main__":
    main()
