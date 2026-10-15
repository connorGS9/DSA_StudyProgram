import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api, OUTCOMES, type CategoryStat, type Stats } from '../api'
import Heatmap from '../components/Heatmap'
import { ErrorBox, fmtDate, Loading, OutcomeChip, PageHeader, Stat } from '../components/ui'

const SCALE_MIN = 800
const SCALE_MAX = 2600

export default function Progress() {
  const stats = useQuery({ queryKey: ['stats'], queryFn: () => api.get<Stats>('/api/stats') })
  if (stats.isLoading) return <Loading />
  if (stats.error) return <ErrorBox error={stats.error} />
  const s = stats.data!
  const rec = s.recognition
  const solvedish = (s.totals.outcomes.solved_clean ?? 0) + (s.totals.outcomes.solved ?? 0)

  return (
    <div className="space-y-6">
      <PageHeader title="Progress" subtitle={`Average skill ${s.mean_skill} on the Codeforces rating scale`} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Stat label="Streak" value={`${s.streak.current}d`} sub={`longest ${s.streak.longest}d`} />
        <Stat label="Attempts" value={s.totals.attempts} sub={`${s.totals.problems_seen} problems known`} />
        <Stat label="Solved unaided" value={s.totals.attempts ? `${Math.round((solvedish / s.totals.attempts) * 100)}%` : '—'} />
        <Stat label="Practice time" value={`${Math.round(s.totals.practice_minutes / 60)}h`} sub={`${s.totals.practice_minutes} min`} />
        <Stat label="Type guessed" value={rec.guesses ? `${Math.round((rec.correct / rec.guesses) * 100)}%` : '—'} sub={`${rec.correct}/${rec.guesses} guesses`} />
        <Stat label="Mean skill" value={s.mean_skill} />
      </div>

      <section className="card p-5">
        <h2 className="font-semibold">Activity</h2>
        <p className="mb-3 text-xs text-muted">Problems finished per day, last 12 months</p>
        <Heatmap activity={s.activity} weeks={53} />
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <SkillChart cats={s.categories} />
        <div className="space-y-6">
          <Forecast forecast={s.review_forecast} />
          <section className="card p-5">
            <h2 className="mb-3 font-semibold">Outcomes</h2>
            <table className="w-full text-sm">
              <tbody>
                {OUTCOMES.map((o) => (
                  <tr key={o.key} className="border-b border-line last:border-0">
                    <td className="py-1.5">
                      <OutcomeChip outcome={o.key} />
                    </td>
                    <td className="py-1.5 text-right font-medium tabular-nums">{s.totals.outcomes[o.key] ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      </div>

      <section className="card p-5">
        <h2 className="mb-3 font-semibold">Recent attempts</h2>
        {s.recent.length === 0 && <p className="text-sm text-muted">Nothing yet. Finish a problem from Today to start tracking.</p>}
        <ul className="divide-y divide-line">
          {s.recent.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
              <span className="w-28 shrink-0 text-muted">{fmtDate(a.finished_at)}</span>
              <Link to={`/problems/${a.problem_id}`} className="min-w-0 flex-1 truncate font-medium hover:text-accent">
                {a.problem.title}
              </Link>
              <OutcomeChip outcome={a.outcome} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

function SkillChart({ cats }: { cats: CategoryStat[] }) {
  const [sort, setSort] = useState<'skill' | 'name' | 'chance'>('skill')
  const [hover, setHover] = useState<string | null>(null)
  const sorted = [...cats].sort((a, b) =>
    sort === 'name' ? a.name.localeCompare(b.name) : sort === 'chance' ? b.next_pick_chance - a.next_pick_chance : b.skill - a.skill,
  )
  const pct = (v: number) => ((Math.min(Math.max(v, SCALE_MIN), SCALE_MAX) - SCALE_MIN) / (SCALE_MAX - SCALE_MIN)) * 100
  const ticks = [1000, 1400, 1800, 2200]

  return (
    <section className="card p-5">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Skill by category</h2>
        <div className="flex rounded-lg border border-line p-0.5 text-xs">
          {(['skill', 'chance', 'name'] as const).map((k) => (
            <button key={k} onClick={() => setSort(k)} className={`rounded-md px-2 py-0.5 font-medium ${sort === k ? 'bg-panel-2 text-fg' : 'text-muted'}`}>
              {k === 'skill' ? 'Skill' : k === 'chance' ? 'Pick chance' : 'A–Z'}
            </button>
          ))}
        </div>
      </div>
      <p className="mb-4 text-xs text-muted">Elo-style estimate; new problems are aimed slightly above it. Locked categories open as your average rises.</p>
      <div className="relative">
        <div className="pointer-events-none absolute inset-y-0 right-14 left-44">
          {ticks.map((t) => (
            <div key={t} className="absolute inset-y-0 border-l border-dashed border-line" style={{ left: `${pct(t)}%` }}>
              <span className="absolute -top-4 -translate-x-1/2 text-[10px] text-muted tabular-nums">{t}</span>
            </div>
          ))}
        </div>
        <ul className="relative space-y-1">
          {sorted.map((c) => (
            <li
              key={c.key}
              onMouseEnter={() => setHover(c.key)}
              onMouseLeave={() => setHover(null)}
              className={`relative flex items-center gap-2 rounded-md py-0.5 text-sm ${hover === c.key ? 'bg-panel-2' : ''}`}
            >
              <span className={`w-42 shrink-0 truncate pl-1 ${c.unlocked ? '' : 'text-muted'}`} title={c.name}>
                {c.name}
              </span>
              <div className="relative h-3.5 flex-1">
                {c.unlocked ? (
                  <div
                    className={`absolute inset-y-0 left-0 rounded-r-[4px] ${c.attempts ? 'bg-accent' : 'bg-accent/30'}`}
                    style={{ width: `${Math.max(pct(c.skill), 1)}%` }}
                  />
                ) : (
                  <span className="absolute inset-y-0 left-1 text-[11px] text-muted">🔒 unlocks at avg {c.unlock_at}</span>
                )}
              </div>
              <span className="w-12 shrink-0 pr-1 text-right font-medium tabular-nums">{c.unlocked ? c.skill : ''}</span>
              {hover === c.key && (
                <div className="absolute top-full left-44 z-10 mt-1 w-64 rounded-lg border border-line bg-panel p-3 text-xs shadow-lg">
                  <div className="mb-1 font-semibold">{c.name}</div>
                  <Row k="Skill" v={c.skill} />
                  <Row k="Attempts touching it" v={c.attempts} />
                  <Row k="As main category" v={c.primary_attempts} />
                  <Row k="Share of last 3 weeks" v={`${Math.round(c.recent_share * 100)}%`} />
                  <Row k="Chance of next new pick" v={`${Math.round(c.next_pick_chance * 100)}%`} />
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted">{k}</span>
      <span className="font-medium tabular-nums">{v}</span>
    </div>
  )
}

function Forecast({ forecast }: { forecast: Record<string, number> }) {
  const days: { iso: string; n: number; label: string }[] = []
  const d = new Date()
  for (let i = 0; i < 30; i++) {
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    days.push({ iso, n: forecast[iso] ?? 0, label: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) })
    d.setDate(d.getDate() + 1)
  }
  const max = Math.max(1, ...days.map((x) => x.n))
  const total = days.reduce((a, b) => a + b.n, 0)
  const [hover, setHover] = useState<number | null>(null)
  return (
    <section className="card p-5">
      <h2 className="font-semibold">Reviews coming due</h2>
      <p className="mb-3 text-xs text-muted">{total} in the next 30 days{hover !== null ? ` · ${days[hover].label}: ${days[hover].n}` : ''}</p>
      <div className="flex h-24 items-end gap-[2px] border-b border-line" onMouseLeave={() => setHover(null)}>
        {days.map((x, i) => (
          <div key={x.iso} className="flex h-full flex-1 items-end" onMouseEnter={() => setHover(i)} title={`${x.label}: ${x.n}`}>
            <div className={`w-full rounded-t-[4px] ${hover === i ? 'bg-accent' : 'bg-accent/70'}`} style={{ height: x.n ? `${(x.n / max) * 100}%` : 0 }} />
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-muted">
        <span>today</span>
        <span>+30d</span>
      </div>
    </section>
  )
}
