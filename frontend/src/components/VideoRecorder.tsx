import { useEffect, useRef, useState } from 'react'
import { api, type VideoInfo } from '../api'
import { ErrorBox, fmtDuration } from './ui'

type Mode = 'camera' | 'screen' | 'screen+camera'
type Phase = 'idle' | 'ready' | 'recording' | 'recorded' | 'saving'

const MODES: { key: Mode; label: string; hint: string }[] = [
  { key: 'camera', label: 'Camera', hint: 'Talk through it face to camera / whiteboard' },
  { key: 'screen', label: 'Screen', hint: 'Walk through your code or a drawing app' },
  { key: 'screen+camera', label: 'Screen + camera', hint: 'Screen with your camera in the corner' },
]

function pickMime() {
  for (const m of ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4']) {
    if (MediaRecorder.isTypeSupported(m)) return m
  }
  return ''
}

/**
 * A timer that keeps ticking while the tab is in the background (worker timers are not throttled),
 * so compositing screen + camera keeps running while you are in your editor.
 */
function workerTicker(fps: number, onTick: () => void) {
  const src = `setInterval(() => postMessage(0), ${Math.round(1000 / fps)})`
  const worker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })))
  worker.onmessage = onTick
  return () => worker.terminate()
}

export default function VideoRecorder({
  problemId,
  attemptId,
  defaultTitle = '',
  onSaved,
}: {
  problemId: number
  attemptId?: number
  defaultTitle?: string
  onSaved?: (v: VideoInfo) => void
}) {
  const [mode, setMode] = useState<Mode>('camera')
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<unknown>(null)
  const [elapsed, setElapsed] = useState(0)
  const [title, setTitle] = useState(defaultTitle)
  const [blobUrl, setBlobUrl] = useState<string | null>(null)

  const liveRef = useRef<HTMLVideoElement>(null)
  const streamsRef = useRef<MediaStream[]>([])
  const outStreamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const blobRef = useRef<Blob | null>(null)
  const stopTickerRef = useRef<(() => void) | null>(null)
  const startedAtRef = useRef(0)

  const cleanup = () => {
    stopTickerRef.current?.()
    stopTickerRef.current = null
    streamsRef.current.forEach((s) => s.getTracks().forEach((t) => t.stop()))
    streamsRef.current = []
    outStreamRef.current = null
  }

  useEffect(() => cleanup, [])
  useEffect(() => () => { if (blobUrl) URL.revokeObjectURL(blobUrl) }, [blobUrl])

  useEffect(() => {
    if (phase !== 'recording') return
    const id = setInterval(() => setElapsed((Date.now() - startedAtRef.current) / 1000), 250)
    return () => clearInterval(id)
  }, [phase])

  async function prepare() {
    setError(null)
    cleanup()
    try {
      let out: MediaStream
      if (mode === 'camera') {
        const cam = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 }, audio: true })
        streamsRef.current = [cam]
        out = cam
      } else {
        const screen = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: false })
        const micOrCam = await navigator.mediaDevices.getUserMedia({ audio: true, video: mode === 'screen+camera' ? { width: 320, height: 320 } : false })
        streamsRef.current = [screen, micOrCam]
        const audio = micOrCam.getAudioTracks()
        if (mode === 'screen') {
          out = new MediaStream([...screen.getVideoTracks(), ...audio])
        } else {
          out = composite(screen, micOrCam)
          out.addTrack(audio[0])
        }
        // If the user stops sharing from the browser's own bar, end the recording cleanly.
        screen.getVideoTracks()[0].addEventListener('ended', () => {
          if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
        })
      }
      outStreamRef.current = out
      if (liveRef.current) {
        liveRef.current.srcObject = out
        liveRef.current.play().catch(() => {})
      }
      setPhase('ready')
    } catch (e) {
      cleanup()
      setError(e instanceof DOMException && e.name === 'NotAllowedError' ? new Error('Camera / screen permission was denied.') : e)
    }
  }

  function composite(screen: MediaStream, cam: MediaStream): MediaStream {
    const sv = document.createElement('video')
    const cv = document.createElement('video')
    for (const [v, s] of [[sv, screen], [cv, cam]] as const) {
      v.srcObject = s
      v.muted = true
      v.play().catch(() => {})
    }
    const canvas = document.createElement('canvas')
    const { width = 1920, height = 1080 } = screen.getVideoTracks()[0].getSettings()
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')!
    stopTickerRef.current = workerTicker(30, () => {
      ctx.drawImage(sv, 0, 0, canvas.width, canvas.height)
      const r = Math.round(canvas.height * 0.13)
      const cx = canvas.width - r - 32
      const cy = canvas.height - r - 32
      ctx.save()
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.clip()
      const side = Math.min(cv.videoWidth, cv.videoHeight) || 1
      ctx.drawImage(cv, (cv.videoWidth - side) / 2, (cv.videoHeight - side) / 2, side, side, cx - r, cy - r, 2 * r, 2 * r)
      ctx.restore()
      ctx.lineWidth = 4
      ctx.strokeStyle = '#ffffff'
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.stroke()
    })
    return canvas.captureStream(30)
  }

  function start() {
    const out = outStreamRef.current
    if (!out) return
    chunksRef.current = []
    const mime = pickMime()
    const rec = new MediaRecorder(out, mime ? { mimeType: mime, videoBitsPerSecond: 2_500_000 } : undefined)
    rec.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data)
    rec.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'video/webm' })
      blobRef.current = blob
      setBlobUrl(URL.createObjectURL(blob))
      setElapsed((Date.now() - startedAtRef.current) / 1000)
      cleanup()
      setPhase('recorded')
    }
    recorderRef.current = rec
    rec.start(1000)
    startedAtRef.current = Date.now()
    setElapsed(0)
    setPhase('recording')
  }

  async function save() {
    if (!blobRef.current) return
    setPhase('saving')
    setError(null)
    const fd = new FormData()
    const ext = blobRef.current.type.includes('mp4') ? 'mp4' : 'webm'
    fd.append('file', blobRef.current, `recording.${ext}`)
    fd.append('title', title)
    fd.append('duration_sec', String(Math.round(elapsed)))
    if (attemptId) fd.append('attempt_id', String(attemptId))
    try {
      const v = await api.post<VideoInfo>(`/api/problems/${problemId}/videos`, fd)
      reset()
      onSaved?.(v)
    } catch (e) {
      setError(e)
      setPhase('recorded')
    }
  }

  function reset() {
    cleanup()
    blobRef.current = null
    setBlobUrl(null)
    setElapsed(0)
    setPhase('idle')
  }

  async function uploadFile(f: File) {
    setError(null)
    setPhase('saving')
    const fd = new FormData()
    fd.append('file', f, f.name)
    fd.append('title', title || f.name)
    if (attemptId) fd.append('attempt_id', String(attemptId))
    try {
      const v = await api.post<VideoInfo>(`/api/problems/${problemId}/videos`, fd)
      setPhase('idle')
      onSaved?.(v)
    } catch (e) {
      setError(e)
      setPhase('idle')
    }
  }

  return (
    <div className="space-y-3">
      <ErrorBox error={error} />
      {phase === 'idle' && (
        <>
          <div className="grid gap-2 sm:grid-cols-3">
            {MODES.map((m) => (
              <button
                key={m.key}
                onClick={() => setMode(m.key)}
                className={`rounded-lg border px-3 py-2 text-left transition-colors ${mode === m.key ? 'border-accent bg-accent-soft' : 'border-line hover:bg-panel-2'}`}
              >
                <div className="text-sm font-semibold">{m.label}</div>
                <div className="text-xs text-muted">{m.hint}</div>
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn btn-primary" onClick={prepare}>
              Set up {MODES.find((m) => m.key === mode)!.label.toLowerCase()}
            </button>
            <label className="btn cursor-pointer">
              Upload a video file
              <input type="file" accept="video/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadFile(e.target.files[0])} />
            </label>
          </div>
        </>
      )}

      <div className={phase === 'ready' || phase === 'recording' ? '' : 'hidden'}>
        <video ref={liveRef} muted playsInline className="aspect-video w-full rounded-lg bg-black object-contain" />
        <div className="mt-2 flex items-center gap-2">
          {phase === 'ready' ? (
            <>
              <button className="btn btn-primary" onClick={start}>
                ● Start recording
              </button>
              <button className="btn" onClick={reset}>
                Cancel
              </button>
            </>
          ) : (
            <>
              <button className="btn btn-danger border-bad/40" onClick={() => recorderRef.current?.stop()}>
                ■ Stop
              </button>
              <span className="flex items-center gap-2 text-sm font-medium tabular-nums">
                <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-bad" /> {fmtDuration(elapsed)}
              </span>
            </>
          )}
        </div>
      </div>

      {(phase === 'recorded' || phase === 'saving') && blobUrl && (
        <div className="space-y-2">
          <video src={blobUrl} controls className="aspect-video w-full rounded-lg bg-black object-contain" />
          <input className="input" placeholder="Title (optional)" value={title} onChange={(e) => setTitle(e.target.value)} />
          <div className="flex gap-2">
            <button className="btn btn-primary" disabled={phase === 'saving'} onClick={save}>
              {phase === 'saving' ? 'Saving…' : `Save recording (${fmtDuration(elapsed)})`}
            </button>
            <button className="btn" disabled={phase === 'saving'} onClick={reset}>
              Discard
            </button>
          </div>
        </div>
      )}
      {phase === 'saving' && !blobUrl && <div className="text-sm text-muted">Uploading…</div>}
    </div>
  )
}
