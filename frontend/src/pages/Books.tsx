import { useQueryClient } from '@tanstack/react-query'
import { type ChangeEvent, type FormEvent, type ReactNode, useState } from 'react'
import type { Book, BookStatus } from '../api'
import { Bar, BOOK_STATUS, Chip, ExtLink, Field, fmtDay, fmtWhen, NoteLog, PageInput, useBooks, useDragOrder, useLabMutation } from '../components/lab'
import { ErrorBox, Loading, PageHeader } from '../components/ui'

export default function Books() {
  const books = useBooks()
  const m = useLabMutation('books')
  const [adding, setAdding] = useState(false)
  const [showDropped, setShowDropped] = useState(false)

  if (books.isLoading) return <Loading />
  const all = books.data ?? []
  const by = (s: BookStatus) => all.filter((b) => b.status === s)
  const reading = by('reading')
  const finishedThisYear = by('finished').filter((b) => b.finished_on?.startsWith(String(new Date().getFullYear()))).length

  return (
    <div>
      <PageHeader
        title="Books"
        subtitle={`${reading.length} reading · ${by('queued').length} up next · ${finishedThisYear} finished this year`}
        actions={
          <button className="btn btn-primary" onClick={() => setAdding((a) => !a)}>
            {adding ? 'Cancel' : '+ Add book'}
          </button>
        }
      />
      <ErrorBox error={books.error || m.error} />
      {adding && <AddBook onDone={() => setAdding(false)} />}

      <div className="space-y-8">
        <Section title="Currently reading" empty="Nothing in progress. Start something from your queue below.">
          {reading.map((b) => (
            <BookCard key={b.id} book={b} />
          ))}
        </Section>

        <QueueSection books={by('queued')} />

        <Section title="Finished" empty="No finished books yet.">
          {by('finished').map((b) => (
            <BookCard key={b.id} book={b} compact />
          ))}
        </Section>

        {by('dropped').length > 0 && (
          <div>
            <button className="label hover:text-fg" onClick={() => setShowDropped((s) => !s)}>
              {showDropped ? '▾' : '▸'} Dropped ({by('dropped').length})
            </button>
            {showDropped && (
              <div className="mt-2 space-y-2">
                {by('dropped').map((b) => (
                  <BookCard key={b.id} book={b} compact />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function Section({ title, empty, children }: { title: string; empty: string; children: ReactNode[] }) {
  return (
    <section>
      <h2 className="label">{title}</h2>
      {children.length === 0 ? <div className="card p-5 text-center text-sm text-muted">{empty}</div> : <div className="space-y-2">{children}</div>}
    </section>
  )
}

function QueueSection({ books }: { books: Book[] }) {
  const qc = useQueryClient()
  const m = useLabMutation('books')
  const { list, rowProps } = useDragOrder(books, (ids) => {
    // Optimistic: keep the dropped order on screen until the refetch lands.
    qc.setQueryData<Book[]>(['books'], (cur) => cur?.map((b) => (ids.includes(b.id) ? { ...b, position: ids.indexOf(b.id) + 1 } : b)).sort(queueSort))
    m.mutate({ method: 'post', url: '/api/books/reorder', body: { ids } })
  })
  return (
    <section>
      <h2 className="label">Up next {books.length > 1 && <span className="font-normal normal-case tracking-normal">· drag to reorder</span>}</h2>
      {list.length === 0 ? (
        <div className="card p-5 text-center text-sm text-muted">Your queue is empty. Add a book to read next.</div>
      ) : (
        <ol className="card divide-y divide-line">
          {list.map((b, i) => {
            const { className, ...drag } = rowProps(b.id)
            return (
              <li key={b.id} {...drag} className={`group flex cursor-grab items-center gap-3 px-4 py-2.5 active:cursor-grabbing ${className}`}>
                <span className="w-5 text-center text-sm font-semibold text-muted tabular-nums">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{b.title}</div>
                  <div className="flex items-center gap-2 text-xs text-muted">
                    {b.author && <span className="truncate">{b.author}</span>}
                    {b.total_pages && <span>{b.total_pages} pages</span>}
                    {b.url && <ExtLink href={b.url} />}
                  </div>
                </div>
                <button className="btn" onClick={() => m.mutate({ method: 'patch', url: `/api/books/${b.id}`, body: { status: 'reading' } })}>
                  Start reading
                </button>
                <button className="btn btn-ghost px-2 text-muted hover:text-bad" title="Remove from list" onClick={() => confirm(`Delete "${b.title}"?`) && m.mutate({ method: 'del', url: `/api/books/${b.id}` })}>
                  ✕
                </button>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}

const ORDER: Record<BookStatus, number> = { reading: 0, queued: 1, finished: 2, dropped: 3 }
function queueSort(a: Book, b: Book) {
  return ORDER[a.status] - ORDER[b.status] || (a.status === 'queued' ? a.position - b.position : 0)
}

function AddBook({ onDone }: { onDone: () => void }) {
  const m = useLabMutation('books')
  const [f, setF] = useState({ title: '', author: '', total_pages: '', status: 'queued' as BookStatus, url: '' })
  const set = (k: keyof typeof f) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value })
  const submit = (e: FormEvent) => {
    e.preventDefault()
    m.mutate(
      { method: 'post', url: '/api/books', body: { ...f, total_pages: f.total_pages ? Number(f.total_pages) : null } },
      { onSuccess: onDone },
    )
  }
  return (
    <form onSubmit={submit} className="card mb-6 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-[2fr_1.5fr_0.7fr_1fr]">
      <ErrorBox error={m.error} />
      <div>
        <label className="label">Title</label>
        <input className="input" autoFocus required value={f.title} onChange={set('title')} />
      </div>
      <div>
        <label className="label">Author</label>
        <input className="input" value={f.author} onChange={set('author')} />
      </div>
      <div>
        <label className="label">Pages</label>
        <input className="input" type="number" min={1} value={f.total_pages} onChange={set('total_pages')} />
      </div>
      <div>
        <label className="label">Status</label>
        <select className="input" value={f.status} onChange={set('status')}>
          <option value="queued">Up next</option>
          <option value="reading">Reading now</option>
          <option value="finished">Finished</option>
        </select>
      </div>
      <div className="sm:col-span-2 lg:col-span-3">
        <label className="label">Link (optional)</label>
        <input className="input" placeholder="publisher page, PDF, Goodreads…" value={f.url} onChange={set('url')} />
      </div>
      <div className="flex items-end">
        <button className="btn btn-primary w-full" disabled={m.isPending || !f.title.trim()}>
          Add book
        </button>
      </div>
    </form>
  )
}

function Stars({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  return (
    <span className="inline-flex" title="Your rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} className={`px-0.5 text-base leading-none ${value && n <= value ? 'text-warn' : 'text-line hover:text-warn'}`} onClick={() => onChange(value === n ? null : n)}>
          ★
        </button>
      ))}
    </span>
  )
}

function BookCard({ book: b, compact }: { book: Book; compact?: boolean }) {
  const m = useLabMutation('books')
  const [open, setOpen] = useState(false)
  const patch = (body: object) => m.mutate({ method: 'patch', url: `/api/books/${b.id}`, body })
  const st = BOOK_STATUS[b.status]

  return (
    <div className="card">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4">
        <button className="min-w-0 flex-1 text-left" onClick={() => setOpen((o) => !o)}>
          <div className="flex items-center gap-2">
            <span className="truncate font-semibold">{b.title}</span>
            {compact && <Chip {...st} />}
          </div>
          <div className="mt-0.5 truncate text-xs text-muted">
            {b.author || 'Unknown author'}
            {b.notes.length > 0 && <> · {b.notes.length} note{b.notes.length === 1 ? '' : 's'}</>}
            {b.status === 'reading' && b.page_updated_at && <> · p. {b.current_page} saved {fmtWhen(b.page_updated_at)}</>}
            {b.status === 'reading' && !b.page_updated_at && b.started_on && <> · started {fmtDay(b.started_on)}</>}
            {b.status === 'finished' && <> · finished {fmtDay(b.finished_on)}</>}
          </div>
        </button>

        {b.status === 'reading' && (
          <div className="flex w-full shrink-0 items-center justify-end gap-3 sm:w-auto">
            {b.total_pages ? (
              <>
                <div className="flex flex-1 sm:w-32 sm:flex-none">
                  <Bar percent={b.percent} />
                </div>
                <span className="w-9 text-right text-xs font-medium text-muted tabular-nums">{b.percent}%</span>
              </>
            ) : (
              <button className="text-xs text-muted hover:text-accent" onClick={() => setOpen(true)} title="Add the page count to track %">
                + page count
              </button>
            )}
            {!open && <PageInput book={b} />}
            <button className="btn" onClick={() => patch({ status: 'finished' })}>
              ✓ Finish
            </button>
          </div>
        )}
        {b.status === 'finished' && <Stars value={b.rating} onChange={(rating) => patch({ rating })} />}
        {(b.status === 'finished' || b.status === 'dropped') && (
          <button className="btn" disabled={m.isPending} title="Add to the end of Up next (drag to reorder)" onClick={() => patch({ status: 'queued' })}>
            ↺ Back to queue
          </button>
        )}
        <button className="btn btn-ghost px-2 text-muted" title={open ? 'Collapse' : 'Details & notes'} onClick={() => setOpen((o) => !o)}>
          {open ? '▾' : '▸'}
        </button>
      </div>

      {open && (
        <div className="space-y-4 border-t border-line p-4">
          <ErrorBox error={m.error} />
          {(b.status === 'reading' || b.status === 'dropped') && <WhereIWas book={b} />}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Field label="Title" value={b.title} onSave={(title) => title && patch({ title })} />
            <Field label="Author" value={b.author} onSave={(author) => patch({ author })} />
            <Field label="Pages" value={b.total_pages?.toString() ?? ''} type="number" onSave={(v) => v && patch({ total_pages: Number(v) })} />
            <div>
              <label className="label">Status</label>
              <select className="input" value={b.status} onChange={(e) => patch({ status: e.target.value })}>
                {Object.entries(BOOK_STATUS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                  </option>
                ))}
              </select>
            </div>
            <Field label="Link" value={b.url} onSave={(url) => patch({ url })} />
          </div>
          <div className="flex flex-wrap items-center gap-4 text-xs text-muted">
            <span>Started {fmtDay(b.started_on)}</span>
            <span>Finished {fmtDay(b.finished_on)}</span>
            {b.url && <ExtLink href={b.url}>Open link</ExtLink>}
            <button className="ml-auto text-muted hover:text-bad" onClick={() => confirm(`Delete "${b.title}" and its notes?`) && m.mutate({ method: 'del', url: `/api/books/${b.id}` })}>
              Delete book
            </button>
          </div>
          <div>
            <div className="label">Notes</div>
            <NoteLog
              notes={b.notes}
              withPage
              defaultPage={b.current_page || undefined}
              onAdd={(body, page) => m.mutate({ method: 'post', url: `/api/books/${b.id}/notes`, body: { body, page: page ?? (b.current_page || null) } })}
              onDelete={(id) => m.mutate({ method: 'del', url: `/api/book-notes/${id}` })}
            />
          </div>
        </div>
      )}
    </div>
  )
}

/** Bookmark banner: the saved page, when it was saved, and the latest note. */
function WhereIWas({ book: b }: { book: Book }) {
  const last = b.notes[0]
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg bg-accent-soft px-4 py-3 text-sm">
      <div>
        <div className="text-xs font-semibold tracking-wide text-accent uppercase">Bookmark</div>
        <div className="mt-0.5 text-base font-semibold">
          {b.current_page ? (
            <>
              Page {b.current_page}
              {b.total_pages ? <span className="font-normal text-muted"> of {b.total_pages}</span> : null}
            </>
          ) : (
            'Not started yet'
          )}
        </div>
        {b.page_updated_at && <div className="text-xs text-muted">saved {fmtWhen(b.page_updated_at)}</div>}
      </div>
      {b.total_pages ? (
        <div className="flex min-w-48 flex-1 items-center gap-2">
          <Bar percent={b.percent} />
          <span className="text-xs font-medium text-muted tabular-nums">{b.percent ?? 0}%</span>
        </div>
      ) : (
        <div className="flex-1 text-xs text-muted">Add the page count below to track %.</div>
      )}
      <PageInput book={b} />
      {last && (
        <div className="w-full border-t border-accent/20 pt-2 text-xs text-muted">
          <span className="font-semibold text-fg">Last note</span>
          {last.page != null && <> (p. {last.page})</>}: <span className="whitespace-pre-wrap">{last.body.length > 240 ? last.body.slice(0, 240) + '…' : last.body}</span>
        </div>
      )}
    </div>
  )
}
