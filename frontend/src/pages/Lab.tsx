import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { api, type Occurrence, type Project, type Settings, type Stats, type Today } from '../api'
import { Bar, PageInput, useBooks, useLabMutation, useProjects } from '../components/lab'
import { BlockLink, CategoryChip, fmtRange, fmtTime, localDate, nowAndNext, nowMin, parseDay, toMin, useNow, useScheduleDays } from '../components/schedule'
import { useTimer } from '../components/timer'
import { ErrorBox, PageHeader, SourceBadge, Stat } from '../components/ui'

export default function Lab() {
  const today = useQuery({ queryKey: ['today'], queryFn: () => api.get<Today>('/api/today') })
  const stats = useQuery({ queryKey: ['stats'], queryFn: () => api.get<Stats>('/api/stats') })
  const books = useBooks()
  const projects = useProjects()

  const reading = (books.data ?? []).filter((b) => b.status === 'reading')
  const queued = (books.data ?? []).filter((b) => b.status === 'queued')
  const active = (projects.data ?? []).filter((p) => p.status === 'active')
  const t = today.data
  const dateLabel = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })

  return (
    <div>
      <PageHeader title="Study Lab" subtitle={dateLabel} />
      <ErrorBox error={today.error || books.error || projects.error} />

      <div className="mb-6 grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <NowNext />
        <FocusCard />
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="DSA today" value={t ? `${t.completed}/${t.total}` : '—'} sub={t && t.reviews_due ? `${t.reviews_due} reviews due` : 'problems done'} />
        <Stat label="DSA streak" value={`${stats.data?.streak.current ?? 0}d`} sub={`longest ${stats.data?.streak.longest ?? 0}d`} />
        <Stat label="Reading" value={reading.length} sub={`${queued.length} up next`} />
        <Stat label="Active projects" value={active.length} sub={`${active.reduce((a, p) => a + p.tasks_total - p.tasks_done, 0)} open tasks`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <Panel title="DSA practice" to="/dsa" linkLabel="Open today →">
            {!t ? null : t.slots.length === 0 ? (
              <Empty>
                No problems scheduled today. <Link to="/dsa" className="text-accent underline">Set up today's set</Link>
              </Empty>
            ) : (
              <>
                <div className="mb-3 flex items-center gap-3">
                  <Bar percent={t.total ? (100 * t.completed) / t.total : 0} tone="good" />
                  <span className="text-xs font-medium text-muted tabular-nums">
                    {t.completed}/{t.total}
                  </span>
                </div>
                <ul className="space-y-1.5">
                  {t.slots.map((s) => (
                    <li key={s.id} className="flex items-center gap-2 text-sm">
                      <span className={`w-4 text-center ${s.status === 'completed' ? 'text-good' : 'text-muted'}`}>{s.status === 'completed' ? '✓' : '○'}</span>
                      <SourceBadge source={s.problem.source} />
                      <Link
                        to={s.status === 'completed' ? `/problems/${s.problem.id}` : `/solve/${s.id}`}
                        className={`truncate hover:text-accent ${s.status === 'completed' ? 'text-muted line-through' : ''}`}
                      >
                        {s.problem.title}
                      </Link>
                      <span className="ml-auto text-xs text-muted tabular-nums">≈{s.problem.rating}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Panel>

          <Panel title="Active projects" to="/projects" linkLabel="All projects →">
            {active.length === 0 ? (
              <Empty>
                No active projects. <Link to="/projects" className="text-accent underline">Start one</Link>
              </Empty>
            ) : (
              <ul className="space-y-4">
                {active.map((p) => (
                  <ProjectRow key={p.id} project={p} />
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel title="Currently reading" to="/books" linkLabel="All books →">
            {reading.length === 0 ? (
              <Empty>
                Not reading anything right now.{' '}
                <Link to="/books" className="text-accent underline">
                  {queued.length ? 'Pick from your queue' : 'Add a book'}
                </Link>
              </Empty>
            ) : (
              <ul className="space-y-4">
                {reading.map((b) => (
                  <li key={b.id}>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-semibold">{b.title}</span>
                      <span className="shrink-0 text-xs text-muted">{b.author}</span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-3">
                      <Bar percent={b.percent} />
                      <span className="w-9 text-right text-xs font-medium text-muted tabular-nums">{b.percent != null ? `${b.percent}%` : ''}</span>
                      <PageInput book={b} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {queued.length > 0 && (
            <Panel title="Up next" to="/books" linkLabel="Reorder →">
              <ol className="space-y-1.5 text-sm">
                {queued.slice(0, 5).map((b, i) => (
                  <li key={b.id} className="flex gap-2">
                    <span className="w-4 text-right text-muted tabular-nums">{i + 1}.</span>
                    <span className="truncate">{b.title}</span>
                    {b.author && <span className="truncate text-muted">· {b.author}</span>}
                  </li>
                ))}
                {queued.length > 5 && <li className="pl-6 text-xs text-muted">+{queued.length - 5} more</li>}
              </ol>
            </Panel>
          )}
        </div>
      </div>
    </div>
  )
}

function Panel({ title, to, linkLabel, children }: { title: string; to: string; linkLabel: string; children: ReactNode }) {
  return (
    <section className="card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">{title}</h2>
        <Link to={to} className="text-xs text-muted hover:text-accent">
          {linkLabel}
        </Link>
      </div>
      {children}
    </section>
  )
}

function Empty({ children }: { children: ReactNode }) {
  return <div className="py-3 text-center text-sm text-muted">{children}</div>
}

function ProjectRow({ project: p }: { project: Project }) {
  const m = useLabMutation('projects')
  const next = p.tasks.find((t) => !t.done)
  return (
    <li>
      <div className="flex items-center gap-3">
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{p.name}</span>
        {p.tasks_total > 0 && (
          <>
            <div className="flex w-28">
              <Bar percent={p.percent} tone={p.percent === 100 ? 'good' : 'accent'} />
            </div>
            <span className="text-xs font-medium text-muted tabular-nums">
              {p.tasks_done}/{p.tasks_total}
            </span>
          </>
        )}
      </div>
      {next ? (
        <label className="mt-1 flex cursor-pointer items-center gap-2 text-xs text-muted hover:text-fg">
          <input
            type="checkbox"
            className="h-3.5 w-3.5 accent-[var(--accent)]"
            checked={false}
            disabled={m.isPending}
            onChange={() => m.mutate({ method: 'patch', url: `/api/project-tasks/${next.id}`, body: { done: true } })}
          />
          Next: {next.title}
        </label>
      ) : (
        <div className="mt-1 text-xs text-muted">{p.tasks_total ? 'All tasks done' : 'No tasks yet'}</div>
      )}
    </li>
  )
}

function NowNext() {
  const now = useNow()
  const sched = useScheduleDays(localDate(now), 2)
  const items = sched.data?.[0]?.items ?? []
  const { current, next } = nowAndNext(items, now)
  const tomorrow = next ? null : (sched.data?.[1]?.items ?? []).find((i) => !i.skipped)
  const n = nowMin(now)

  return (
    <section className="card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Now</h2>
        <Link to="/schedule" className="text-xs text-muted hover:text-accent">
          Full day →
        </Link>
      </div>
      {sched.isLoading ? null : items.length === 0 && !tomorrow ? (
        <Empty>
          No schedule yet. <Link to="/schedule?view=routine" className="text-accent underline">Set up your routine</Link>
        </Empty>
      ) : (
        <div className="space-y-3">
          {current ? (
            <BlockNow item={current} minutesLeft={Math.ceil(toMin(current.end_time!) - n)} progress={(n - toMin(current.start_time)) / (toMin(current.end_time!) - toMin(current.start_time))} />
          ) : (
            <div className="text-sm text-muted">Nothing scheduled right now.</div>
          )}
          {next && (
            <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3 text-sm">
              <span className="text-xs font-semibold tracking-wide text-muted uppercase">Next</span>
              <span className="tabular-nums">{fmtTime(next.start_time)}</span>
              <span className="font-medium">{next.title}</span>
              <span className="text-xs text-muted">in {fmtIn(toMin(next.start_time) - n)}</span>
            </div>
          )}
          {tomorrow && (
            <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3 text-sm">
              <span className="text-xs font-semibold tracking-wide text-muted uppercase">Tomorrow</span>
              <span className="tabular-nums">{fmtTime(tomorrow.start_time)}</span>
              <span className="font-medium">{tomorrow.title}</span>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

function fmtIn(min: number) {
  const m = Math.max(1, Math.round(min))
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60 ? `${m % 60}m` : ''}`.trim()
}

function BlockNow({ item, minutesLeft, progress }: { item: Occurrence; minutesLeft: number; progress: number }) {
  const timer = useTimer()
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-lg font-semibold">{item.title}</span>
        <CategoryChip category={item.category} />
      </div>
      <div className="mt-0.5 text-xs text-muted">
        {fmtRange(item)} · {minutesLeft} min left
      </div>
      {item.notes && <p className="mt-1 line-clamp-2 text-sm text-muted">{item.notes}</p>}
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-panel-2">
        <div className="h-full bg-accent" style={{ width: `${Math.min(100, progress * 100)}%` }} />
      </div>
      {(item.timer || item.link) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {item.timer && (
            <button className="btn btn-primary" onClick={() => timer.start({ name: item.timer!.name, phases: item.timer!.phases, loop: item.timer!.loop, context: `${item.title} · ${fmtRange(item)}` })}>
              ▶ {item.timer.name} timer
            </button>
          )}
          {item.link && <BlockLink href={item.link} />}
        </div>
      )}
    </div>
  )
}

function FocusCard() {
  const settings = useQuery({ queryKey: ['settings'], queryFn: () => api.get<Settings>('/api/settings') })
  const focus = settings.data?.lab_focus
  if (!focus) return <section className="card p-4" />
  const daysLeft = focus.until ? Math.ceil((parseDay(focus.until).getTime() - parseDay(localDate()).getTime()) / 86400000) : null
  return (
    <section className="card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">
          Priorities
          {daysLeft !== null && <span className="font-normal text-muted"> · {daysLeft >= 0 ? `${daysLeft} days left` : 'period ended'}</span>}
        </h2>
        <Link to="/schedule?view=routine" className="text-xs text-muted hover:text-accent">
          Edit →
        </Link>
      </div>
      {focus.items.length ? (
        <ol className="list-decimal space-y-1 pl-5 text-sm">
          {focus.items.map((x, i) => (
            <li key={i}>{x}</li>
          ))}
        </ol>
      ) : (
        <Empty>No priorities set.</Empty>
      )}
    </section>
  )
}
