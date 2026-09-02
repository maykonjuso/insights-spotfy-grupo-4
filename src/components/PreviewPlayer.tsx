"use client";

import { seekTo, usePlayerState } from "@/lib/preview-player";
import { PlayButton } from "./PlayButton";

type PreviewPlayerProps = {
  sourceId: string;
  url?: string | null;
  title: string;
  caption: string;
};

function timeLabel(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

export function PreviewPlayer({ sourceId, url, title, caption }: PreviewPlayerProps) {
  const state = usePlayerState();
  const isCurrent = state.sourceId === sourceId;
  const duration = isCurrent ? state.duration : 0;
  const position = isCurrent ? state.position : 0;

  return (
    <div className={`preview-player ${isCurrent && state.isPlaying ? "is-playing" : ""}`}>
      <PlayButton sourceId={sourceId} url={url} title={title} size="lg" />

      <div className="preview-track">
        <span>{caption}</span>
        <input
          type="range"
          min={0}
          max={duration || 30}
          step={0.1}
          value={position}
          disabled={!url || !isCurrent || duration === 0}
          onChange={(event) => seekTo(Number(event.target.value))}
          aria-label={`Posição da reprodução de ${title}`}
        />
      </div>

      <span className="preview-time">
        {timeLabel(position)} / {timeLabel(duration)}
      </span>
    </div>
  );
}
