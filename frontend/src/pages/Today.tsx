import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api, type ImportStatus, type Slot, type Stats, type Today as TodayT } from '../api'
import Heatmap from '../components/Heatmap'
import { CategoryChips, ChallengeChip, ErrorBox, Loading, PageHeader, SourceBadge } from '../components/ui'

function useImportStatus(enabled: boolean) {
  return useQuery({
    queryKey: ['import-status'],
    queryFn: () => api.get<Record<string, ImportStatus>>('/api/import/status'),
    refetchInterval: enabled ? 2500 : false,
    enabled,
  })
}

export default function Today() {
  const qc = useQueryClient()
  const today = useQuery({ queryKey: ['today'], queryFn: () => api.get<TodayT>('/api/today') })
  const stats = useQuery({ queryKey: ['stats'], queryFn: () => api.get<Stats>('/api/stats') })
  const empty = today.data !== undefined && today.data.total === 0
  const imports = useImportStatus(empty)
  const importing = Object.values(imports.data ?? {}).some((s) => s.running)

  const mutate = useMutation({
    mutationFn: ({ url, body }: { url: string; body?: unknown }) => api.post<TodayT>(url, body),
    onSuccess: (data) => qc.setQueryData(['today'], data),
  })

  if (today.isLoading) return <Loading />
  if (today.error) return <ErrorBox error={today.error} />
  const t = today.data!
  const dateLabel = new Date(t.day + 'T00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
  const busy = mutate.isPending

  return (
    <div>
      <PageHeader
        title="Today"
        subtitle={dateLabel}
        actions={
          <>
            <div className="flex items-center rounded-lg border border-line bg-panel">
              <button className="btn btn-ghost rounded-r-none px-2.5" disabled={busy || t.total === 0} onClick={() => mutate.mutate({ url: '/api/today/count', body: { count: t.total - 1 } })} title="One fewer problem">
                −
              </button>
              <span className="min-w-20 px-2 text-center text-sm font-medium tabular-nums">
                {t.total} problem{t.total === 1 ? '' : 's'}
              </span>
              <button className="btn btn-ghost rounded-l-none px-2.5" disabled={busy || t.total >= 30} onClick={() => mutate.mutate({ url: '/api/today/count', body: { count: t.total + 1 } })} title="One more problem">
                +
              </button>
            </div>
            <button className="btn" disabled={busy || t.slots.every((s) => s.status !== 'pending')} onClick={() => mutate.mutate({ url: '/api/today/reroll' })}>
              ↻ Reroll unfinished
            </button>
          </>
        }
      />
      <ErrorBox error={mutate.error} />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
        <section className="space-y-3">
          <ProgressBar done={t.completed} total={t.total} />
          {t.slots.length === 0 && (
            <div className="card p-8 text-center text-sm text-muted">
              {importing ? (
                <>Importing problem lists from Codeforces, CSES and LeetCode… this takes about a minute.</>
              ) : imports.data && Object.values(imports.data).every((s) => s.problems === 0) ? (
                <>
                  No problems in the database yet. Go to <Link className="text-accent underline" to="/settings">Settings</Link> to import them.
                </>
              ) : (
                <>No problems scheduled. Use + to add some.</>
              )}
              {importing && (
                <button className="btn btn-primary mt-4" onClick={() => mutate.mutate({ url: '/api/today/count', body: { count: 4 } })}>
                  Try generating now
                </button>
              )}
            </div>
          )}
          {t.slots.map((s, i) => (
            <SlotCard key={s.id} slot={s} index={i} busy={busy} onAction={(url) => mutate.mutate({ url })} />
          ))}
          <p className="pt-2 text-xs text-muted">
            Problem types stay hidden until you finish and log a problem. A problem only counts once you save your solution code and your notes.
          </p>
        </section>

        <aside className="space-y-4">
          <div className="card p-4">
            <div className="grid grid-cols-3 gap-2 text-center">
              <Mini label="Streak" value={stats.data?.streak.current ?? 0} suffix="d" />
              <Mini label="Skill" value={stats.data?.mean_skill ?? '—'} />
              <Mini label="Due" value={t.reviews_due} />
            </div>
          </div>
          <div className="card p-4">
            <div className="label">Last 16 weeks</div>
            <Heatmap activity={stats.data?.activity ?? {}} weeks={16} />
          </div>
          {stats.data && stats.data.totals.attempts > 0 && <Focus stats={stats.data} />}
        </aside>
      </div>
    </div>
  )
}

function Mini({ label, value, suffix }: { label: string; value: number | string; suffix?: string }) {
  return (
    <div>
      <div className="text-xl font-bold tabular-nums">
        {value}
        {suffix && <span className="text-sm font-medium text-muted">{suffix}</span>}
      </div>
      <div className="text-[11px] font-semibold tracking-wide text-muted uppercase">{label}</div>
    </div>
  )
}

function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total ? (done / total) * 100 : 0
  return (
    <div className="flex items-center gap-3">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-panel-2">
        <div className="h-full rounded-full bg-good transition-all" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-sm font-medium text-muted tabular-nums">
        {done}/{total} done
      </span>
    </div>
  )
}

function SlotCard({ slot, index, busy, onAction }: { slot: Slot; index: number; busy: boolean; onAction: (url: string) => void }) {
  const p = slot.problem
  const done = slot.status === 'completed'
  const start = () => {
    if (!slot.started_at) api.post(`/api/today/slots/${slot.id}/start`).catch(() => {})
  }
  return (
    <div className={`card flex flex-col gap-3 p-4 sm:flex-row sm:items-center ${done ? 'opacity-75' : ''}`}>
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${done ? 'bg-good-soft text-good' : 'bg-panel-2 text-muted'}`}>
        {done ? '✓' : index + 1}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <a href={p.url} target="_blank" rel="noreferrer" onClick={start} className="truncate font-semibold hover:text-accent">
            {p.title}
          </a>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
          <SourceBadge source={p.source} />
          <span className="chip bg-panel-2 tabular-nums">≈{p.rating}</span>
          <ChallengeChip challenge={slot.challenge} />
          <span className={`chip ${slot.kind === 'review' ? 'bg-accent-soft text-accent' : 'bg-panel-2 text-muted'}`}>
            {slot.kind === 'review' ? 'Review' : 'New'}
          </span>
          {done && p.categories && <CategoryChips keys={p.categories} />}
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
        {done ? (
          <Link to={`/problems/${p.id}`} className="btn">
            View
          </Link>
        ) : (
          <>
            <a href={p.url} target="_blank" rel="noreferrer" onClick={start} className="btn">
              Open ↗
            </a>
            <Link to={`/solve/${slot.id}`} onClick={start} className="btn btn-primary">
              Finish & log
            </Link>
            <button className="btn btn-ghost px-2" disabled={busy} title="Swap for a different problem" onClick={() => onAction(`/api/today/slots/${slot.id}/reroll`)}>
              ↻
            </button>
            <button className="btn btn-ghost px-2 text-muted" disabled={busy} title="Remove from today" onClick={() => onAction(`/api/today/slots/${slot.id}/drop`)}>
              ✕
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function Focus({ stats }: { stats: Stats }) {
  const practiced = stats.categories.filter((c) => c.attempts > 0)
  const weakest = [...practiced].sort((a, b) => a.skill - b.skill).slice(0, 4)
  const rec = stats.recognition
  return (
    <div className="card space-y-3 p-4">
      <div>
        <div className="label">Weakest areas</div>
        <ul className="space-y-1 text-sm">
          {weakest.map((c) => (
            <li key={c.key} className="flex justify-between gap-2">
              <span className="truncate">{c.name}</span>
              <span className="font-medium text-muted tabular-nums">{c.skill}</span>
            </li>
          ))}
        </ul>
      </div>
      {rec.guesses > 0 && (
        <div>
          <div className="label">Pattern recognition</div>
          <div className="text-sm">
            Guessed the type right <b>{Math.round((rec.correct / rec.guesses) * 100)}%</b> of the time ({rec.correct}/{rec.guesses})
          </div>
        </div>
      )}
    </div>
  )
}
