import { useMutation, useQuery } from '@tanstack/react-query'
import { type ChangeEvent, useRef, useState } from 'react'
import { api } from '../api'
import { fmtWhen } from './lab'
import { ErrorBox } from './ui'

interface BackupInfo {
  db_bytes: number
  solutions: { files: number; bytes: number }
  videos: { files: number; bytes: number }
  last_backup: { at: string; videos: boolean; secrets: boolean } | null
  safety_copies: string[]
  safety_dir: string
}

const EMAIL_LIMIT = 20e6 // most mail services cap attachments at 20–25 MB

function fmtBytes(n: number) {
  if (n === 0) return '0 KB'
  if (n < 1e6) return `${Math.max(1, Math.round(n / 1e3))} KB`
  if (n < 1e9) return `${(n / 1e6).toFixed(n < 1e7 ? 1 : 0)} MB`
  return `${(n / 1e9).toFixed(1)} GB`
}

export default function BackupCard() {
  const info = useQuery({ queryKey: ['backup-info'], queryFn: () => api.get<BackupInfo>('/api/backup/info') })
  const [videos, setVideos] = useState(true)
  const [secrets, setSecrets] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const restore = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData()
      fd.append('file', file)
      return api.post<{ restored: { created_at: string } }>('/api/restore', fd)
    },
    // Every page's cached data is stale now; a full reload is the simplest correct refresh.
    onSuccess: () => setTimeout(() => window.location.reload(), 1500),
  })

  const i = info.data
  // Zip compresses the database a lot; solutions and videos barely.
  const estimate = i ? i.db_bytes * 0.35 + i.solutions.bytes + (videos ? i.videos.bytes : 0) : 0
  const daysSince = i?.last_backup ? (Date.now() - new Date(i.last_backup.at).getTime()) / 86400000 : null

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    if (confirm(`Replace ALL Study Lab data on this device with “${f.name}”?\n\nA safety copy of the current data is saved first, so this can be undone.`)) restore.mutate(f)
  }

  return (
    <section id="backup" className="card scroll-mt-4 p-5">
      <h2 className="font-semibold">Backup & restore</h2>
      <p className="mb-4 text-sm text-muted">
        Everything you've entered (books, notes, schedule, projects, DSA history, solutions, videos) lives only on this device. Download a backup to keep a copy or move it to another laptop; restore it there.
      </p>
      <ErrorBox error={info.error} />

      {i && (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-3">
            <div className="label">Download a backup</div>
            <div className="text-sm">
              {i.last_backup ? (
                <span className={daysSince! > 7 ? 'text-warn' : 'text-muted'}>
                  Last backup {fmtWhen(i.last_backup.at)}
                  {daysSince! > 7 && ' (over a week ago)'}
                </span>
              ) : (
                <span className="text-warn">No backup yet.</span>
              )}
            </div>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[var(--accent)]" checked={videos} onChange={(e) => setVideos(e.target.checked)} />
              <span>
                Include videos <span className="text-muted">({i.videos.files ? `${i.videos.files} · ${fmtBytes(i.videos.bytes)}` : 'none yet'})</span>
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[var(--accent)]" checked={secrets} onChange={(e) => setSecrets(e.target.checked)} />
              <span>
                Include sign-ins <span className="text-muted">(Google Calendar connection, LeetCode cookie)</span>
                {secrets && <span className="mt-0.5 block text-xs text-warn">Anyone with this file could use them. Only keep it somewhere private.</span>}
                {!secrets && <span className="mt-0.5 block text-xs text-muted">Left out: after restoring, connect Google Calendar again (your OAuth client ID is kept; re-paste the secret).</span>}
              </span>
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <a
                className="btn btn-primary"
                href={`/api/backup?videos=${videos}&secrets=${secrets}`}
                download
                onClick={() => setTimeout(() => info.refetch(), 3000)}
              >
                ⬇ Download backup
              </a>
              <span className="text-xs text-muted">about {fmtBytes(estimate)}</span>
            </div>
            {estimate > EMAIL_LIMIT && (
              <p className="text-xs text-warn">
                Probably too big to email (most services cap attachments at 20–25 MB). Upload it to Google Drive or similar{videos && i.videos.bytes ? ', or untick videos' : ''}.
              </p>
            )}
          </div>

          <div className="space-y-3">
            <div className="label">Restore from a backup</div>
            <p className="text-sm text-muted">Replaces all data on this device with the backup's. Older backups are upgraded automatically.</p>
            <input ref={fileInput} type="file" accept=".zip,application/zip" className="hidden" onChange={onFile} />
            <button className="btn" disabled={restore.isPending} onClick={() => fileInput.current?.click()}>
              {restore.isPending ? 'Restoring…' : '⬆ Choose backup zip…'}
            </button>
            <ErrorBox error={restore.error} />
            {restore.isSuccess && (
              <div className="rounded-lg bg-good-soft px-3 py-2 text-sm text-good">
                Restored the backup from {fmtWhen(restore.data.restored.created_at)}. Reloading…
              </div>
            )}
            {i.safety_copies.length > 0 && (
              <p className="text-xs text-muted">
                Safety copies from before each restore ({i.safety_copies.length}, newest {i.safety_copies[0].replace(/^pre-restore-|\.zip$/g, '')}) are in <code>{i.safety_dir}</code>. Restore one of them to undo.
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
