import type { LeaderboardRow } from './types.js';

export interface RankedEntry {
  rank: number;
  playerName: string;
  groupName: string;
  schnitzel: number;
  kartoffeln: number;
  durationSeconds: number;
  submittedAt: string;
}

export function assignRanks(rows: LeaderboardRow[]): RankedEntry[] {
  return rows.map((row, index) => ({
    rank: index + 1,
    playerName: row.player_name,
    groupName: row.group_name,
    schnitzel: row.schnitzel,
    kartoffeln: row.kartoffeln,
    durationSeconds: row.duration_seconds,
    submittedAt: row.submitted_at,
  }));
}
