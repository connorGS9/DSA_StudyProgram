import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, qs, type Problem } from '../api'
import { CategoryChips, ErrorBox, PageHeader, relDays, SourceBadge, useCategories } from '../components/ui'

interface Filters {
  q: string
  source: string
  category: string
  status: string
  min_rating: string
  max_rating: string
  sort: string
  page: number
}

const INITIAL: Filters = { q: '', source: '', category: '', status: '', min_rating: '', max_rating: '', sort: 'rating', page: 1 }

export default function Library() {
  const { list: categories } = useCategories()
  const [f, setF] = useState<Filters>(INITIAL)
  const [q, setQ] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setF((prev) => ({ ...prev, q, page: 1 })), 250)
    return () => clearTimeout(t)
  }, [q])
  const set = (patch: Partial<Filters>) => setF({ ...f, ...patch, page: patch.page ?? 1 })

  const data = useQuery({
    queryKey: ['problems', f],
    queryFn: () => api.get<{ total: number; page: number; items: Problem[] }>(`/api/problems${qs({ ...f, page_size: 50 })}`),
    placeholderData: keepPreviousData,
  })
  const pages = Math.max(1, Math.ceil((data.data?.total ?? 0) / 50))

  return (
    <div>
      <PageHeader title="Library" subtitle={`${(data.data?.total ?? 0).toLocaleString()} problems match`} />
      <div className="card mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-6">
        <input className="input lg:col-span-2" placeholder="Search title or id…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input" value={f.source} onChange={(e) => set({ source: e.target.value })}>
          <option value="">All sources</option>
          <option value="codeforces">Codeforces</option>
          <option value="cses">CSES</option>
          <option value="leetcode">LeetCode</option>
        </select>
        <select className="input" value={f.status} onChange={(e) => set({ status: e.target.value })}>
          <option value="">Any status</option>
          <option value="seen">Attempted</option>
          <option value="unseen">Not attempted</option>
          <option value="due">Due for review</option>
          <option value="excluded">Excluded</option>
        </select>
        <select className="input" value={f.category} onChange={(e) => set({ category: e.target.value })} title="Filtering by category reveals categories in the list">
          <option value="">Any category</option>
          {categories.map((c) => (
            <option key={c.key} value={c.key}>
              {c.name}
            </option>
          ))}
        </select>
        <div className="flex gap-2">
          <input className="input" placeholder="min" inputMode="numeric" value={f.min_rating} onChange={(e) => set({ min_rating: e.target.value })} />
          <input className="input" placeholder="max" inputMode="numeric" value={f.max_rating} onChange={(e) => set({ max_rating: e.target.value })} />
        </div>
      </div>
      <ErrorBox error={data.error} />

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-line text-left text-xs tracking-wide text-muted uppercase">
            <tr>
              <th className="px-4 py-2.5 font-semibold">
                <SortBtn label="Problem" field="title" f={f} set={set} />
              </th>
              <th className="px-4 py-2.5 font-semibold">Source</th>
              <th className="px-4 py-2.5 font-semibold">
                <SortBtn label="Rating" field="rating" f={f} set={set} />
              </th>
              <th className="px-4 py-2.5 font-semibold">
                <SortBtn label="Status" field="recent" f={f} set={set} />
              </th>
            </tr>
          </thead>
          <tbody>
            {data.data?.items.map((p) => (
              <tr key={p.id} className="border-b border-line last:border-0 hover:bg-panel-2">
                <td className="px-4 py-2.5">
                  <Link to={`/problems/${p.id}`} className="font-medium hover:text-accent">
                    {p.title}
                  </Link>
                  {p.categories && (
                    <div className="mt-1">
                      <CategoryChips keys={p.categories} />
                    </div>
                  )}
                </td>
                <td className="px-4 py-2.5">
                  <SourceBadge source={p.source} />
                </td>
                <td className="px-4 py-2.5 tabular-nums">{p.rating}</td>
                <td className="px-4 py-2.5 text-muted">
                  {p.excluded ? 'excluded' : p.srs ? (p.srs.retired ? 'retired' : `review ${relDays(p.srs.due)}`) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex items-center justify-center gap-3 text-sm">
        <button className="btn" disabled={f.page <= 1} onClick={() => set({ page: f.page - 1 })}>
          ← Prev
        </button>
        <span className="text-muted tabular-nums">
          Page {f.page} / {pages}
        </span>
        <button className="btn" disabled={f.page >= pages} onClick={() => set({ page: f.page + 1 })}>
          Next →
        </button>
      </div>
    </div>
  )
}

function SortBtn({ label, field, f, set }: { label: string; field: string; f: Filters; set: (p: Partial<Filters>) => void }) {
  const active = f.sort === field || f.sort === `-${field}`
  const next = field === 'rating' && f.sort === 'rating' ? '-rating' : field
  return (
    <button className={`uppercase ${active ? 'text-fg' : ''}`} onClick={() => set({ sort: next })}>
      {label}
      {active && (f.sort.startsWith('-') ? ' ↓' : ' ↑')}
    </button>
  )
}
