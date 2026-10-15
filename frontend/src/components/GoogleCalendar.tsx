import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, type ReactNode, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../api'
import { ErrorBox } from './ui'
import { fmtWhen } from './lab'

interface GcalStatus {
  configured: boolean
  client_id: string
  connected: boolean
  calendar_id: string | null
  timezone: string | null
  reminder_minutes: number
  last_sync: string | null
  last_error: string | null
  events: number
  redirect_uri: string
}

const REMINDERS = [
  { v: -1, label: 'No reminders' },
  { v: 0, label: 'When it starts' },
  { v: 5, label: '5 min before' },
  { v: 10, label: '10 min before' },
  { v: 15, label: '15 min before' },
]

/** Both loopback spellings, so the OAuth client works however the app is opened. */
function redirectUris(uri: string) {
  const alt = uri.includes('://127.0.0.1') ? uri.replace('://127.0.0.1', '://localhost') : uri.replace('://localhost', '://127.0.0.1')
  return alt === uri ? [uri] : [uri, alt]
}

export default function GoogleCalendarCard() {
  const qc = useQueryClient()
  const [params, setParams] = useSearchParams()
  const st = useQuery({ queryKey: ['gcal'], queryFn: () => api.get<GcalStatus>('/api/gcal/status'), refetchInterval: 15000 })
  const update = useMutation({
    mutationFn: ({ url, body, method = 'post' }: { url: string; body?: unknown; method?: 'post' | 'put' }) => api[method]<GcalStatus>(url, body),
    onSuccess: (s) => qc.setQueryData(['gcal'], s),
  })
  const connect = useMutation({
    mutationFn: () => api.get<{ url: string }>(`/api/gcal/connect?tz=${encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone)}`),
    onSuccess: ({ url }) => window.location.assign(url),
  })
  const flash = params.get('gcal')
  const dismiss = () => setParams((p) => (p.delete('gcal'), p.delete('msg'), p))

  const s = st.data
  return (
    <section id="google-calendar" className="card scroll-mt-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Google Calendar</h2>
        {s?.connected && <span className="chip bg-good-soft text-good">Connected</span>}
      </div>
      <p className="mb-4 text-sm text-muted">
        Keeps a <b>Study Lab</b> calendar in your Google account in sync with your Schedule, so your phone reminds you. Study Lab can only touch calendars it creates, never your other ones.
      </p>

      {flash === 'connected' && (
        <Banner tone="good" onClose={dismiss}>
          Connected. Your routine is now in the “Study Lab” calendar.
        </Banner>
      )}
      {flash === 'error' && (
        <Banner tone="bad" onClose={dismiss}>
          {params.get('msg') || 'Connecting failed.'}
        </Banner>
      )}
      <ErrorBox error={st.error || update.error || connect.error} />

      {!s ? null : !s.configured ? (
        <Setup status={s} onSave={(body) => update.mutate({ url: '/api/gcal/config', body, method: 'put' })} pending={update.isPending} />
      ) : !s.connected ? (
        <div className="space-y-3">
          {s.last_error && <Banner tone="bad">{s.last_error}</Banner>}
          <div className="flex flex-wrap items-center gap-3">
            <button className="btn btn-primary" disabled={connect.isPending} onClick={() => connect.mutate()}>
              Connect Google Calendar
            </button>
            <span className="text-xs text-muted">You'll sign in with Google and come back here.</span>
          </div>
          <details className="text-sm">
            <summary className="cursor-pointer text-muted">OAuth client: {s.client_id.slice(0, 24)}…</summary>
            <div className="mt-3">
              <Setup status={s} onSave={(body) => update.mutate({ url: '/api/gcal/config', body, method: 'put' })} pending={update.isPending} />
            </div>
          </details>
        </div>
      ) : (
        <Connected status={s} update={(url, body, method) => update.mutate({ url, body, method })} pending={update.isPending} />
      )}
    </section>
  )
}

function Banner({ tone, children, onClose }: { tone: 'good' | 'bad'; children: ReactNode; onClose?: () => void }) {
  return (
    <div className={`mb-3 flex items-start justify-between gap-3 rounded-lg px-3 py-2 text-sm ${tone === 'good' ? 'bg-good-soft text-good' : 'bg-bad-soft text-bad'}`}>
      <span>{children}</span>
      {onClose && (
        <button onClick={onClose} aria-label="Dismiss">
          ✕
        </button>
      )}
    </div>
  )
}

function Connected({ status: s, update, pending }: { status: GcalStatus; update: (url: string, body?: unknown, method?: 'post' | 'put') => void; pending: boolean }) {
  const [deleteCal, setDeleteCal] = useState(false)
  return (
    <div className="space-y-4">
      {s.last_error && <Banner tone="bad">Last sync failed: {s.last_error}</Banner>}
      <div className="grid gap-3 text-sm sm:grid-cols-3">
        <div>
          <div className="label">Last synced</div>
          {s.last_sync ? fmtWhen(s.last_sync) : 'never'}
        </div>
        <div>
          <div className="label">Events</div>
          {s.events} blocks mirrored
        </div>
        <div>
          <div className="label">Time zone</div>
          {s.timezone}
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label>
          <span className="label">Phone / Google reminders</span>
          <select className="input w-48" value={s.reminder_minutes} onChange={(e) => update('/api/gcal/config', { reminder_minutes: Number(e.target.value) }, 'put')}>
            {REMINDERS.map((r) => (
              <option key={r.v} value={r.v}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
        <button className="btn" disabled={pending} onClick={() => update('/api/gcal/sync')}>
          {pending ? 'Syncing…' : '↻ Sync now'}
        </button>
        <a className="btn" href="https://calendar.google.com/" target="_blank" rel="noreferrer">
          Open Google Calendar ↗
        </a>
      </div>
      <p className="text-xs text-muted">
        Changes in Schedule (edits, skips, moves, one-off events) sync automatically within a few seconds while Study Lab is running. Edit blocks here, not in Google: changes made in Google get overwritten.
      </p>
      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-3">
        <label className="flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" className="h-4 w-4 accent-[var(--accent)]" checked={deleteCal} onChange={(e) => setDeleteCal(e.target.checked)} />
          Also delete the Study Lab calendar from Google
        </label>
        <button
          className="btn btn-danger ml-auto"
          disabled={pending}
          onClick={() => confirm(deleteCal ? 'Disconnect and delete the Study Lab calendar from Google?' : 'Disconnect? The Study Lab calendar stays in Google but stops updating.') && update('/api/gcal/disconnect', { delete_calendar: deleteCal })}
        >
          Disconnect
        </button>
      </div>
    </div>
  )
}

function Setup({ status: s, onSave, pending }: { status: GcalStatus; onSave: (b: { client_id: string; client_secret: string }) => void; pending: boolean }) {
  const [f, setF] = useState({ client_id: s.client_id, client_secret: '' })
  const uris = redirectUris(s.redirect_uri)
  const submit = (e: FormEvent) => {
    e.preventDefault()
    onSave(f)
  }
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-line bg-panel-2/50 p-4 text-sm">
        <div className="mb-2 font-semibold">One-time setup (about 10 minutes)</div>
        <p className="mb-3 text-muted">Google requires every app that touches a calendar to have its own OAuth client. You create a free one for your personal copy of Study Lab:</p>
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            Open the{' '}
            <a className="text-accent underline" href="https://console.cloud.google.com/projectcreate" target="_blank" rel="noreferrer">
              Google Cloud console
            </a>{' '}
            and create a project named <b>Study Lab</b>.
          </li>
          <li>
            Enable the{' '}
            <a className="text-accent underline" href="https://console.cloud.google.com/apis/library/calendar-json.googleapis.com" target="_blank" rel="noreferrer">
              Google Calendar API
            </a>{' '}
            for that project.
          </li>
          <li>
            Go to{' '}
            <a className="text-accent underline" href="https://console.cloud.google.com/auth/overview" target="_blank" rel="noreferrer">
              Google Auth Platform
            </a>{' '}
            → <b>Get started</b>: app name “Study Lab”, your email for support and contact, audience <b>External</b>.
          </li>
          <li>
            Under <b>Audience</b>, click <b>Publish app</b> (status “In production”). Otherwise Google signs you out every 7 days. You don't need Google's verification for personal use.
          </li>
          <li>
            Under <b>Clients</b> → <b>Create client</b>: type <b>Web application</b>, and add these <b>Authorized redirect URIs</b>:
            <ul className="mt-1.5 space-y-1">
              {uris.map((u) => (
                <li key={u} className="flex items-center gap-2">
                  <code className="rounded border border-line bg-panel px-1.5 py-0.5 text-xs">{u}</code>
                  <button type="button" className="text-xs text-muted hover:text-accent" onClick={() => navigator.clipboard?.writeText(u)}>
                    copy
                  </button>
                </li>
              ))}
            </ul>
          </li>
          <li>Paste the client ID and client secret below. They're stored only in your local database (in <code>data/</code>, which is never committed to git).</li>
        </ol>
        <p className="mt-3 text-xs text-muted">
          When you connect, Google will warn that it “hasn't verified this app”. That's expected for your own unpublished client: choose <b>Advanced → Go to Study Lab</b>.
        </p>
      </div>
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-[2fr_1.3fr_auto]">
        <label>
          <span className="label">Client ID</span>
          <input className="input" required placeholder="…apps.googleusercontent.com" value={f.client_id} onChange={(e) => setF({ ...f, client_id: e.target.value })} />
        </label>
        <label>
          <span className="label">Client secret</span>
          <input className="input" required type="password" autoComplete="off" placeholder={s.configured ? '•••••• (saved)' : 'GOCSPX-…'} value={f.client_secret} onChange={(e) => setF({ ...f, client_secret: e.target.value })} />
        </label>
        <div className="flex items-end">
          <button className="btn btn-primary w-full" disabled={pending || !f.client_id.trim() || !f.client_secret.trim()}>
            Save
          </button>
        </div>
      </form>
    </div>
  )
}
