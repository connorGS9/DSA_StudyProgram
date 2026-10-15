import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type DragEvent, type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { api, type Book, type BookStatus, type LabNote, type Project, type ProjectStatus } from '../api'
import { fmtDate } from './ui'

export const BOOK_STATUS: Record<BookStatus, { label: string; cls: string }> = {
  reading: { label: 'Reading', cls: 'bg-accent-soft text-accent' },
  queued: { label: 'Up next', cls: 'bg-panel-2 text-muted' },
  finished: { label: 'Finished', cls: 'bg-good-soft text-good' },
  dropped: { label: 'Dropped', cls: 'bg-bad-soft text-bad' },
}

export const PROJECT_STATUS: Record<ProjectStatus, { label: string; cls: string }> = {
  active: { label: 'Active', cls: 'bg-accent-soft text-accent' },
  paused: { label: 'Paused', cls: 'bg-warn-soft text-warn' },
  idea: { label: 'Idea', cls: 'bg-panel-2 text-muted' },
  done: { label: 'Done', cls: 'bg-good-soft text-good' },
}

export function useBooks() {
  return useQuery({ queryKey: ['books'], queryFn: () => api.get<Book[]>('/api/books') })
}

export function useProjects() {
  return useQuery({ queryKey: ['projects'], queryFn: () => api.get<Project[]>('/api/projects') })
}

type Req = { method: 'post' | 'patch' | 'del'; url: string; body?: unknown }

/** One mutation per list: fire any request, then refetch that list. */
export function useLabMutation(key: 'books' | 'projects') {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ method, url, body }: Req) => (method === 'del' ? api.del(url) : api[method](url, body)),
    onSettled: () => qc.invalidateQueries({ queryKey: [key] }),
  })
}

/** Date-only ISO strings ("2026-10-14") are local dates; don't shift them through UTC. */
export function fmtDay(day: string | null | undefined) {
  if (!day) return '—'
  return new Date(day + 'T00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

/** "today at 9:40 PM", "yesterday at 8:05 AM", "Mon at …", or a date, by local calendar day. */
export function fmtWhen(iso: string) {
  // Naive timestamps from the API are UTC; ones with an offset are used as-is.
  const d = new Date(/([zZ]|[+-]\d\d:?\d\d)$/.test(iso) ? iso : iso + 'Z')
  const days = Math.round((new Date().setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / 86400000)
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  if (days === 0) return `today at ${time}`
  if (days === 1) return `yesterday at ${time}`
  if (days < 7) return `${d.toLocaleDateString(undefined, { weekday: 'long' })} at ${time}`
  return fmtDate(iso)
}

export function Bar({ percent, tone = 'accent' }: { percent: number | null; tone?: 'accent' | 'good' }) {
  return (
    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-panel-2">
      <div className={`h-full rounded-full transition-all ${tone === 'good' ? 'bg-good' : 'bg-accent'}`} style={{ width: `${percent ?? 0}%` }} />
    </div>
  )
}

export function Chip({ label, cls }: { label: string; cls: string }) {
  return <span className={`chip ${cls}`}>{label}</span>
}

export function ExtLink({ href, children }: { href: string; children?: ReactNode }) {
  if (!/^https?:\/\//i.test(href)) return null
  return (
    <a href={href} target="_blank" rel="noreferrer" className="truncate text-xs text-muted hover:text-accent">
      {children ?? href.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '')} ↗
    </a>
  )
}

/** Dated, newest-first notes with an add box. `withPage` adds an optional page field (books). */
export function NoteLog({
  notes,
  onAdd,
  onDelete,
  withPage,
  defaultPage,
}: {
  notes: LabNote[]
  onAdd: (body: string, page: number | null) => void
  onDelete: (id: number) => void
  withPage?: boolean
  defaultPage?: number
}) {
  const [body, setBody] = useState('')
  const [page, setPage] = useState('')
  const submit = () => {
    if (!body.trim()) return
    onAdd(body, page ? Number(page) : null)
    setBody('')
    setPage('')
  }
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <textarea
          className="input min-h-16 flex-1 resize-y"
          placeholder="Add a note… (Ctrl+Enter to save)"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.ctrlKey || e.metaKey) && submit()}
        />
        <div className="flex w-24 shrink-0 flex-col gap-2">
          {withPage && (
            <input className="input" type="number" min={0} placeholder={defaultPage ? `p. ${defaultPage}` : 'page'} value={page} onChange={(e) => setPage(e.target.value)} />
          )}
          <button className="btn btn-primary" disabled={!body.trim()} onClick={submit}>
            Add
          </button>
        </div>
      </div>
      {notes.length > 0 && (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {notes.map((n) => (
            <li key={n.id} className="group flex gap-3 px-3 py-2 text-sm">
              <div className="w-24 shrink-0 text-xs text-muted">
                {fmtDate(n.created_at)}
                {n.page != null && <div>p. {n.page}</div>}
              </div>
              <p className="min-w-0 flex-1 whitespace-pre-wrap">{n.body}</p>
              <button className="text-xs text-muted opacity-0 group-hover:opacity-100 hover:text-bad" title="Delete note" onClick={() => confirm('Delete this note?') && onDelete(n.id)}>
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * Native drag-to-reorder. Items reorder live while dragging; `commit` gets the final id order
 * on drop. Spread `rowProps(id)` onto each row.
 */
export function useDragOrder<T extends { id: number }>(items: T[], commit: (ids: number[]) => void) {
  const [dragId, setDragId] = useState<number | null>(null)
  const [order, setOrder] = useState<number[] | null>(null)
  const byId = new Map(items.map((i) => [i.id, i]))
  const list = order ? order.map((id) => byId.get(id)).filter((x): x is T => !!x) : items

  const rowProps = (id: number) => ({
    draggable: true,
    onDragStart: (e: DragEvent) => {
      e.dataTransfer.effectAllowed = 'move'
      setDragId(id)
      setOrder(items.map((i) => i.id))
    },
    onDragOver: (e: DragEvent) => {
      e.preventDefault()
      if (dragId === null || dragId === id) return
      setOrder((cur) => {
        if (!cur) return cur
        const next = cur.filter((x) => x !== dragId)
        next.splice(cur.indexOf(id), 0, dragId)
        return next
      })
    },
    onDragEnd: () => {
      if (order && order.some((id, i) => id !== items[i]?.id)) commit(order)
      setDragId(null)
      setOrder(null)
    },
    className: dragId === id ? 'opacity-40' : '',
  })
  return { list, rowProps }
}

/**
 * Current-page box. Saves shortly after typing stops, on blur/Enter, and when the tab is hidden,
 * closed or the component unmounts, so a typed page is never lost.
 */
export function PageInput({ book }: { book: Book }) {
  const qc = useQueryClient()
  const [val, setVal] = useState<string | null>(null)
  const pending = useRef<number | null>(null)
  const saved = useRef(book.current_page)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => {
    saved.current = book.current_page
  }, [book.current_page])

  const flush = useCallback(() => {
    clearTimeout(timer.current)
    const n = pending.current
    pending.current = null
    if (n === null || n === saved.current) return
    saved.current = n
    qc.setQueryData<Book[]>(['books'], (cur) =>
      cur?.map((b) => (b.id === book.id ? { ...b, current_page: n, percent: b.total_pages ? Math.round((100 * Math.min(n, b.total_pages)) / b.total_pages) : null } : b)),
    )
    // keepalive lets the request finish even if the tab is closing.
    fetch(`/api/books/${book.id}`, {
      method: 'PATCH',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ current_page: n }),
    }).finally(() => qc.invalidateQueries({ queryKey: ['books'] }))
  }, [book.id, qc])

  useEffect(() => {
    const onHide = () => document.visibilityState === 'hidden' && flush()
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', onHide)
    return () => {
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', onHide)
      flush()
    }
  }, [flush])

  const onChange = (raw: string) => {
    setVal(raw)
    clearTimeout(timer.current)
    if (raw.trim() === '') return // mid-edit; don't save 0
    const n = Math.max(0, Math.floor(Number(raw)) || 0)
    pending.current = book.total_pages ? Math.min(n, book.total_pages) : n
    timer.current = setTimeout(flush, 600)
  }

  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted">
      p.
      <input
        className="input w-16 px-1.5 py-0.5 text-center tabular-nums"
        type="number"
        min={0}
        max={book.total_pages ?? undefined}
        aria-label={`Current page of ${book.title}`}
        value={val ?? book.current_page}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => {
          flush()
          setVal(null)
        }}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
      {book.total_pages ? <>/ {book.total_pages}</> : null}
    </span>
  )
}

/** Text input that saves on blur / Enter. Remounts when the saved value changes. */
export function Field({ label, value, onSave, type = 'text' }: { label: string; value: string; onSave: (v: string) => void; type?: string }) {
  return (
    <div>
      <label className="label">{label}</label>
      <input
        key={value}
        className="input"
        type={type}
        defaultValue={value}
        onBlur={(e) => e.target.value.trim() !== value && onSave(e.target.value.trim())}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
    </div>
  )
}
