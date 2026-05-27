export interface CohortRow {
  id: number;
  name: string;
  slug: string;
  created_at: string;
}

export interface GroupRow {
  id: number;
  cohort_id: number;
  name: string;
  api_token_hash: string;
  created_at: string;
}

export interface RunRow {
  id: number;
  cohort_id: number;
  group_id: number;
  player_name: string;
  schnitzel: number;
  kartoffeln: number;
  duration_seconds: number;
  submitted_at: string;
}

export interface LeaderboardRow {
  id: number;
  player_name: string;
  group_name: string;
  schnitzel: number;
  kartoffeln: number;
  duration_seconds: number;
  submitted_at: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    group: { id: number; name: string; cohortId: number } | null;
  }
}
