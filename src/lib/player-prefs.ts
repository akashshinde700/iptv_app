"use client";

/**
 * Viewer audio preferences. Audio is ON by default; the choice is only saved when the
 * user mutes / unmutes themselves (an autoplay-policy fallback mute is never saved), so
 * channel changes, player reloads and app resumes keep the user's own setting.
 */

const MUTED_KEY = "sk-player-muted";
const VOLUME_KEY = "sk-player-volume";

export function readMutedPreference(): boolean {
  try {
    return localStorage.getItem(MUTED_KEY) === "1";
  } catch {
    return false;
  }
}

export function saveMutedPreference(muted: boolean): void {
  try {
    localStorage.setItem(MUTED_KEY, muted ? "1" : "0");
  } catch {
    /* storage blocked */
  }
}

export function readVolumePreference(): number {
  try {
    const value = Number(localStorage.getItem(VOLUME_KEY));
    return Number.isFinite(value) && value > 0 && value <= 1 ? value : 1;
  } catch {
    return 1;
  }
}

export function saveVolumePreference(volume: number): void {
  try {
    localStorage.setItem(VOLUME_KEY, String(Math.max(0, Math.min(1, volume))));
  } catch {
    /* storage blocked */
  }
}
