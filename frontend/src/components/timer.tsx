import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { TimerPhase } from '../api'

/**
 * One phased timer for the whole app (e.g. 5 min understand → 20 attempt → 5 record).
 * State is wall-clock based and kept in localStorage, so it survives reloads and page changes.
 */
interface TimerState {
  name: string
  context?: string // the schedule block it was started from
  phases: TimerPhase[]
  loop: boolean
  startedAt: number
  pausedAt: number | null
  pausedMs: number // total time spent paused
  skippedMs: number // time jumped over by "skip phase"
}

export interface TimerView {
  state: TimerState
  phaseIndex: number
  phase: TimerPhase
  next: TimerPhase | null
  round: number
  remainingMs: number
  phaseMs: number
  done: boolean
}

interface Ctx {
  view: TimerView | null
  start: (t: { name: string; phases: TimerPhase[]; loop: boolean; context?: string }) => void
  pause: () => void
  resume: () => void
  skip: () => void
  stop: () => void
}

const TimerCtx = createContext<Ctx | null>(null)
const KEY = 'studylab.timer'

function load(): TimerState | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as TimerState) : null
  } catch {
    return null
  }
}

function save(s: TimerState | null) {
  try {
    if (s) localStorage.setItem(KEY, JSON.stringify(s))
    else localStorage.removeItem(KEY)
  } catch {
    /* storage unavailable; timer still works for this page */
  }
}

function compute(s: TimerState, now: number): TimerView {
  const elapsed = (s.pausedAt ?? now) - s.startedAt - s.pausedMs + s.skippedMs
  const lens = s.phases.map((p) => p.minutes * 60000)
  const total = lens.reduce((a, b) => a + b, 0)
  const done = !s.loop && elapsed >= total
  const round = s.loop ? Math.floor(elapsed / total) : 0
  let t = done ? total - 1 : s.loop ? elapsed % total : elapsed
  let i = 0
  while (i < lens.length - 1 && t >= lens[i]) t -= lens[i++]
  const next = i + 1 < s.phases.length ? s.phases[i + 1] : s.loop ? s.phases[0] : null
  return { state: s, phaseIndex: i, phase: s.phases[i], next, round, remainingMs: done ? 0 : lens[i] - t, phaseMs: lens[i], done }
}

export function chime(times = 2) {
  try {
    const ctx = new AudioContext()
    for (let k = 0; k < times; k++) {
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.frequency.value = 880
      g.gain.setValueAtTime(0.0001, ctx.currentTime + k * 0.35)
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + k * 0.35 + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + k * 0.35 + 0.3)
      o.connect(g).connect(ctx.destination)
      o.start(ctx.currentTime + k * 0.35)
      o.stop(ctx.currentTime + k * 0.35 + 0.32)
    }
    setTimeout(() => ctx.close(), 1500)
  } catch {
    /* no audio */
  }
}

export function notify(title: string, body: string) {
  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    try {
      new Notification(title, { body, icon: '/favicon.svg' })
    } catch {
      /* some browsers only allow notifications from a service worker */
    }
  }
}

export function fmtClock(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = (s % 60).toString().padStart(2, '0')
  return h ? `${h}:${m.toString().padStart(2, '0')}:${sec}` : `${m}:${sec}`
}

export function TimerProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<TimerState | null>(load)
  const [now, setNow] = useState(() => Date.now())
  const lastPhase = useRef<string | null>(null)

  const set = useCallback((s: TimerState | null) => {
    save(s)
    setState(s)
    setNow(Date.now())
  }, [])

  useEffect(() => {
    if (!state || state.pausedAt) return
    const id = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(id)
  }, [state])

  // Another tab started/stopped the timer.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => e.key === KEY && setState(load())
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const view = state ? compute(state, now) : null
  const phaseKey = view ? `${view.state.startedAt}:${view.round}:${view.phaseIndex}:${view.done}` : null

  // Phase changes: chime, notify, and keep the tab title useful.
  useEffect(() => {
    if (!view || !phaseKey) {
      lastPhase.current = null
      return
    }
    if (lastPhase.current && lastPhase.current !== phaseKey && lastPhase.current.startsWith(`${view.state.startedAt}:`)) {
      if (view.done) {
        chime(3)
        notify(`${view.state.name}: done`, view.state.context ?? 'Timer finished')
      } else {
        chime(2)
        notify(`${view.phase.label} · ${view.phase.minutes} min`, `${view.state.name}${view.next ? ` — then ${view.next.label}` : ''}`)
      }
    }
    lastPhase.current = phaseKey
  }, [phaseKey, view])

  useEffect(() => {
    const base = 'Study Lab'
    document.title = view && !view.done ? `${fmtClock(view.remainingMs)} · ${view.phase.label} — ${base}` : base
  }, [view])

  const ctx: Ctx = {
    view,
    start: ({ name, phases, loop, context }) =>
      set({ name, phases, loop, context, startedAt: Date.now(), pausedAt: null, pausedMs: 0, skippedMs: 0 }),
    pause: () => state && !state.pausedAt && set({ ...state, pausedAt: Date.now() }),
    resume: () => state?.pausedAt && set({ ...state, pausedMs: state.pausedMs + Date.now() - state.pausedAt, pausedAt: null }),
    skip: () => view && !view.done && set({ ...view.state, skippedMs: view.state.skippedMs + view.remainingMs }),
    stop: () => set(null),
  }
  return <TimerCtx.Provider value={ctx}>{children}</TimerCtx.Provider>
}

export function useTimer() {
  const c = useContext(TimerCtx)
  if (!c) throw new Error('useTimer outside TimerProvider')
  return c
}

/** Floating widget, bottom-right on every page while a timer exists. */
export function FloatingTimer() {
  const { view, pause, resume, skip, stop } = useTimer()
  const [min, setMin] = useState(false)
  if (!view) return null
  const { state, phase, next, remainingMs, phaseMs, done, round, phaseIndex } = view
  const paused = !!state.pausedAt
  const pct = done ? 100 : 100 - (100 * remainingMs) / phaseMs

  if (min)
    return (
      <button className="card fixed right-4 bottom-4 z-50 flex items-center gap-2 px-3 py-2 text-sm shadow-lg" onClick={() => setMin(false)} title="Show timer">
        <span className={`h-2 w-2 rounded-full ${done ? 'bg-good' : paused ? 'bg-warn' : 'animate-pulse bg-accent'}`} />
        <span className="font-semibold tabular-nums">{done ? 'Done' : fmtClock(remainingMs)}</span>
        <span className="text-muted">{done ? state.name : phase.label}</span>
      </button>
    )

  return (
    <div className="card fixed right-4 bottom-4 z-50 w-[min(20rem,calc(100vw-2rem))] p-4 shadow-lg" role="timer" aria-live="polite">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-xs font-semibold tracking-wide text-muted uppercase">{state.name}</div>
          {state.context && <div className="truncate text-xs text-muted">{state.context}</div>}
        </div>
        <button className="text-xs text-muted hover:text-fg" onClick={() => setMin(true)} title="Minimize">
          ▁
        </button>
      </div>
      {done ? (
        <div className="py-3 text-center">
          <div className="text-2xl font-bold text-good">Done</div>
          <div className="text-xs text-muted">All phases finished</div>
        </div>
      ) : (
        <>
          <div className="mt-2 flex items-baseline justify-between gap-2">
            <span className="truncate font-semibold">{phase.label}</span>
            <span className={`text-3xl font-bold tabular-nums ${paused ? 'text-warn' : ''}`}>{fmtClock(remainingMs)}</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-panel-2">
            <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${pct}%` }} />
          </div>
          <div className="mt-2 flex gap-1">
            {state.phases.map((p, i) => (
              <div key={i} title={`${p.label} · ${p.minutes} min`} className={`h-1 flex-1 rounded-full ${i < phaseIndex ? 'bg-accent/60' : i === phaseIndex ? 'bg-accent' : 'bg-panel-2'}`} />
            ))}
          </div>
          <div className="mt-1.5 text-xs text-muted">
            {next ? <>Next: {next.label} · {next.minutes} min</> : 'Last phase'}
            {state.loop && <> · round {round + 1}</>}
          </div>
        </>
      )}
      <div className="mt-3 flex gap-2">
        {!done && (
          <button className="btn flex-1" onClick={paused ? resume : pause}>
            {paused ? '▶ Resume' : '❚❚ Pause'}
          </button>
        )}
        {!done && (
          <button className="btn" onClick={skip} title="Skip to the next phase">
            ⏭
          </button>
        )}
        <button className={`btn ${done ? 'btn-primary flex-1' : ''}`} onClick={stop}>
          {done ? 'Close' : 'Stop'}
        </button>
      </div>
    </div>
  )
}
