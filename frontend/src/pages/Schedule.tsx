import { useQuery, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, type ReactNode, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api, type LabFocus, type Occurrence, type ScheduleBlock, type Settings, type TimerPhase, type TimerPreset } from '../api'
import {
  addDays,
  BlockForm,
  BlockLink,
  CATEGORY,
  CategoryChip,
  DAY_SHORT,
  emptyBlock,
  fmtRange,
  fmtTime,
  localDate,
  nowMin,
  parseDay,
  ReminderToggle,
  toMin,
  useBlocks,
  useNow,
  useScheduleDays,
  useScheduleMutation,
  useTimers,
  weekStart,
} from '../components/schedule'
import { useTimer } from '../components/timer'
import { ErrorBox, Loading, PageHeader } from '../components/ui'

type View = 'day' | 'week' | 'routine' | 'timers'
const VIEWS: { key: View; label: string }[] = [
  { key: 'day', label: 'Day' },
  { key: 'week', label: 'Week' },
  { key: 'routine', label: 'Routine' },
  { key: 'timers', label: 'Timers' },
]

export default function Schedule() {
  const [params, setParams] = useSearchParams()
  const view = (params.get('view') as View) || 'day'
  const date = params.get('date') || localDate()
  const go = (v: View, d?: string) => setParams((p) => {
    p.set('view', v)
    if (d) p.set('date', d)
    else p.delete('date')
    return p
  })

  return (
    <div>
      <PageHeader
        title="Schedule"
        subtitle="Your routine, timers and one-off changes"
        actions={
          <div className="flex rounded-lg border border-line bg-panel p-0.5" role="tablist">
            {VIEWS.map((v) => (
              <button
                key={v.key}
                role="tab"
                aria-selected={view === v.key}
                className={`rounded-md px-3 py-1 text-sm font-medium ${view === v.key ? 'bg-accent-soft text-accent' : 'text-muted hover:text-fg'}`}
                onClick={() => go(v.key, v.key === 'day' || v.key === 'week' ? params.get('date') ?? undefined : undefined)}
              >
                {v.label}
              </button>
            ))}
          </div>
        }
      />
      {view === 'day' && <DayView date={date} setDate={(d) => go('day', d === localDate() ? undefined : d)} />}
      {view === 'week' && <WeekView date={date} setDate={(d) => go('week', d)} openDay={(d) => go('day', d)} />}
      {view === 'routine' && <RoutineView />}
      {view === 'timers' && <TimersView />}
    </div>
  )
}

function DateNav({ label, onPrev, onNext, onToday, isToday }: { label: ReactNode; onPrev: () => void; onNext: () => void; onToday: () => void; isToday: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <button className="btn btn-ghost px-2" onClick={onPrev} aria-label="Previous">
        ←
      </button>
      <button className="btn btn-ghost px-2" onClick={onNext} aria-label="Next">
        →
      </button>
      <h2 className="text-lg font-semibold">{label}</h2>
      {!isToday && (
        <button className="btn ml-1 px-2 py-1 text-xs" onClick={onToday}>
          Today
        </button>
      )}
    </div>
  )
}

// --- day -------------------------------------------------------------------------------------

function DayView({ date, setDate }: { date: string; setDate: (d: string) => void }) {
  const sched = useScheduleDays(date)
  const now = useNow()
  const [adding, setAdding] = useState(false)
  const today = localDate(now)
  const isToday = date === today
  const items = sched.data?.[0]?.items ?? []
  const n = nowMin(now)
  const nowIdx = isToday ? items.findIndex((i) => toMin(i.start_time) > n) : -1
  const label = parseDay(date).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <DateNav label={label} isToday={isToday} onPrev={() => setDate(addDays(date, -1))} onNext={() => setDate(addDays(date, 1))} onToday={() => setDate(today)} />
        <div className="flex flex-wrap items-center gap-4">
          <ReminderToggle />
          <button className="btn btn-primary" onClick={() => setAdding((a) => !a)}>
            {adding ? 'Cancel' : '+ Event this day'}
          </button>
        </div>
      </div>
      {adding && (
        <div className="card p-4">
          <BlockForm initial={emptyBlock(date)} onDone={() => setAdding(false)} />
        </div>
      )}
      <ErrorBox error={sched.error} />
      {sched.isLoading ? (
        <Loading />
      ) : items.length === 0 ? (
        <div className="card p-8 text-center text-sm text-muted">
          Nothing scheduled. Add recurring blocks under <b>Routine</b>, or a one-off event for this day.
        </div>
      ) : (
        <ol className="space-y-2">
          {items.map((it, i) => (
            <li key={`${it.id}-${it.start_time}`}>
              {i === nowIdx && <NowLine now={now} />}
              <OccurrenceRow item={it} date={date} now={isToday ? n : date < today ? Infinity : -Infinity} />
            </li>
          ))}
          {isToday && nowIdx === -1 && <NowLine now={now} />}
        </ol>
      )}
    </div>
  )
}

function NowLine({ now }: { now: Date }) {
  return (
    <div className="my-2 flex items-center gap-2 text-xs font-semibold text-bad" aria-label="Current time">
      <span className="w-16 text-right tabular-nums sm:w-28">{now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</span>
      <span className="h-2 w-2 rounded-full bg-bad" />
      <span className="h-px flex-1 bg-bad/60" />
    </div>
  )
}

function OccurrenceRow({ item: it, date, now }: { item: Occurrence; date: string; now: number }) {
  const m = useScheduleMutation()
  const timer = useTimer()
  const [mode, setMode] = useState<'view' | 'edit' | 'move'>('view')
  const start = toMin(it.start_time)
  const end = it.end_time ? toMin(it.end_time) : start
  const current = !it.skipped && it.end_time !== null && start <= now && now < end
  const past = now >= Math.max(end, start + 1)
  const oneOff = !!it.date

  return (
    <div className="flex gap-3">
      <div className={`w-16 shrink-0 pt-3 text-right text-xs tabular-nums sm:w-28 sm:text-sm ${current ? 'font-semibold text-accent' : 'text-muted'}`}>
        <div>{fmtTime(it.start_time)}</div>
        {it.end_time && <div className="text-xs">{fmtTime(it.end_time)}</div>}
      </div>
      <div className={`card min-w-0 flex-1 p-3 ${current ? 'border-accent ring-1 ring-accent' : ''} ${it.skipped ? 'border-dashed opacity-50' : past ? 'opacity-60' : ''}`}>
        <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
          <div className="min-w-[min(14rem,100%)] flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`font-semibold ${it.skipped ? 'line-through' : ''}`}>{it.title}</span>
              <CategoryChip category={it.category} />
              {it.optional && <span className="chip bg-panel-2 text-muted">optional</span>}
              {it.moved_from_id && <span className="chip bg-panel-2 text-muted">moved</span>}
              {oneOff && !it.moved_from_id && <span className="chip bg-panel-2 text-muted">one-off</span>}
              {it.skipped && <span className="chip bg-panel-2 text-muted">skipped</span>}
              {current && <span className="chip bg-accent text-white">now · {Math.ceil(end - now)} min left</span>}
            </div>
            {it.notes && <p className="mt-1 text-sm whitespace-pre-wrap text-muted">{it.notes}</p>}
            {current && (
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-panel-2">
                <div className="h-full bg-accent" style={{ width: `${(100 * (now - start)) / (end - start)}%` }} />
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {it.timer && !it.skipped && (
              <button
                className={`btn ${current ? 'btn-primary' : ''}`}
                title={it.timer.phases.map((p) => `${p.label} ${p.minutes}m`).join(' → ')}
                onClick={() => timer.start({ name: it.timer!.name, phases: it.timer!.phases, loop: it.timer!.loop, context: `${it.title} · ${fmtRange(it)}` })}
              >
                ▶ {it.timer.name}
              </button>
            )}
            {it.link && <BlockLink href={it.link} />}
            {it.skipped ? (
              <button className="btn" onClick={() => m.mutate({ method: 'del', url: `/api/schedule/blocks/${it.id}/skip/${date}` })}>
                Restore
              </button>
            ) : (
              <>
                <button className="btn btn-ghost px-2 text-xs" onClick={() => setMode(mode === 'move' ? 'view' : 'move')}>
                  Move
                </button>
                {oneOff ? (
                  <button className="btn btn-ghost px-2 text-xs" onClick={() => setMode(mode === 'edit' ? 'view' : 'edit')}>
                    Edit
                  </button>
                ) : (
                  <button className="btn btn-ghost px-2 text-xs" title="Skip just this day" onClick={() => m.mutate({ method: 'post', url: `/api/schedule/blocks/${it.id}/skip`, body: { date } })}>
                    Skip
                  </button>
                )}
                {it.moved_from_id && (
                  <button className="btn btn-ghost px-2 text-xs" title="Put it back at its usual time" onClick={() => m.mutate({ method: 'del', url: `/api/schedule/blocks/${it.id}` })}>
                    Undo move
                  </button>
                )}
              </>
            )}
          </div>
        </div>
        <ErrorBox error={m.error} />
        {mode === 'move' && <MoveForm item={it} date={date} onDone={() => setMode('view')} />}
        {mode === 'edit' && (
          <div className="mt-3 border-t border-line pt-3">
            <BlockForm block={it} initial={{ ...it }} onDone={() => setMode('view')} />
          </div>
        )}
      </div>
    </div>
  )
}

function MoveForm({ item, date, onDone }: { item: Occurrence; date: string; onDone: () => void }) {
  const m = useScheduleMutation()
  const [f, setF] = useState({ to_date: date, start_time: item.start_time, end_time: item.end_time ?? '' })
  const submit = (e: FormEvent) => {
    e.preventDefault()
    m.mutate(
      { method: 'post', url: `/api/schedule/blocks/${item.id}/move`, body: { date, to_date: f.to_date, start_time: f.start_time, end_time: f.end_time || null } },
      { onSuccess: onDone },
    )
  }
  return (
    <form onSubmit={submit} className="mt-3 flex flex-wrap items-end gap-2 border-t border-line pt-3">
      <label>
        <span className="label">Move to</span>
        <input className="input" type="date" value={f.to_date} onChange={(e) => setF({ ...f, to_date: e.target.value })} />
      </label>
      <label>
        <span className="label">Start</span>
        <input className="input" type="time" required value={f.start_time} onChange={(e) => setF({ ...f, start_time: e.target.value })} />
      </label>
      <label>
        <span className="label">End</span>
        <input className="input" type="time" value={f.end_time} onChange={(e) => setF({ ...f, end_time: e.target.value })} />
      </label>
      <button className="btn btn-primary" disabled={m.isPending}>
        Move {item.date ? 'event' : 'this occurrence'}
      </button>
      <button type="button" className="btn" onClick={onDone}>
        Cancel
      </button>
      <ErrorBox error={m.error} />
      {!item.date && <p className="w-full text-xs text-muted">Only this day changes; the routine stays as it is.</p>}
    </form>
  )
}

// --- week ------------------------------------------------------------------------------------

const PX_PER_MIN = 0.9

function WeekView({ date, setDate, openDay }: { date: string; setDate: (d: string) => void; openDay: (d: string) => void }) {
  const start = weekStart(date)
  const sched = useScheduleDays(start, 7)
  const now = useNow()
  const today = localDate(now)
  const days = sched.data ?? []
  const all = days.flatMap((d) => d.items)
  const lo = all.length ? Math.floor(Math.min(...all.map((i) => toMin(i.start_time))) / 60) * 60 : 7 * 60
  const hi = all.length ? Math.ceil(Math.max(...all.map((i) => (i.end_time ? toMin(i.end_time) : toMin(i.start_time) + 30))) / 60) * 60 : 22 * 60
  const height = (hi - lo) * PX_PER_MIN
  const hours = Array.from({ length: (hi - lo) / 60 + 1 }, (_, k) => lo + k * 60)
  const fmtD = (d: string, o: Intl.DateTimeFormatOptions) => parseDay(d).toLocaleDateString(undefined, o)
  const label = `${fmtD(start, { month: 'short', day: 'numeric' })} – ${fmtD(addDays(start, 6), { month: 'short', day: 'numeric', year: 'numeric' })}`

  return (
    <div className="space-y-4">
      <DateNav label={label} isToday={start === weekStart(today)} onPrev={() => setDate(addDays(start, -7))} onNext={() => setDate(addDays(start, 7))} onToday={() => setDate(today)} />
      <ErrorBox error={sched.error} />
      {sched.isLoading ? (
        <Loading />
      ) : (
        <div className="card overflow-x-auto">
          <div className="grid min-w-[640px] grid-cols-[3.5rem_repeat(7,minmax(0,1fr))]">
            <div className="border-b border-line" />
            {days.map((d) => (
              <button
                key={d.date}
                onClick={() => openDay(d.date)}
                className={`border-b border-l border-line px-2 py-2 text-left text-xs hover:bg-panel-2 ${d.date === today ? 'text-accent' : 'text-muted'}`}
              >
                <div className="font-semibold uppercase">{DAY_SHORT[d.weekday]}</div>
                <div className={`text-lg font-bold ${d.date === today ? '' : 'text-fg'}`}>{parseDay(d.date).getDate()}</div>
              </button>
            ))}
            <div className="relative" style={{ height }}>
              {hours.map((h) => (
                <div key={h} className="absolute right-1.5 -translate-y-1/2 text-[10px] text-muted tabular-nums" style={{ top: (h - lo) * PX_PER_MIN }}>
                  {h < hi ? fmtTime(`${String(Math.floor(h / 60) % 24).padStart(2, '0')}:00`).replace(':00', '') : ''}
                </div>
              ))}
            </div>
            {days.map((d) => (
              <div key={d.date} className={`relative border-l border-line ${d.date === today ? 'bg-accent-soft/30' : ''}`} style={{ height }}>
                {hours.map((h) => (
                  <div key={h} className="absolute inset-x-0 border-t border-line/60" style={{ top: (h - lo) * PX_PER_MIN }} />
                ))}
                {layoutDay(d.items).map(({ item, lane, lanes }) => {
                  const s = toMin(item.start_time)
                  const e = item.end_time ? toMin(item.end_time) : s
                  const top = (s - lo) * PX_PER_MIN
                  const h = Math.max((e - s) * PX_PER_MIN, item.end_time ? 16 : 3)
                  const style = { top, height: h, left: `calc(${(100 * lane) / lanes}% + 2px)`, width: `calc(${100 / lanes}% - 4px)` }
                  if (!item.end_time)
                    return (
                      <div key={`${item.id}-${item.start_time}`} className={`absolute rounded-sm ${CATEGORY[item.category].cls}`} style={style} title={`${item.title} · ${fmtRange(item)}`}>
                        <span className="absolute top-1 left-1 text-[10px] leading-none font-semibold whitespace-nowrap">{item.title}</span>
                      </div>
                    )
                  return (
                    <button
                      key={`${item.id}-${item.start_time}`}
                      onClick={() => openDay(d.date)}
                      title={`${item.title} · ${fmtRange(item)}${item.skipped ? ' (skipped)' : ''}`}
                      className={`absolute flex flex-col justify-start overflow-hidden rounded-md border-l-[3px] border-current px-1.5 py-0.5 text-left text-[11px] leading-tight ${CATEGORY[item.category].cls} ${item.skipped ? 'border-dashed opacity-35' : ''} ${item.optional ? 'opacity-80' : ''}`}
                      style={style}
                    >
                      <div className={`truncate font-semibold ${item.skipped ? 'line-through' : ''}`}>{item.title}</div>
                      {h > 28 && <div className="truncate opacity-80">{fmtRange(item)}</div>}
                    </button>
                  )
                })}
                {d.date === today && nowMin(now) >= lo && nowMin(now) <= hi && (
                  <div className="absolute inset-x-0 z-10 h-0.5 bg-bad" style={{ top: (nowMin(now) - lo) * PX_PER_MIN }}>
                    <div className="absolute -top-1 -left-1 h-2.5 w-2.5 rounded-full bg-bad" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      <Legend />
    </div>
  )
}

/** Side-by-side lanes for overlapping blocks within a day. */
function layoutDay(items: Occurrence[]) {
  const out: { item: Occurrence; lane: number; lanes: number }[] = []
  let cluster: { item: Occurrence; lane: number }[] = []
  let laneEnds: number[] = []
  let clusterEnd = -1
  const flush = () => {
    for (const c of cluster) out.push({ ...c, lanes: laneEnds.length })
    cluster = []
    laneEnds = []
  }
  for (const item of items) {
    const s = toMin(item.start_time)
    const e = item.end_time ? toMin(item.end_time) : s + 1
    if (s >= clusterEnd) flush()
    let lane = laneEnds.findIndex((end) => end <= s)
    if (lane === -1) lane = laneEnds.push(e) - 1
    else laneEnds[lane] = e
    cluster.push({ item, lane })
    clusterEnd = Math.max(clusterEnd, e)
  }
  flush()
  return out
}

function Legend() {
  return (
    <div className="flex flex-wrap gap-2">
      {Object.keys(CATEGORY).map((k) => (
        <CategoryChip key={k} category={k as keyof typeof CATEGORY} />
      ))}
    </div>
  )
}

// --- routine ---------------------------------------------------------------------------------

export function daysLabel(days: number[]) {
  const k = days.join(',')
  if (k === '0,1,2,3,4,5,6') return 'Every day'
  if (k === '0,1,2,3,4') return 'Weekdays'
  if (k === '5,6') return 'Weekends'
  return days.map((d) => DAY_SHORT[d]).join(', ')
}

function RoutineView() {
  const blocks = useBlocks()
  const [editing, setEditing] = useState<number | 'new' | null>(null)
  const recurring = (blocks.data ?? []).filter((b) => !b.date).sort((a, b) => a.start_time.localeCompare(b.start_time) || a.days[0] - b.days[0])
  const oneOffs = (blocks.data ?? []).filter((b) => b.date)

  return (
    <div className="space-y-6">
      <FocusEditor />
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="label mb-0">Recurring blocks</h2>
          <button className="btn btn-primary" onClick={() => setEditing(editing === 'new' ? null : 'new')}>
            {editing === 'new' ? 'Cancel' : '+ Add block'}
          </button>
        </div>
        {editing === 'new' && (
          <div className="card mb-3 p-4">
            <BlockForm initial={emptyBlock(null)} onDone={() => setEditing(null)} />
          </div>
        )}
        <ErrorBox error={blocks.error} />
        {blocks.isLoading ? (
          <Loading />
        ) : recurring.length === 0 ? (
          <div className="card p-6 text-center text-sm text-muted">No routine yet. Add blocks like “Scrum, 8:15–8:35, weekdays”.</div>
        ) : (
          <ul className="card divide-y divide-line">
            {recurring.map((b) => (
              <BlockRow key={b.id} block={b} open={editing === b.id} toggle={() => setEditing(editing === b.id ? null : b.id)} />
            ))}
          </ul>
        )}
      </section>
      {oneOffs.length > 0 && (
        <section>
          <h2 className="label">Upcoming one-off events</h2>
          <ul className="card divide-y divide-line">
            {oneOffs.map((b) => (
              <BlockRow key={b.id} block={b} open={editing === b.id} toggle={() => setEditing(editing === b.id ? null : b.id)} />
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function BlockRow({ block: b, open, toggle }: { block: ScheduleBlock; open: boolean; toggle: () => void }) {
  return (
    <li>
      <button className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-left hover:bg-panel-2" onClick={toggle} aria-expanded={open}>
        <span className="w-36 shrink-0 text-sm text-muted tabular-nums">{fmtRange(b)}</span>
        <span className="min-w-0 flex-1 truncate font-medium">{b.title}</span>
        <span className="text-xs text-muted">{b.date ? parseDay(b.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) : daysLabel(b.days)}</span>
        {b.optional && <span className="chip bg-panel-2 text-muted">optional</span>}
        {b.timer && <span className="chip bg-panel-2 text-muted">⏱ {b.timer.name}</span>}
        <CategoryChip category={b.category} />
      </button>
      {open && (
        <div className="border-t border-line bg-panel-2/40 p-4">
          {!b.date && <p className="mb-3 text-xs text-muted">Changes apply to every {daysLabel(b.days).toLowerCase()} occurrence. To change a single day, use Move or Skip in the Day view.</p>}
          <BlockForm block={b} initial={{ ...b }} onDone={toggle} />
        </div>
      )}
    </li>
  )
}

function FocusEditor() {
  const qc = useQueryClient()
  const settings = useQuery({ queryKey: ['settings'], queryFn: () => api.get<Settings>('/api/settings') })
  const focus = settings.data?.lab_focus
  const [draft, setDraft] = useState<{ text: string; until: string } | null>(null)
  const [error, setError] = useState<unknown>(null)
  if (!focus) return null
  const save = async () => {
    if (!draft) return
    const value: LabFocus = { items: draft.text.split('\n').map((s) => s.replace(/^\s*\d+[.)]\s*/, '').trim()).filter(Boolean), until: draft.until || null }
    try {
      qc.setQueryData(['settings'], await api.put<Settings>('/api/settings', { lab_focus: value }))
      setDraft(null)
      setError(null)
    } catch (e) {
      setError(e)
    }
  }
  return (
    <section className="card p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">
          Current priorities{focus.until && <span className="font-normal text-muted"> · until {parseDay(focus.until).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>}
        </h2>
        {!draft && (
          <button className="btn btn-ghost px-2 text-xs" onClick={() => setDraft({ text: focus.items.join('\n'), until: focus.until ?? '' })}>
            Edit
          </button>
        )}
      </div>
      <ErrorBox error={error} />
      {draft ? (
        <div className="space-y-2">
          <textarea className="input min-h-28" placeholder="One priority per line, most important first" value={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.value })} />
          <div className="flex flex-wrap items-end gap-2">
            <label>
              <span className="label">Until</span>
              <input className="input" type="date" value={draft.until} onChange={(e) => setDraft({ ...draft, until: e.target.value })} />
            </label>
            <div className="ml-auto flex gap-2">
              <button className="btn" onClick={() => setDraft(null)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={save}>
                Save
              </button>
            </div>
          </div>
        </div>
      ) : focus.items.length ? (
        <ol className="list-decimal space-y-1 pl-5 text-sm">
          {focus.items.map((x, i) => (
            <li key={i}>{x}</li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-muted">No priorities set. They show on the Lab dashboard.</p>
      )}
    </section>
  )
}

// --- timers ----------------------------------------------------------------------------------

function TimersView() {
  const timers = useTimers()
  const [adding, setAdding] = useState(false)
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">Attach a timer to a block, then start it from the Day view. It keeps running while you use other pages.</p>
        <button className="btn btn-primary" onClick={() => setAdding((a) => !a)}>
          {adding ? 'Cancel' : '+ New timer'}
        </button>
      </div>
      <ErrorBox error={timers.error} />
      {adding && <TimerCard onDone={() => setAdding(false)} />}
      {timers.isLoading ? (
        <Loading />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {(timers.data ?? []).map((t) => (
            <TimerCard key={t.id} preset={t} />
          ))}
        </div>
      )}
    </div>
  )
}

function TimerCard({ preset, onDone }: { preset?: TimerPreset; onDone?: () => void }) {
  const m = useScheduleMutation()
  const timer = useTimer()
  const init = { name: preset?.name ?? '', loop: preset?.loop ?? false, phases: preset?.phases ?? [{ label: 'Focus', minutes: 25 }] }
  const [f, setF] = useState(init)
  const dirty = JSON.stringify(f) !== JSON.stringify(init)
  const setPhase = (i: number, p: Partial<TimerPhase>) => setF({ ...f, phases: f.phases.map((x, k) => (k === i ? { ...x, ...p } : x)) })
  const total = f.phases.reduce((a, p) => a + (Number(p.minutes) || 0), 0)
  const valid = f.name.trim() && f.phases.length > 0 && f.phases.every((p) => p.label.trim() && p.minutes > 0)

  const save = () =>
    preset
      ? m.mutate({ method: 'patch', url: `/api/timers/${preset.id}`, body: f })
      : m.mutate({ method: 'post', url: '/api/timers', body: f }, { onSuccess: onDone })

  return (
    <div className="card space-y-3 p-4">
      <ErrorBox error={m.error} />
      <div className="flex items-center gap-2">
        <input className="input font-semibold" placeholder="Timer name" aria-label="Timer name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <span className="shrink-0 text-xs text-muted tabular-nums">{total} min</span>
      </div>
      <ol className="space-y-1.5">
        {f.phases.map((p, i) => (
          <li key={i} className="flex items-center gap-2">
            <span className="w-5 text-right text-xs text-muted">{i + 1}.</span>
            <input className="input flex-1" aria-label={`Phase ${i + 1} label`} value={p.label} onChange={(e) => setPhase(i, { label: e.target.value })} />
            <input className="input w-20 text-right tabular-nums" type="number" min={1} aria-label={`Phase ${i + 1} minutes`} value={p.minutes} onChange={(e) => setPhase(i, { minutes: Number(e.target.value) })} />
            <span className="text-xs text-muted">min</span>
            <button className="btn btn-ghost px-2 text-muted" aria-label="Remove phase" disabled={f.phases.length === 1} onClick={() => setF({ ...f, phases: f.phases.filter((_, k) => k !== i) })}>
              ✕
            </button>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn btn-ghost px-2 text-xs" onClick={() => setF({ ...f, phases: [...f.phases, { label: 'Break', minutes: 5 }] })}>
          + Phase
        </button>
        <label className="flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" className="h-4 w-4 accent-[var(--accent)]" checked={f.loop} onChange={(e) => setF({ ...f, loop: e.target.checked })} />
          Repeat until stopped
        </label>
        <div className="ml-auto flex gap-2">
          {preset && (
            <button className="btn btn-ghost px-2 text-xs text-muted hover:text-bad" onClick={() => confirm(`Delete timer "${preset.name}"? Blocks using it keep working without a timer.`) && m.mutate({ method: 'del', url: `/api/timers/${preset.id}` })}>
              Delete
            </button>
          )}
          {preset && !dirty && (
            <button className="btn" onClick={() => timer.start({ name: preset.name, phases: preset.phases, loop: preset.loop })}>
              ▶ Start
            </button>
          )}
          {(dirty || !preset) && (
            <button className="btn btn-primary" disabled={!valid || m.isPending} onClick={save}>
              {preset ? 'Save' : 'Create'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
