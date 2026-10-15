import { useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useState } from 'react'
import type { Project, ProjectStatus, ProjectTask } from '../api'
import { Bar, Chip, ExtLink, Field, fmtDay, NoteLog, PROJECT_STATUS, useDragOrder, useLabMutation, useProjects } from '../components/lab'
import { ErrorBox, Loading, PageHeader } from '../components/ui'

const GROUPS: { status: ProjectStatus; title: string }[] = [
  { status: 'active', title: 'Active' },
  { status: 'paused', title: 'Paused' },
  { status: 'idea', title: 'Ideas' },
  { status: 'done', title: 'Done' },
]

export default function Projects() {
  const projects = useProjects()
  const m = useLabMutation('projects')
  const [adding, setAdding] = useState(false)

  if (projects.isLoading) return <Loading />
  const all = projects.data ?? []
  const count = (s: ProjectStatus) => all.filter((p) => p.status === s).length

  return (
    <div>
      <PageHeader
        title="Projects"
        subtitle={`${count('active')} active · ${count('paused')} paused · ${count('idea')} ideas · ${count('done')} done`}
        actions={
          <button className="btn btn-primary" onClick={() => setAdding((a) => !a)}>
            {adding ? 'Cancel' : '+ New project'}
          </button>
        }
      />
      <ErrorBox error={projects.error || m.error} />
      {adding && <AddProject onDone={() => setAdding(false)} />}
      {all.length === 0 && !adding && (
        <div className="card p-8 text-center text-sm text-muted">
          No projects yet. Add one to track its tasks, progress and a running log of notes.
        </div>
      )}
      <div className="space-y-8">
        {GROUPS.map(({ status, title }) => {
          const list = all.filter((p) => p.status === status)
          if (!list.length) return null
          return (
            <section key={status}>
              <h2 className="label">{title}</h2>
              <div className="space-y-3">
                {list.map((p) => (
                  <ProjectCard key={p.id} project={p} defaultOpen={status === 'active' && list.length === 1} />
                ))}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}

function AddProject({ onDone }: { onDone: () => void }) {
  const m = useLabMutation('projects')
  const [f, setF] = useState({ name: '', description: '', status: 'active' as ProjectStatus, link: '' })
  const submit = (e: FormEvent) => {
    e.preventDefault()
    m.mutate({ method: 'post', url: '/api/projects', body: f }, { onSuccess: onDone })
  }
  return (
    <form onSubmit={submit} className="card mb-6 grid gap-3 p-4 sm:grid-cols-[2fr_1fr]">
      <ErrorBox error={m.error} />
      <div>
        <label className="label">Name</label>
        <input className="input" autoFocus required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
      </div>
      <div>
        <label className="label">Status</label>
        <select className="input" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as ProjectStatus })}>
          <option value="active">Active</option>
          <option value="idea">Idea</option>
          <option value="paused">Paused</option>
        </select>
      </div>
      <div className="sm:col-span-2">
        <label className="label">Description</label>
        <textarea className="input min-h-16" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
      </div>
      <div>
        <label className="label">Link (optional)</label>
        <input className="input" placeholder="repo, doc, board…" value={f.link} onChange={(e) => setF({ ...f, link: e.target.value })} />
      </div>
      <div className="flex items-end">
        <button className="btn btn-primary w-full" disabled={m.isPending || !f.name.trim()}>
          Create project
        </button>
      </div>
    </form>
  )
}

function ProjectCard({ project: p, defaultOpen }: { project: Project; defaultOpen?: boolean }) {
  const m = useLabMutation('projects')
  const [open, setOpen] = useState(defaultOpen ?? false)
  const patch = (body: object) => m.mutate({ method: 'patch', url: `/api/projects/${p.id}`, body })

  return (
    <div className="card">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4">
        <button className="min-w-0 flex-1 text-left" onClick={() => setOpen((o) => !o)}>
          <div className="flex items-center gap-2">
            <span className="truncate font-semibold">{p.name}</span>
            <Chip {...PROJECT_STATUS[p.status]} />
          </div>
          <div className="mt-0.5 truncate text-xs text-muted">
            {p.next_task ? <>Next: {p.next_task}</> : p.description || (p.tasks_total ? 'All tasks done' : 'No tasks yet')}
          </div>
        </button>
        {p.tasks_total > 0 && (
          <div className="flex w-full items-center gap-3 sm:w-56">
            <Bar percent={p.percent} tone={p.percent === 100 ? 'good' : 'accent'} />
            <span className="text-xs font-medium text-muted tabular-nums">
              {p.tasks_done}/{p.tasks_total}
            </span>
          </div>
        )}
        {p.link && <ExtLink href={p.link} />}
        <button className="btn btn-ghost px-2 text-muted" title={open ? 'Collapse' : 'Tasks & notes'} onClick={() => setOpen((o) => !o)}>
          {open ? '▾' : '▸'}
        </button>
      </div>

      {open && (
        <div className="grid gap-6 border-t border-line p-4 lg:grid-cols-2">
          <div className="space-y-4">
            <ErrorBox error={m.error} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Name" value={p.name} onSave={(name) => name && patch({ name })} />
              <div>
                <label className="label">Status</label>
                <select className="input" value={p.status} onChange={(e) => patch({ status: e.target.value })}>
                  {Object.entries(PROJECT_STATUS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="label">Description</label>
                <textarea
                  key={p.description}
                  className="input min-h-16"
                  defaultValue={p.description}
                  onBlur={(e) => e.target.value.trim() !== p.description && patch({ description: e.target.value.trim() })}
                />
              </div>
              <Field label="Link" value={p.link} onSave={(link) => patch({ link })} />
              <div className="flex items-end justify-between gap-2 pb-2 text-xs text-muted">
                <span>
                  {p.started_on && <>Started {fmtDay(p.started_on)}</>}
                  {p.finished_on && <> · done {fmtDay(p.finished_on)}</>}
                </span>
                <button className="hover:text-bad" onClick={() => confirm(`Delete "${p.name}" with its tasks and notes?`) && m.mutate({ method: 'del', url: `/api/projects/${p.id}` })}>
                  Delete
                </button>
              </div>
            </div>
            <div>
              <div className="label">Tasks</div>
              <TaskList project={p} />
            </div>
          </div>
          <div>
            <div className="label">Log</div>
            <NoteLog
              notes={p.notes}
              onAdd={(body) => m.mutate({ method: 'post', url: `/api/projects/${p.id}/notes`, body: { body } })}
              onDelete={(id) => m.mutate({ method: 'del', url: `/api/project-notes/${id}` })}
            />
          </div>
        </div>
      )}
    </div>
  )
}

function TaskList({ project: p }: { project: Project }) {
  const qc = useQueryClient()
  const m = useLabMutation('projects')
  const [title, setTitle] = useState('')
  const [editing, setEditing] = useState<number | null>(null)
  const { list, rowProps } = useDragOrder(p.tasks, (ids) => {
    qc.setQueryData<Project[]>(['projects'], (cur) =>
      cur?.map((x) => (x.id === p.id ? { ...x, tasks: ids.map((id) => x.tasks.find((t) => t.id === id)!) } : x)),
    )
    m.mutate({ method: 'post', url: `/api/projects/${p.id}/tasks/reorder`, body: { ids } })
  })
  const add = (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    m.mutate({ method: 'post', url: `/api/projects/${p.id}/tasks`, body: { title } })
    setTitle('')
  }
  const update = (t: ProjectTask, body: object) => m.mutate({ method: 'patch', url: `/api/project-tasks/${t.id}`, body })

  return (
    <div className="space-y-2">
      {list.length > 0 && (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {list.map((t) => {
            const { className, ...drag } = rowProps(t.id)
            return (
              <li key={t.id} {...drag} draggable={editing !== t.id} className={`group flex items-center gap-2.5 px-3 py-2 text-sm ${className}`}>
                <span className="cursor-grab text-muted opacity-0 group-hover:opacity-100" title="Drag to reorder">
                  ⋮⋮
                </span>
                <input type="checkbox" className="h-4 w-4 accent-[var(--accent)]" checked={t.done} onChange={(e) => update(t, { done: e.target.checked })} />
                {editing === t.id ? (
                  <input
                    className="input flex-1 py-0.5"
                    autoFocus
                    defaultValue={t.title}
                    onBlur={(e) => {
                      if (e.target.value.trim() && e.target.value.trim() !== t.title) update(t, { title: e.target.value })
                      setEditing(null)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                      if (e.key === 'Escape') setEditing(null)
                    }}
                  />
                ) : (
                  <span className={`flex-1 ${t.done ? 'text-muted line-through' : ''}`} onDoubleClick={() => setEditing(t.id)} title="Double-click to edit">
                    {t.title}
                  </span>
                )}
                <button className="text-xs text-muted opacity-0 group-hover:opacity-100 hover:text-bad" title="Delete task" onClick={() => m.mutate({ method: 'del', url: `/api/project-tasks/${t.id}` })}>
                  ✕
                </button>
              </li>
            )
          })}
        </ul>
      )}
      <form onSubmit={add} className="flex gap-2">
        <input className="input" placeholder="Add a task…" value={title} onChange={(e) => setTitle(e.target.value)} />
        <button className="btn" disabled={!title.trim()}>
          Add
        </button>
      </form>
    </div>
  )
}
