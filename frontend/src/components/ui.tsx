import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { api, type Category, type Outcome, type Slot, type Source, OUTCOMES } from '../api'

const SOURCE_STYLE: Record<Source, { label: string; cls: string }> = {
  codeforces: { label: 'Codeforces', cls: 'bg-[#e8f0fe] text-[#1a56db] dark:bg-[#172554] dark:text-[#93c5fd]' },
  cses: { label: 'CSES', cls: 'bg-[#f3e8ff] text-[#7e22ce] dark:bg-[#2e1065] dark:text-[#d8b4fe]' },
  leetcode: { label: 'LeetCode', cls: 'bg-[#fff4e5] text-[#b45309] dark:bg-[#3b2506] dark:text-[#fcd34d]' },
}

export function SourceBadge({ source }: { source: Source }) {
  const s = SOURCE_STYLE[source]
  return <span className={`chip ${s.cls}`}>{s.label}</span>
}

const CHALLENGE_CLS: Record<Slot['challenge'], string> = {
  'warm-up': 'bg-panel-2 text-muted',
  'on level': 'bg-good-soft text-good',
  stretch: 'bg-warn-soft text-warn',
  hard: 'bg-bad-soft text-bad',
}

export function ChallengeChip({ challenge }: { challenge: Slot['challenge'] }) {
  return <span className={`chip ${CHALLENGE_CLS[challenge]}`}>{challenge}</span>
}

export function OutcomeChip({ outcome }: { outcome: Outcome }) {
  const o = OUTCOMES.find((x) => x.key === outcome)!
  const cls =
    outcome === 'solved_clean' || outcome === 'solved'
      ? 'bg-good-soft text-good'
      : outcome === 'solved_hint'
        ? 'bg-warn-soft text-warn'
        : 'bg-bad-soft text-bad'
  return <span className={`chip ${cls}`}>{o.label}</span>
}

export function useCategories() {
  const q = useQuery({ queryKey: ['categories'], queryFn: () => api.get<Category[]>('/api/categories'), staleTime: Infinity })
  const byKey = Object.fromEntries((q.data ?? []).map((c) => [c.key, c]))
  return { list: q.data ?? [], name: (k?: string | null) => (k ? (byKey[k]?.name ?? k) : '') }
}

export function CategoryChips({ keys }: { keys: string[] }) {
  const { name } = useCategories()
  return (
    <span className="flex flex-wrap gap-1">
      {keys.map((k) => (
        <span key={k} className="chip bg-accent-soft text-accent">
          {name(k)}
        </span>
      ))}
    </span>
  )
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function ErrorBox({ error }: { error: unknown }) {
  if (!error) return null
  return (
    <div className="rounded-lg border border-bad/30 bg-bad-soft px-3 py-2 text-sm text-bad">
      {error instanceof Error ? error.message : String(error)}
    </div>
  )
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return <div className="py-10 text-center text-sm text-muted">{label}</div>
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="card px-4 py-3">
      <div className="text-xs font-semibold tracking-wide text-muted uppercase">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </div>
  )
}

export function fmtDuration(sec: number | null | undefined) {
  if (sec == null) return '—'
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = Math.floor(sec % 60)
  if (h) return `${h}h ${m}m`
  if (m) return `${m}m ${s.toString().padStart(2, '0')}s`
  return `${s}s`
}

export function fmtDate(iso: string | null | undefined) {
  if (!iso) return '—'
  const d = new Date(iso.endsWith('Z') || iso.includes('+') ? iso : iso + 'Z')
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export function relDays(iso: string) {
  const d = new Date(iso.endsWith('Z') || iso.includes('+') ? iso : iso + 'Z')
  const days = Math.round((d.getTime() - Date.now()) / 86400000)
  if (days === 0) return 'today'
  if (days === 1) return 'tomorrow'
  if (days === -1) return 'yesterday'
  return days > 0 ? `in ${days} days` : `${-days} days ago`
}
