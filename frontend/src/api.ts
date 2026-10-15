export type Source = 'codeforces' | 'cses' | 'leetcode'

export interface Srs {
  due: string
  reps: number
  lapses: number
  last_review: string | null
  origin: 'practice' | 'history'
  retired: boolean
  stability_days: number
}

export interface Problem {
  id: number
  source: Source
  external_id: string
  title: string
  url: string
  rating: number
  raw_difficulty: string
  paid_only: boolean
  excluded: boolean
  solved_count: number | null
  revealed: boolean
  categories?: string[]
  primary_category?: string | null
  tags?: string[]
  srs: Srs | null
}

export interface Slot {
  id: number
  position: number
  kind: 'review' | 'new'
  status: 'pending' | 'completed'
  started_at: string | null
  challenge: 'warm-up' | 'on level' | 'stretch' | 'hard'
  problem: Problem
}

export interface Today {
  day: string
  slots: Slot[]
  completed: number
  total: number
  reviews_due: number
}

export interface Attempt {
  id: number
  problem_id: number
  finished_at: string
  duration_sec: number | null
  outcome: Outcome
  confidence: number | null
  guessed_category: string | null
  key_insight: string
  mistakes: string
  notes: string
  verified: boolean
}

export type Outcome = 'solved_clean' | 'solved' | 'solved_hint' | 'saw_solution' | 'failed'

export const OUTCOMES: { key: Outcome; label: string; hint: string }[] = [
  { key: 'solved_clean', label: 'Easy solve', hint: 'Solved quickly, felt easy' },
  { key: 'solved', label: 'Solved', hint: 'Solved it on my own' },
  { key: 'solved_hint', label: 'Struggled', hint: 'Needed a hint or a long fight' },
  { key: 'saw_solution', label: 'Saw solution', hint: 'Read the editorial / solution' },
  { key: 'failed', label: 'Failed', hint: 'Could not solve it' },
]

export interface SolutionFile {
  id: number
  problem_id: number
  attempt_id: number | null
  language: 'java' | 'python' | 'cpp' | 'other'
  filename: string
  created_at: string
}

export interface VideoInfo {
  id: number
  problem_id: number
  attempt_id: number | null
  title: string
  mime: string
  size_bytes: number
  duration_sec: number | null
  created_at: string
  url: string
  problem?: Problem
}

export interface ProblemDetail {
  problem: Problem
  attempts: Attempt[]
  solutions: SolutionFile[]
  videos: VideoInfo[]
}

export interface Reveal {
  categories: string[]
  primary_category: string | null
  tags: string[]
  guess_correct: boolean | null
  next_due: string
  skill_changes: Record<string, { before: number; after: number }>
}

export interface Category {
  key: string
  name: string
  unlock_at: number
  weight: number
}

export interface CategoryStat {
  key: string
  name: string
  skill: number
  attempts: number
  primary_attempts: number
  unlocked: boolean
  unlock_at: number
  recent_share: number
  next_pick_chance: number
}

export interface Stats {
  mean_skill: number
  categories: CategoryStat[]
  activity: Record<string, number>
  streak: { current: number; longest: number }
  totals: {
    attempts: number
    problems_seen: number
    outcomes: Partial<Record<Outcome, number>>
    seen_by_source: Partial<Record<Source, number>>
    practice_minutes: number
  }
  review_forecast: Record<string, number>
  recognition: { guesses: number; correct: number }
  recent: (Attempt & { problem: Problem })[]
}

export interface Settings {
  daily_count: number
  review_share: number
  history_review_share: number
  source_weights: Record<Source, number>
  category_weights: Record<string, number>
  stretch: number
  difficulty_spread: number
  initial_skill: number
  leetcode_premium: boolean
  codeforces_handle: string
  leetcode_username: string
  leetcode_session: boolean | string
  desired_retention: number
}

export interface ImportStatus {
  problems: number
  running: boolean
  last_run: null | {
    status: 'running' | 'ok' | 'error'
    started_at: string
    finished_at: string | null
    added: number
    updated: number
    message: string
  }
}

export interface SheetMeta {
  key: string
  title: string
  order: number
  category: string | null
  sections: string[]
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const init: RequestInit = { method }
  if (body instanceof FormData) init.body = body
  else if (body !== undefined) {
    init.body = JSON.stringify(body)
    init.headers = { 'Content-Type': 'application/json' }
  }
  const res = await fetch(url, init)
  if (!res.ok) {
    let msg = res.statusText
    try {
      const j = await res.json()
      msg = typeof j.detail === 'string' ? j.detail : JSON.stringify(j.detail)
    } catch {
      /* not JSON */
    }
    throw new ApiError(res.status, msg)
  }
  const type = res.headers.get('content-type') ?? ''
  return (type.includes('application/json') ? res.json() : res.text()) as Promise<T>
}

export const api = {
  get: <T>(url: string) => request<T>('GET', url),
  post: <T>(url: string, body?: unknown) => request<T>('POST', url, body),
  put: <T>(url: string, body?: unknown) => request<T>('PUT', url, body),
  patch: <T>(url: string, body?: unknown) => request<T>('PATCH', url, body),
  del: <T>(url: string) => request<T>('DELETE', url),
}

export function qs(params: Record<string, string | number | boolean | null | undefined>) {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v))
  const s = p.toString()
  return s ? `?${s}` : ''
}
