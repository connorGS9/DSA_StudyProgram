import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api, type ProblemDetail, type SolutionFile, type Today } from '../api'
import { CodeEditor, LANG_LABEL, type Lang } from '../components/CodeEditor'
import VideoRecorder from '../components/VideoRecorder'
import { CategoryChips, ErrorBox, fmtDate, fmtDuration, Loading, OutcomeChip, relDays, SourceBadge, useCategories } from '../components/ui'

export default function ProblemPage() {
  const { id = '' } = useParams()
  const qc = useQueryClient()
  const [reveal, setReveal] = useState(false)
  const detail = useQuery({
    queryKey: ['problem', id, reveal],
    queryFn: () => api.get<ProblemDetail>(`/api/problems/${id}?reveal=${reveal}`),
  })
  const refresh = () => qc.invalidateQueries({ queryKey: ['problem', id] })
  const flags = useMutation({
    mutationFn: (body: { excluded?: boolean; retired?: boolean }) => api.patch(`/api/problems/${id}`, body),
    onSuccess: refresh,
  })
  const addToday = useMutation({
    mutationFn: () => api.post<Today>('/api/today/add', { problem_id: Number(id) }),
    onSuccess: (d) => qc.setQueryData(['today'], d),
  })
  const [recording, setRecording] = useState(false)

  if (detail.isLoading) return <Loading />
  if (detail.error) return <ErrorBox error={detail.error} />
  const { problem: p, attempts, solutions, videos } = detail.data!

  return (
    <div className="space-y-5">
      <div className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <a href={p.url} target="_blank" rel="noreferrer" className="text-xl font-bold hover:text-accent">
              {p.title} ↗
            </a>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <SourceBadge source={p.source} />
              <span className="chip bg-panel-2 tabular-nums">≈{p.rating}</span>
              {p.raw_difficulty && <span className="chip bg-panel-2">{p.raw_difficulty}</span>}
              {p.paid_only && <span className="chip bg-warn-soft text-warn">Premium</span>}
              {p.excluded && <span className="chip bg-bad-soft text-bad">Excluded</span>}
              {p.srs?.retired && <span className="chip bg-good-soft text-good">Retired</span>}
            </div>
            <div className="mt-3">
              {p.categories ? (
                <CategoryChips keys={p.categories} />
              ) : (
                <button className="text-xs text-muted underline" onClick={() => setReveal(true)}>
                  Reveal categories (spoiler)
                </button>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn" disabled={addToday.isPending || addToday.isSuccess} onClick={() => addToday.mutate()}>
              {addToday.isSuccess ? 'Added ✓' : '+ Add to today'}
            </button>
            {p.srs && (
              <button className="btn" onClick={() => flags.mutate({ retired: !p.srs!.retired })} title="Retired problems never come back as reviews">
                {p.srs.retired ? 'Un-retire' : 'Retire (mastered)'}
              </button>
            )}
            <button className="btn" onClick={() => flags.mutate({ excluded: !p.excluded })} title="Excluded problems are never scheduled">
              {p.excluded ? 'Include again' : 'Exclude'}
            </button>
          </div>
        </div>
        <ErrorBox error={addToday.error || flags.error} />
        {p.srs && (
          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-4 text-sm sm:grid-cols-4">
            <Info label="Next review" value={p.srs.retired ? '—' : relDays(p.srs.due)} />
            <Info label="Reviews" value={p.srs.reps} />
            <Info label="Lapses" value={p.srs.lapses} />
            <Info label="Memory stability" value={`${p.srs.stability_days} days`} />
          </div>
        )}
      </div>

      <section className="card p-5">
        <h2 className="mb-3 font-semibold">Attempts</h2>
        {attempts.length === 0 ? (
          <p className="text-sm text-muted">No attempts yet.</p>
        ) : (
          <div className="space-y-3">
            {attempts.map((a) => (
              <AttemptRow key={a.id} a={a} />
            ))}
          </div>
        )}
      </section>

      <section className="card p-5">
        <h2 className="mb-3 font-semibold">Solutions</h2>
        <Solutions problemId={p.id} solutions={solutions} onChange={refresh} />
      </section>

      <section className="card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">Videos</h2>
          {!recording && (
            <button className="btn" onClick={() => setRecording(true)}>
              + Record / upload
            </button>
          )}
        </div>
        {recording && (
          <div className="mb-4">
            <VideoRecorder
              problemId={p.id}
              defaultTitle={p.title}
              onSaved={() => {
                setRecording(false)
                refresh()
              }}
            />
          </div>
        )}
        {videos.length === 0 && !recording && <p className="text-sm text-muted">No videos yet.</p>}
        <div className="grid gap-4 md:grid-cols-2">
          {videos.map((v) => (
            <div key={v.id}>
              <video src={v.url} controls preload="metadata" className="aspect-video w-full rounded-lg bg-black" />
              <div className="mt-1 flex items-center justify-between text-sm">
                <span className="truncate font-medium">{v.title || 'Untitled'}</span>
                <span className="text-muted">
                  {fmtDate(v.created_at)} · {fmtDuration(v.duration_sec)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>
      <Link to="/library" className="btn btn-ghost">
        ← Library
      </Link>
    </div>
  )
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="label">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  )
}

function AttemptRow({ a }: { a: ProblemDetail['attempts'][number] }) {
  const { name } = useCategories()
  return (
    <div className="rounded-lg border border-line p-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium">{fmtDate(a.finished_at)}</span>
        <OutcomeChip outcome={a.outcome} />
        {a.verified && <span className="chip bg-good-soft text-good">AC verified</span>}
        <span className="text-muted">{fmtDuration(a.duration_sec)}</span>
        {a.confidence && <span className="text-muted">confidence {a.confidence}/5</span>}
        {a.guessed_category && <span className="text-muted">guessed: {name(a.guessed_category)}</span>}
      </div>
      {a.key_insight && (
        <p className="mt-2 text-sm">
          <b>Insight:</b> {a.key_insight}
        </p>
      )}
      {a.mistakes && (
        <p className="mt-1 text-sm">
          <b>Mistakes:</b> {a.mistakes}
        </p>
      )}
      {a.notes && <p className="mt-1 text-sm text-muted">{a.notes}</p>}
    </div>
  )
}

function Solutions({ problemId, solutions, onChange }: { problemId: number; solutions: SolutionFile[]; onChange: () => void }) {
  const [open, setOpen] = useState<number | null>(solutions[0]?.id ?? null)
  const [adding, setAdding] = useState(false)
  const [lang, setLang] = useState<Lang>('java')
  const [content, setContent] = useState('')
  const code = useQuery({
    queryKey: ['solution', open],
    queryFn: () => api.get<string>(`/api/solutions/${open}`),
    enabled: open !== null,
  })
  const add = useMutation({
    mutationFn: () => {
      const fd = new FormData()
      fd.append('language', lang)
      fd.append('content', content)
      return api.post(`/api/problems/${problemId}/solutions`, fd)
    },
    onSuccess: () => {
      setAdding(false)
      setContent('')
      onChange()
    },
  })
  const current = solutions.find((s) => s.id === open)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {solutions.map((s) => (
          <button key={s.id} onClick={() => setOpen(s.id)} className={`chip border px-2.5 py-1 ${open === s.id ? 'border-accent bg-accent-soft text-accent' : 'border-line'}`}>
            {s.filename} · {fmtDate(s.created_at)}
          </button>
        ))}
        <button className="btn" onClick={() => setAdding(!adding)}>
          {adding ? 'Cancel' : '+ Add solution'}
        </button>
      </div>
      {adding && (
        <div className="space-y-2">
          <select className="input w-40" value={lang} onChange={(e) => setLang(e.target.value as Lang)}>
            {(Object.keys(LANG_LABEL) as Lang[]).map((l) => (
              <option key={l} value={l}>
                {LANG_LABEL[l]}
              </option>
            ))}
          </select>
          <CodeEditor value={content} onChange={setContent} language={lang} />
          <ErrorBox error={add.error} />
          <button className="btn btn-primary" disabled={!content.trim() || add.isPending} onClick={() => add.mutate()}>
            Save solution
          </button>
        </div>
      )}
      {current && !adding && code.data !== undefined && (
        <CodeEditor value={code.data} language={current.language === 'other' ? 'other' : current.language} readOnly minHeight="80px" maxHeight="600px" />
      )}
      {solutions.length === 0 && !adding && <p className="text-sm text-muted">No solutions saved yet.</p>}
    </div>
  )
}
