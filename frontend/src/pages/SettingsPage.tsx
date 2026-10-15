import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { api, type ImportStatus, type Settings, type Source } from '../api'
import BackupCard from '../components/BackupCard'
import GoogleCalendarCard from '../components/GoogleCalendar'
import { ErrorBox, fmtDate, Loading, PageHeader, SourceBadge, useCategories } from '../components/ui'

export default function SettingsPage() {
  const qc = useQueryClient()
  const settings = useQuery({ queryKey: ['settings'], queryFn: () => api.get<Settings>('/api/settings') })
  const save = useMutation({
    mutationFn: (changes: Partial<Settings>) => api.put<Settings>('/api/settings', changes),
    onSuccess: (s) => {
      qc.setQueryData(['settings'], s)
      qc.invalidateQueries({ queryKey: ['stats'] })
    },
  })

  if (settings.isLoading) return <Loading />
  if (settings.error) return <ErrorBox error={settings.error} />
  const s = settings.data!

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" subtitle="Changes save automatically and apply to the next problems picked." />
      <ErrorBox error={save.error} />
      <GoogleCalendarCard />
      <BackupCard />
      <Imports />
      <History settings={s} onSave={(c) => save.mutate(c)} />
      <Scheduling settings={s} onSave={(c) => save.mutate(c)} />
      <CategoryWeights settings={s} onSave={(c) => save.mutate(c)} />
    </div>
  )
}

function Card({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="card p-5">
      <h2 className="font-semibold">{title}</h2>
      {hint && <p className="mb-4 text-sm text-muted">{hint}</p>}
      {!hint && <div className="mb-3" />}
      {children}
    </section>
  )
}

function Imports() {
  const qc = useQueryClient()
  const status = useQuery({
    queryKey: ['import-status'],
    queryFn: () => api.get<Record<Source, ImportStatus>>('/api/import/status'),
    refetchInterval: (q) => (Object.values(q.state.data ?? {}).some((x) => x.running) ? 2000 : false),
  })
  const run = useMutation({
    mutationFn: (source: Source) => api.post(`/api/import/${source}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['import-status'] }),
  })
  return (
    <Card title="Problem sources" hint="Problem metadata (title, link, tags, difficulty) is cached locally. Refresh occasionally to pick up new contests.">
      <ErrorBox error={run.error} />
      <div className="divide-y divide-line">
        {(['codeforces', 'cses', 'leetcode'] as Source[]).map((src) => {
          const st = status.data?.[src]
          return (
            <div key={src} className="flex flex-wrap items-center gap-3 py-3">
              <div className="w-28">
                <SourceBadge source={src} />
              </div>
              <div className="min-w-0 flex-1 text-sm">
                <span className="font-medium tabular-nums">{st?.problems.toLocaleString() ?? '…'}</span> problems
                {st?.last_run && (
                  <span className={`ml-2 ${st.last_run.status === 'error' ? 'text-bad' : 'text-muted'}`}>
                    · last refresh {fmtDate(st.last_run.started_at)} {st.last_run.status === 'error' ? `failed: ${st.last_run.message}` : ''}
                  </span>
                )}
              </div>
              <button className="btn" disabled={st?.running || run.isPending} onClick={() => run.mutate(src)}>
                {st?.running ? 'Importing…' : 'Refresh'}
              </button>
            </div>
          )
        })}
      </div>
    </Card>
  )
}

function useDraft<T>(value: T) {
  const [v, setV] = useState(value)
  useEffect(() => setV(value), [value])
  return [v, setV] as const
}

function History({ settings, onSave }: { settings: Settings; onSave: (c: Partial<Settings>) => void }) {
  const [cf, setCf] = useDraft(settings.codeforces_handle)
  const [lc, setLc] = useDraft(settings.leetcode_username)
  const [cookie, setCookie] = useState('')
  const [refs, setRefs] = useState('')
  const lcImport = useMutation({ mutationFn: (mode: 'recent' | 'full') => api.post<Record<string, number>>('/api/history/leetcode', { mode }) })
  const manual = useMutation({ mutationFn: () => api.post<Record<string, number>>('/api/history/manual', { refs }) })

  return (
    <Card
      title="Accounts & past solves"
      hint="Problems you solved before using this app are added as low-priority reviews (spread over the next few months) and give your skill estimate a head start."
    >
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="label">Codeforces handle</label>
          <input className="input" value={cf} onChange={(e) => setCf(e.target.value)} onBlur={() => cf !== settings.codeforces_handle && onSave({ codeforces_handle: cf.trim() })} placeholder="tourist" />
          <p className="mt-1 text-xs text-muted">Used to mark Codeforces attempts as "AC verified".</p>
        </div>
        <div>
          <label className="label">LeetCode username</label>
          <input className="input" value={lc} onChange={(e) => setLc(e.target.value)} onBlur={() => lc !== settings.leetcode_username && onSave({ leetcode_username: lc.trim() })} />
        </div>
      </div>

      <div className="mt-5 rounded-lg border border-line p-4">
        <div className="text-sm font-semibold">Import LeetCode history</div>
        <p className="mt-1 text-sm text-muted">
          LeetCode only shows your <b>last ~20</b> accepted problems publicly. To import everything, paste your own <code>LEETCODE_SESSION</code> cookie (browser dev tools →
          Application → Cookies → leetcode.com). It is stored only in your local database and only ever sent to leetcode.com.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            className="input max-w-sm"
            type="password"
            autoComplete="off"
            placeholder={settings.leetcode_session ? 'Session cookie saved ✓ (paste to replace)' : 'LEETCODE_SESSION value'}
            value={cookie}
            onChange={(e) => setCookie(e.target.value)}
          />
          <button
            className="btn"
            disabled={!cookie.trim()}
            onClick={() => {
              onSave({ leetcode_session: cookie.trim() })
              setCookie('')
            }}
          >
            Save cookie
          </button>
          {settings.leetcode_session && (
            <button className="btn btn-ghost btn-danger" onClick={() => onSave({ leetcode_session: '' })}>
              Forget cookie
            </button>
          )}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button className="btn" disabled={!settings.leetcode_username || lcImport.isPending} onClick={() => lcImport.mutate('recent')}>
            Import recent (public)
          </button>
          <button className="btn btn-primary" disabled={!settings.leetcode_session || lcImport.isPending} onClick={() => lcImport.mutate('full')}>
            {lcImport.isPending ? 'Importing…' : 'Import full history'}
          </button>
        </div>
        <ErrorBox error={lcImport.error} />
        {lcImport.data && <Result r={lcImport.data} />}
      </div>

      <div className="mt-4 rounded-lg border border-line p-4">
        <div className="text-sm font-semibold">Add solved problems by link</div>
        <p className="mt-1 text-sm text-muted">Paste links or ids from any judge (LeetCode slugs, Codeforces ids like 1520F, CSES task links), separated by spaces or new lines.</p>
        <textarea className="input mt-2 min-h-20 font-mono text-xs" value={refs} onChange={(e) => setRefs(e.target.value)} placeholder={'https://leetcode.com/problems/two-sum/\n1520F\nhttps://cses.fi/problemset/task/1068'} />
        <button className="btn mt-2" disabled={!refs.trim() || manual.isPending} onClick={() => manual.mutate()}>
          Mark as solved before
        </button>
        <ErrorBox error={manual.error} />
        {manual.data && <Result r={manual.data} />}
      </div>
    </Card>
  )
}

function Result({ r }: { r: Record<string, number> }) {
  return (
    <div className="mt-2 rounded-lg bg-good-soft px-3 py-2 text-sm text-good">
      Added {r.seeded} · already known {r.already_known} · not found {r.not_found}
    </div>
  )
}

function Slider({ label, value, min, max, step, fmt, onCommit, hint }: { label: string; value: number; min: number; max: number; step: number; fmt: (v: number) => string; onCommit: (v: number) => void; hint?: string }) {
  const [v, setV] = useDraft(value)
  return (
    <div>
      <div className="flex justify-between">
        <label className="label">{label}</label>
        <span className="text-sm font-medium tabular-nums">{fmt(v)}</span>
      </div>
      <input type="range" className="w-full accent-[var(--accent)]" min={min} max={max} step={step} value={v} onChange={(e) => setV(Number(e.target.value))} onPointerUp={() => v !== value && onCommit(v)} onKeyUp={() => v !== value && onCommit(v)} />
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  )
}

function Scheduling({ settings: s, onSave }: { settings: Settings; onSave: (c: Partial<Settings>) => void }) {
  const pct = (v: number) => `${Math.round(v * 100)}%`
  return (
    <Card title="Scheduling">
      <div className="grid gap-5 md:grid-cols-2">
        <Slider label="Default problems per day" value={s.daily_count} min={1} max={10} step={1} fmt={String} onCommit={(v) => onSave({ daily_count: v })} hint="You can still change the count on any given day." />
        <Slider label="Max share of reviews" value={s.review_share} min={0} max={1} step={0.05} fmt={pct} onCommit={(v) => onSave({ review_share: v })} hint="The rest of the day is new problems." />
        <Slider label="Difficulty stretch" value={s.stretch} min={-200} max={400} step={25} fmt={(v) => (v > 0 ? `+${v}` : String(v))} onCommit={(v) => onSave({ stretch: v })} hint="How far above your category skill new problems are aimed." />
        <Slider label="Difficulty spread" value={s.difficulty_spread} min={50} max={400} step={25} fmt={(v) => `±${v}`} onCommit={(v) => onSave({ difficulty_spread: v })} hint="Wider means more variety, narrower means more predictable." />
        <Slider label="Imported-history share of reviews" value={s.history_review_share} min={0} max={1} step={0.05} fmt={pct} onCommit={(v) => onSave({ history_review_share: v })} />
        <Slider label="Target recall" value={s.desired_retention} min={0.7} max={0.95} step={0.01} fmt={pct} onCommit={(v) => onSave({ desired_retention: v })} hint="Higher means reviews come back sooner." />
      </div>

      <div className="mt-6">
        <div className="label">New problems by source</div>
        <div className="grid gap-5 md:grid-cols-3">
          {(['codeforces', 'cses', 'leetcode'] as Source[]).map((src) => (
            <Slider key={src} label={src} value={s.source_weights[src] ?? 0} min={0} max={1} step={0.05} fmt={pct} onCommit={(v) => onSave({ source_weights: { ...s.source_weights, [src]: v } })} />
          ))}
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={s.leetcode_premium} onChange={(e) => onSave({ leetcode_premium: e.target.checked })} />
          I have LeetCode Premium (allow premium-only problems)
        </label>
      </div>
    </Card>
  )
}

function CategoryWeights({ settings: s, onSave }: { settings: Settings; onSave: (c: Partial<Settings>) => void }) {
  const { list } = useCategories()
  const set = (key: string, v: number) => {
    const next = { ...s.category_weights, [key]: v }
    if (v === 1) delete next[key]
    onSave({ category_weights: next })
  }
  return (
    <Card title="Category emphasis" hint="Multiplies how often each category is picked for new problems. 0 turns a category off, 2 doubles it.">
      <div className="grid gap-x-6 gap-y-2 md:grid-cols-2">
        {list.map((c) => {
          const v = s.category_weights[c.key] ?? 1
          return (
            <div key={c.key} className="flex items-center gap-3 text-sm">
              <span className="w-56 shrink-0 truncate" title={c.name}>
                {c.name}
              </span>
              <select className="input w-24" value={v} onChange={(e) => set(c.key, Number(e.target.value))}>
                {[0, 0.5, 1, 1.5, 2, 3].map((x) => (
                  <option key={x} value={x}>
                    ×{x}
                  </option>
                ))}
              </select>
              {c.unlock_at > 0 && <span className="text-xs text-muted">unlocks at {c.unlock_at}</span>}
            </div>
          )
        })}
      </div>
    </Card>
  )
}
