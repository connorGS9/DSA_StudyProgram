import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type VideoInfo } from '../api'
import { ErrorBox, fmtDate, fmtDuration, Loading, PageHeader, SourceBadge } from '../components/ui'

export default function Videos() {
  const qc = useQueryClient()
  const videos = useQuery({ queryKey: ['videos'], queryFn: () => api.get<VideoInfo[]>('/api/videos') })
  const [q, setQ] = useState('')
  const del = useMutation({
    mutationFn: (id: number) => api.del(`/api/videos/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['videos'] }),
  })
  const rename = useMutation({
    mutationFn: ({ id, title }: { id: number; title: string }) => api.patch(`/api/videos/${id}`, { title }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['videos'] }),
  })

  if (videos.isLoading) return <Loading />
  const list = (videos.data ?? []).filter((v) => !q || `${v.title} ${v.problem?.title}`.toLowerCase().includes(q.toLowerCase()))
  const totalMb = (videos.data ?? []).reduce((a, v) => a + v.size_bytes, 0) / 1e6

  return (
    <div>
      <PageHeader
        title="Videos"
        subtitle={`${videos.data?.length ?? 0} explanations · ${totalMb.toFixed(0)} MB on disk`}
        actions={<input className="input w-64" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />}
      />
      <ErrorBox error={videos.error || del.error} />
      {list.length === 0 && (
        <div className="card p-8 text-center text-sm text-muted">
          No videos yet. After finishing a problem you can record yourself explaining the solution, or add one from any problem page.
        </div>
      )}
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {list.map((v) => (
          <div key={v.id} className="card overflow-hidden">
            <video src={v.url} controls preload="metadata" className="aspect-video w-full bg-black" />
            <div className="space-y-1.5 p-3">
              <input
                className="w-full bg-transparent text-sm font-semibold outline-none focus:underline"
                defaultValue={v.title}
                placeholder="Untitled"
                onBlur={(e) => e.target.value !== v.title && rename.mutate({ id: v.id, title: e.target.value })}
              />
              {v.problem && (
                <div className="flex items-center gap-2 text-xs">
                  <SourceBadge source={v.problem.source} />
                  <Link to={`/problems/${v.problem.id}`} className="truncate text-muted hover:text-accent">
                    {v.problem.title}
                  </Link>
                </div>
              )}
              <div className="flex items-center justify-between text-xs text-muted">
                <span>
                  {fmtDate(v.created_at)} · {fmtDuration(v.duration_sec)} · {(v.size_bytes / 1e6).toFixed(1)} MB
                </span>
                <button
                  className="text-muted hover:text-bad"
                  onClick={() => confirm('Delete this video permanently?') && del.mutate(v.id)}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
