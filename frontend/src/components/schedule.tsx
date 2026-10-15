import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type BlockCategory, type Occurrence, type ScheduleBlock, type ScheduleDay, type TimerPreset } from '../api'
import { chime, notify } from './timer'
import { ErrorBox } from './ui'

export const CATEGORY: Record<BlockCategory, { label: string; cls: string }> = {
  routine: { label: 'Routine', cls: 'bg-panel-2 text-muted' },
  work: { label: 'Work', cls: 'bg-accent-soft text-accent' },
  meeting: { label: 'Meeting', cls: 'bg-warn-soft text-warn' },
  study: { label: 'Study', cls: 'bg-good-soft text-good' },
  health: { label: 'Health', cls: 'bg-[#e0f5f3] text-[#0f766e] dark:bg-[#0f2e2c] dark:text-[#5eead4]' },
  free: { label: 'Free', cls: 'bg-[#f3e8ff] text-[#7e22ce] dark:bg-[#2e1065] dark:text-[#d8b4fe]' },
}

export const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// --- dates & times (all local) ---------------------------------------------------------------

export function localDate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function parseDay(ds: string) {
  return new Date(ds + 'T00:00')
}

export function addDays(ds: string, n: number) {
  const d = parseDay(ds)
  d.setDate(d.getDate() + n)
  return localDate(d)
}

export function weekStart(ds: string) {
  return addDays(ds, -((parseDay(ds).getDay() + 6) % 7))
}

export function toMin(t: string) {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

export function fmtTime(t: string) {
  const [h, m] = t.split(':').map(Number)
  return new Date(2000, 0, 1, h, m).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

export function fmtRange(b: { start_time: string; end_time: string | null }) {
  return b.end_time ? `${fmtTime(b.start_time)} – ${fmtTime(b.end_time)}` : fmtTime(b.start_time)
}

export function nowMin(d = new Date()) {
  return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60
}

/** Re-render on an interval so "now" markers move. */
export function useNow(ms = 30000) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), ms)
    return () => clearInterval(id)
  }, [ms])
  return now
}

// --- data ------------------------------------------------------------------------------------

export function useScheduleDays(start: string, days = 1) {
  return useQuery({
    queryKey: ['schedule', start, days],
    queryFn: () => api.get<ScheduleDay[]>(`/api/schedule?start=${start}&days=${days}`),
  })
}

export function useBlocks() {
  return useQuery({ queryKey: ['schedule-blocks'], queryFn: () => api.get<ScheduleBlock[]>('/api/schedule/blocks') })
}

export function useTimers() {
  return useQuery({ queryKey: ['timers'], queryFn: () => api.get<TimerPreset[]>('/api/timers') })
}

type Req = { method: 'post' | 'patch' | 'del'; url: string; body?: unknown }

export function useScheduleMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ method, url, body }: Req) => (method === 'del' ? api.del(url) : api[method](url, body)),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['schedule'] })
      qc.invalidateQueries({ queryKey: ['schedule-blocks'] })
      qc.invalidateQueries({ queryKey: ['timers'] })
    },
  })
}

/** Current and next non-skipped blocks for today. */
export function nowAndNext(items: Occurrence[], now: Date) {
  const n = nowMin(now)
  const live = items.filter((i) => !i.skipped)
  const current = live.filter((i) => i.end_time && toMin(i.start_time) <= n && n < toMin(i.end_time)).pop() ?? null
  const next = live.find((i) => toMin(i.start_time) > n) ?? null
  return { current, next }
}

export function CategoryChip({ category }: { category: BlockCategory }) {
  const c = CATEGORY[category]
  return <span className={`chip ${c.cls}`}>{c.label}</span>
}

export function BlockLink({ href }: { href: string }) {
  if (href.startsWith('/'))
    return (
      <Link to={href} className="btn">
        Open {href.slice(1).split('/')[0] || 'page'} →
      </Link>
    )
  if (!/^https?:\/\//i.test(href)) return null
  return (
    <a href={href} target="_blank" rel="noreferrer" className="btn">
      Open ↗
    </a>
  )
}

// --- block editor ----------------------------------------------------------------------------

const LINKS = ['/dsa', '/books', '/projects', '/cheatsheet', '/progress']

export type BlockDraft = Omit<ScheduleBlock, 'id' | 'timer' | 'moved_from_id'>

export function emptyBlock(date: string | null): BlockDraft {
  return { title: '', start_time: '09:00', end_time: '10:00', days: date ? [] : [0, 1, 2, 3, 4], date, category: 'routine', timer_id: null, link: '', notes: '', optional: false }
}

export function BlockForm({ block, initial, onDone }: { block?: ScheduleBlock; initial: BlockDraft; onDone: () => void }) {
  const m = useScheduleMutation()
  const timers = useTimers()
  const [f, setF] = useState<BlockDraft>(initial)
  const oneOff = !!f.date
  const set = <K extends keyof BlockDraft>(k: K, v: BlockDraft[K]) => setF((x) => ({ ...x, [k]: v }))

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const body = { ...f, end_time: f.end_time || null, title: f.title.trim() }
    if (block) {
      const patch: Partial<BlockDraft> = { ...body }
      delete patch.date // a block can't switch between one-off and recurring
      m.mutate({ method: 'patch', url: `/api/schedule/blocks/${block.id}`, body: patch }, { onSuccess: onDone })
    } else m.mutate({ method: 'post', url: '/api/schedule/blocks', body }, { onSuccess: onDone })
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <ErrorBox error={m.error} />
      <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr]">
        <label>
          <span className="label">Title</span>
          <input className="input" autoFocus required value={f.title} onChange={(e) => set('title', e.target.value)} />
        </label>
        <label>
          <span className="label">Start</span>
          <input className="input" type="time" required value={f.start_time} onChange={(e) => set('start_time', e.target.value)} />
        </label>
        <label>
          <span className="label">End (optional)</span>
          <input className="input" type="time" value={f.end_time ?? ''} onChange={(e) => set('end_time', e.target.value || null)} />
        </label>
      </div>

      {oneOff ? (
        <label className="block">
          <span className="label">Date</span>
          <input className="input w-48" type="date" required value={f.date ?? ''} onChange={(e) => set('date', e.target.value)} disabled={!!block} />
        </label>
      ) : (
        <div>
          <span className="label">Repeats on</span>
          <div className="flex flex-wrap gap-1.5">
            {DAY_SHORT.map((d, i) => {
              const on = f.days.includes(i)
              return (
                <button
                  type="button"
                  key={d}
                  aria-pressed={on}
                  className={`btn px-2.5 ${on ? 'border-accent bg-accent-soft text-accent' : 'text-muted'}`}
                  onClick={() => set('days', on ? f.days.filter((x) => x !== i) : [...f.days, i].sort())}
                >
                  {d}
                </button>
              )
            })}
            <span className="mx-1 self-center text-line">|</span>
            <button type="button" className="btn btn-ghost px-2 text-xs" onClick={() => set('days', [0, 1, 2, 3, 4])}>
              Weekdays
            </button>
            <button type="button" className="btn btn-ghost px-2 text-xs" onClick={() => set('days', [0, 1, 2, 3, 4, 5, 6])}>
              Every day
            </button>
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <label>
          <span className="label">Category</span>
          <select className="input" value={f.category} onChange={(e) => set('category', e.target.value as BlockCategory)}>
            {Object.entries(CATEGORY).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="label">Timer</span>
          <select className="input" value={f.timer_id ?? ''} onChange={(e) => set('timer_id', e.target.value ? Number(e.target.value) : null)}>
            <option value="">None</option>
            {(timers.data ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="label">Link (page or URL)</span>
          <input className="input" list="block-links" placeholder="/dsa, /books, https://…" value={f.link} onChange={(e) => set('link', e.target.value)} />
          <datalist id="block-links">
            {LINKS.map((l) => (
              <option key={l} value={l} />
            ))}
          </datalist>
        </label>
      </div>
      <label className="block">
        <span className="label">Notes</span>
        <textarea className="input min-h-14" value={f.notes} onChange={(e) => set('notes', e.target.value)} />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4 accent-[var(--accent)]" checked={f.optional} onChange={(e) => set('optional', e.target.checked)} />
          Optional
        </label>
        <div className="ml-auto flex gap-2">
          {block && (
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => confirm(`Delete "${block.title}"${block.date ? '' : ' from every day it repeats on'}?`) && m.mutate({ method: 'del', url: `/api/schedule/blocks/${block.id}` }, { onSuccess: onDone })}
            >
              Delete
            </button>
          )}
          <button type="button" className="btn" onClick={onDone}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={m.isPending || !f.title.trim() || (!oneOff && f.days.length === 0)}>
            {block ? 'Save' : 'Add'}
          </button>
        </div>
      </div>
    </form>
  )
}

// --- reminders -------------------------------------------------------------------------------

const NOTIFY_KEY = 'studylab.notify'
const SENT_KEY = 'studylab.notified'

export function readNotifyPref() {
  try {
    return localStorage.getItem(NOTIFY_KEY) === '1'
  } catch {
    return false
  }
}

/** App-wide: when a block starts, chime and send a desktop notification (opt-in). */
export function useBlockReminders() {
  const today = localDate()
  const sched = useQuery({
    queryKey: ['schedule', today, 1],
    queryFn: () => api.get<ScheduleDay[]>(`/api/schedule?start=${today}&days=1`),
    refetchInterval: 5 * 60000,
  })
  const now = useNow(20000)
  useEffect(() => {
    if (!readNotifyPref() || !sched.data) return
    const n = nowMin(now)
    let sent: string[] = []
    try {
      sent = JSON.parse(localStorage.getItem(SENT_KEY) ?? '[]')
    } catch {
      /* ignore */
    }
    let changed = false
    for (const it of sched.data[0]?.items ?? []) {
      const key = `${today}:${it.id}:${it.start_time}`
      const start = toMin(it.start_time)
      if (it.skipped || sent.includes(key) || n < start || n - start > 2) continue
      notify(`${it.title} · ${fmtRange(it)}`, it.notes || CATEGORY[it.category].label)
      chime(1)
      sent.push(key)
      changed = true
    }
    if (changed) {
      try {
        localStorage.setItem(SENT_KEY, JSON.stringify(sent.filter((k) => k.startsWith(today))))
      } catch {
        /* ignore */
      }
    }
  }, [now, sched.data, today])
}

export function ReminderToggle() {
  const [on, setOn] = useState(readNotifyPref)
  const perm = typeof Notification === 'undefined' ? 'unsupported' : Notification.permission
  const toggle = async () => {
    const next = !on
    if (next && perm === 'default') await Notification.requestPermission()
    try {
      localStorage.setItem(NOTIFY_KEY, next ? '1' : '0')
    } catch {
      /* ignore */
    }
    setOn(next)
  }
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-muted" title="Desktop notification + chime when each block starts (while Study Lab is open in a tab)">
      <input type="checkbox" className="h-4 w-4 accent-[var(--accent)]" checked={on} onChange={toggle} disabled={perm === 'unsupported'} />
      Remind me when blocks start
      {on && perm === 'denied' && <span className="text-xs text-bad">(notifications blocked in browser; chime only)</span>}
    </label>
  )
}
