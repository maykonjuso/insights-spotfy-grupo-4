"use client";

import { useSyncExternalStore } from "react";

export type PlayerState = {
  sourceId: string | null;
  isPlaying: boolean;
  position: number;
  duration: number;
};

const IDLE: PlayerState = { sourceId: null, isPlaying: false, position: 0, duration: 0 };

let audio: HTMLAudioElement | null = null;
let state: PlayerState = IDLE;
const listeners = new Set<() => void>();

function emit(next: Partial<PlayerState>) {
  state = { ...state, ...next };
  listeners.forEach((listener) => listener());
}

function element() {
  if (audio) return audio;

  audio = new Audio();
  audio.preload = "none";
  audio.addEventListener("timeupdate", () => emit({ position: audio?.currentTime ?? 0 }));
  audio.addEventListener("durationchange", () => {
    const duration = audio?.duration ?? 0;
    emit({ duration: Number.isFinite(duration) ? duration : 0 });
  });
  audio.addEventListener("ended", () => emit({ isPlaying: false, position: 0 }));
  audio.addEventListener("pause", () => emit({ isPlaying: false }));
  audio.addEventListener("play", () => emit({ isPlaying: true }));
  audio.addEventListener("error", () => emit({ ...IDLE }));

  return audio;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function currentSourceId() {
  return state.sourceId;
}

export function usePlayerState() {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => IDLE,
  );
}

export async function togglePlayback(sourceId: string, url: string) {
  const player = element();

  if (state.sourceId === sourceId && !player.paused) {
    player.pause();
    return;
  }

  if (state.sourceId !== sourceId) {
    player.src = url;
    emit({ sourceId, position: 0, duration: 0 });
  }

  try {
    await player.play();
  } catch {
    emit({ ...IDLE });
  }
}

export function seekTo(seconds: number) {
  const player = element();
  if (Number.isFinite(seconds)) player.currentTime = seconds;
}

export function stopPlayback() {
  if (!audio) return;
  audio.pause();
  audio.removeAttribute("src");
  audio.load();
  emit({ ...IDLE });
}
