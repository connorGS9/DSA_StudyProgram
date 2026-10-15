import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api, OUTCOMES, type Attempt, type Outcome, type Problem, type Reveal, type Slot } from '../api'
import { CodeEditor, LANG_LABEL, langFromFilename, type Lang } from '../components/CodeEditor'
import VideoRecorder from '../components/VideoRecorder'
import { CategoryChips, ChallengeChip, ErrorBox, fmtDuration, Loading, relDays, SourceBadge, useCategories } from '../components/ui'

interface CodeDraft {
  language: Lang
  filename: string
  content: string
}

const DEFAULT_LANG_KEY = 'dsa.lang'

function draftKey(slotId: string) {
  return `dsa.draft.${slotId}`
}

function loadDraft(slotId: string) {
  try {
    return JSON.parse(localStorage.getItem(draftKey(slotId)) ?? 'null')
  } catch {
    return null
  }
}

export default function Solve() {
  const { slotId = '' } = useParams()
  const slot = useQuery({ queryKey: ['slot', slotId], queryFn: () => api.get<Slot & { day: string }>(`/api/today/slots/${slotId}`) })
  const [result, setResult] = useState<{ attempt: Attempt; reveal: Reveal; problem: Problem } | null>(null)

  if (slot.isLoading) return <Loading />
  if (slot.error) return <ErrorBox error={slot.error} />
  const s = slot.data!

  if (result) return <RevealView result={result} />
  if (s.status !== 'pending')
    return (
      <div className="card p-6 text-sm">
        This problem is already {s.status}.{' '}
        <Link className="text-accent underline" to={`/problems/${s.problem.id}`}>
          Open the problem page
        </Link>
      </div>
    )
  return <SolveForm slot={s} slotId={slotId} onDone={setResult} />
}

function Timer({ since }: { since: string | null }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])
  if (!since) return null
  const start = new Date(since.endsWith('Z') ? since : since + 'Z').getTime()
  return <span className="font-mono text-sm tabular-nums">{fmtDuration((now - start) / 1000)}</span>
}

function SolveForm({ slot, slotId, onDone }: { slot: Slot; slotId: string; onDone: (r: { attempt: Attempt; reveal: Reveal; problem: Problem }) => void }) {
  const qc = useQueryClient()
  const { list: categories } = useCategories()
  const p = slot.problem
  const saved = loadDraft(slotId)
  const defaultLang = (localStorage.getItem(DEFAULT_LANG_KEY) as Lang) || 'java'

  const [guess, setGuess] = useState<string>(saved?.guess ?? '')
  const [outcome, setOutcome] = useState<Outcome | ''>(saved?.outcome ?? '')
  const [confidence, setConfidence] = useState<number | null>(saved?.confidence ?? null)
  const [insight, setInsight] = useState<string>(saved?.insight ?? '')
  const [mistakes, setMistakes] = useState<string>(saved?.mistakes ?? '')
  const [notes, setNotes] = useState<string>(saved?.notes ?? '')
  const [code, setCode] = useState<CodeDraft[]>(saved?.code ?? [{ language: defaultLang, filename: '', content: '' }])
  const [files, setFiles] = useState<File[]>([])
  const [minutes, setMinutes] = useState<string>('')
  const [error, setError] = useState<unknown>(null)
  const [submitting, setSubmitting] = useState(false)

  // Keep a local draft so closing the tab never loses a half-written solution.
  useEffect(() => {
    try {
      localStorage.setItem(draftKey(slotId), JSON.stringify({ guess, outcome, confidence, insight, mistakes, notes, code }))
    } catch {
      /* storage unavailable */
    }
  }, [slotId, guess, outcome, confidence, insight, mistakes, notes, code])

  const hasCode = code.some((c) => c.content.trim()) || files.length > 0
  const canSubmit = outcome && insight.trim() && hasCode && !submitting

  async function submit() {
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    const started = slot.started_at ? new Date(slot.started_at + 'Z').getTime() : null
    const duration = minutes ? Math.round(parseFloat(minutes) * 60) : started ? Math.round((Date.now() - started) / 1000) : null
    const fd = new FormData()
    fd.append(
      'data',
      JSON.stringify({
        problem_id: p.id,
        slot_id: slot.id,
        outcome,
        key_insight: insight,
        confidence,
        guessed_category: guess || null,
        mistakes,
        notes,
        duration_sec: duration,
        code: code.filter((c) => c.content.trim()).map((c) => ({ language: c.language, filename: c.filename || null, content: c.content })),
      }),
    )
    files.forEach((f) => fd.append('files', f))
    try {
      const r = await api.post<{ attempt: Attempt; reveal: Reveal; problem: Problem }>('/api/attempts', fd)
      localStorage.removeItem(draftKey(slotId))
      qc.invalidateQueries({ queryKey: ['today'] })
      qc.invalidateQueries({ queryKey: ['stats'] })
      onDone(r)
    } catch (e) {
      setError(e)
    } finally {
      setSubmitting(false)
    }
  }

  const updateCode = (i: number, patch: Partial<CodeDraft>) => setCode(code.map((c, j) => (i === j ? { ...c, ...patch } : c)))

  return (
    <div className="space-y-5">
      <div className="card flex flex-wrap items-center gap-3 p-4">
        <div className="min-w-0 flex-1">
          <a href={p.url} target="_blank" rel="noreferrer" className="text-lg font-bold hover:text-accent">
            {p.title} ↗
          </a>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <SourceBadge source={p.source} />
            <span className="chip bg-panel-2 tabular-nums">≈{p.rating}</span>
            <ChallengeChip challenge={slot.challenge} />
            <span className="chip bg-panel-2">{slot.kind === 'review' ? 'Review' : 'New'}</span>
          </div>
        </div>
        <div className="text-right">
          <div className="label">Time</div>
          <Timer since={slot.started_at} />
        </div>
      </div>

      <Section n={1} title="What type of problem was it?" hint="Commit to a guess before the categories are revealed. It tracks how well you recognise patterns.">
        <select className="input max-w-md" value={guess} onChange={(e) => setGuess(e.target.value)}>
          <option value="">— no guess —</option>
          {categories.filter((c) => c.key !== 'mixed').map((c) => (
            <option key={c.key} value={c.key}>
              {c.name}
            </option>
          ))}
        </select>
      </Section>

      <Section n={2} title="How did it go?">
        <div className="grid gap-2 sm:grid-cols-5">
          {OUTCOMES.map((o) => (
            <button
              key={o.key}
              onClick={() => setOutcome(o.key)}
              className={`rounded-lg border px-3 py-2 text-left transition-colors ${outcome === o.key ? 'border-accent bg-accent-soft' : 'border-line hover:bg-panel-2'}`}
            >
              <div className="text-sm font-semibold">{o.label}</div>
              <div className="text-xs text-muted">{o.hint}</div>
            </button>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted">Confidence I could redo it:</span>
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} onClick={() => setConfidence(confidence === n ? null : n)} className={`h-7 w-7 rounded-md border text-sm font-medium ${confidence === n ? 'border-accent bg-accent text-white' : 'border-line hover:bg-panel-2'}`}>
                {n}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm text-muted">
            Minutes spent
            <input className="input w-20" inputMode="decimal" placeholder="auto" value={minutes} onChange={(e) => setMinutes(e.target.value)} />
          </label>
        </div>
      </Section>

      <Section n={3} title="Your solution" hint="Required. Paste your final code, or attach the file(s).">
        <div className="space-y-4">
          {code.map((c, i) => (
            <div key={i} className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex rounded-lg border border-line p-0.5">
                  {(Object.keys(LANG_LABEL) as Lang[]).map((l) => (
                    <button
                      key={l}
                      onClick={() => {
                        updateCode(i, { language: l })
                        localStorage.setItem(DEFAULT_LANG_KEY, l)
                      }}
                      className={`rounded-md px-2.5 py-1 text-xs font-semibold ${c.language === l ? 'bg-accent text-white' : 'text-muted hover:text-fg'}`}
                    >
                      {LANG_LABEL[l]}
                    </button>
                  ))}
                </div>
                <input className="input max-w-56" placeholder="filename (optional)" value={c.filename} onChange={(e) => updateCode(i, { filename: e.target.value })} />
                {code.length > 1 && (
                  <button className="btn btn-ghost btn-danger" onClick={() => setCode(code.filter((_, j) => j !== i))}>
                    Remove
                  </button>
                )}
              </div>
              <CodeEditor value={c.content} onChange={(v) => updateCode(i, { content: v })} language={c.language} />
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn" onClick={() => setCode([...code, { language: code[code.length - 1]?.language ?? 'java', filename: '', content: '' }])}>
              + Another file
            </button>
            <label className="btn cursor-pointer">
              Attach files…
              <input
                type="file"
                multiple
                className="hidden"
                accept=".java,.py,.cpp,.cc,.cxx,.h,.hpp,.txt"
                onChange={(e) => {
                  const picked = Array.from(e.target.files ?? [])
                  setFiles([...files, ...picked])
                  const l = picked.map((f) => langFromFilename(f.name)).find(Boolean)
                  if (l) localStorage.setItem(DEFAULT_LANG_KEY, l)
                }}
              />
            </label>
            {files.map((f, i) => (
              <span key={i} className="chip bg-panel-2">
                {f.name}
                <button className="text-muted hover:text-bad" onClick={() => setFiles(files.filter((_, j) => j !== i))}>
                  ✕
                </button>
              </span>
            ))}
          </div>
        </div>
      </Section>

      <Section n={4} title="Reflection">
        <div className="space-y-3">
          <div>
            <label className="label">Key insight (required)</label>
            <textarea className="input min-h-20" placeholder="The one idea that cracks it, e.g. 'sort by end time, then greedily take non-overlapping'" value={insight} onChange={(e) => setInsight(e.target.value)} />
          </div>
          <div>
            <label className="label">Mistakes / what slowed me down</label>
            <textarea className="input min-h-16" placeholder="Off-by-one on the window, forgot long overflow, tried DP before noticing the greedy…" value={mistakes} onChange={(e) => setMistakes(e.target.value)} />
          </div>
          <div>
            <label className="label">Other notes</label>
            <textarea className="input min-h-16" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
      </Section>

      <ErrorBox error={error} />
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn btn-primary px-5 py-2" disabled={!canSubmit} onClick={submit}>
          {submitting ? 'Saving…' : 'Finish & reveal'}
        </button>
        {!canSubmit && !submitting && (
          <span className="text-sm text-muted">
            Still needed: {[!outcome && 'how it went', !hasCode && 'solution code', !insight.trim() && 'key insight'].filter(Boolean).join(', ')}
          </span>
        )}
        <Link to="/dsa" className="btn btn-ghost ml-auto">
          Back to today
        </Link>
      </div>
    </div>
  )
}

function Section({ n, title, hint, children }: { n: number; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="card p-5">
      <div className="mb-3 flex items-baseline gap-2">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-bold text-accent">{n}</span>
        <div>
          <h2 className="font-semibold">{title}</h2>
          {hint && <p className="text-xs text-muted">{hint}</p>}
        </div>
      </div>
      {children}
    </section>
  )
}

function RevealView({ result }: { result: { attempt: Attempt; reveal: Reveal; problem: Problem } }) {
  const { name } = useCategories()
  const { reveal, problem, attempt } = result
  const [savedVideo, setSavedVideo] = useState(false)
  return (
    <div className="space-y-5">
      <div className="card p-6">
        <div className="text-sm font-semibold text-good">Logged ✓</div>
        <h1 className="mt-1 text-xl font-bold">{problem.title}</h1>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <div className="label">It was</div>
            <CategoryChips keys={reveal.categories} />
            {reveal.tags.length > 0 && <div className="mt-2 text-xs text-muted">Source tags: {reveal.tags.join(', ')}</div>}
          </div>
          <div>
            <div className="label">Your guess</div>
            {attempt.guessed_category ? (
              <div className={`text-sm font-medium ${reveal.guess_correct ? 'text-good' : 'text-bad'}`}>
                {name(attempt.guessed_category)} — {reveal.guess_correct ? 'correct' : 'not quite'}
              </div>
            ) : (
              <div className="text-sm text-muted">No guess</div>
            )}
          </div>
          <div>
            <div className="label">Next review</div>
            <div className="text-sm">{relDays(reveal.next_due)}</div>
          </div>
          <div>
            <div className="label">Skill change</div>
            <ul className="text-sm">
              {Object.entries(reveal.skill_changes).map(([k, v]) => (
                <li key={k}>
                  {name(k)}: {v.before} → <b className={v.after >= v.before ? 'text-good' : 'text-bad'}>{v.after}</b>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="card p-5">
        <h2 className="font-semibold">Explain it out loud</h2>
        <p className="mb-3 text-sm text-muted">Record yourself walking through the solution as if in an interview, so you can rewatch it later.</p>
        {savedVideo ? (
          <div className="text-sm text-good">Video saved. It's on the problem page and in Videos.</div>
        ) : (
          <VideoRecorder problemId={problem.id} attemptId={attempt.id} defaultTitle={problem.title} onSaved={() => setSavedVideo(true)} />
        )}
      </div>

      <div className="flex gap-2">
        <Link to="/dsa" className="btn btn-primary">
          Back to today
        </Link>
        <Link to={`/problems/${problem.id}`} className="btn">
          Problem page
        </Link>
      </div>
    </div>
  )
}
