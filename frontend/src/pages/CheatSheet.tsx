import { useQuery } from '@tanstack/react-query'
import { Children, isValidElement, useEffect, useState, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import { Link, useNavigate, useParams } from 'react-router-dom'
import rehypeHighlight from 'rehype-highlight'
import remarkGfm from 'remark-gfm'
import { api, type SheetMeta } from '../api'
import { ErrorBox, Loading } from '../components/ui'

function slug(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

function textOf(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children)
  return ''
}

export default function CheatSheet() {
  const { key } = useParams()
  const navigate = useNavigate()
  const [filter, setFilter] = useState('')
  const index = useQuery({ queryKey: ['cheatsheet'], queryFn: () => api.get<SheetMeta[]>('/api/cheatsheet'), staleTime: Infinity })
  const page = useQuery({
    queryKey: ['cheatsheet', key],
    queryFn: () => api.get<SheetMeta & { body: string }>(`/api/cheatsheet/${key}`),
    enabled: !!key,
    staleTime: Infinity,
  })

  useEffect(() => {
    if (!key && index.data?.length) navigate(`/cheatsheet/${index.data[0].key}`, { replace: true })
  }, [key, index.data, navigate])

  useEffect(() => {
    if (page.data && window.location.hash) document.getElementById(window.location.hash.slice(1))?.scrollIntoView()
    else window.scrollTo(0, 0)
  }, [page.data])

  const q = filter.trim().toLowerCase()
  const sheets = (index.data ?? [])
    .map((s) => ({ ...s, sections: q && !s.title.toLowerCase().includes(q) ? s.sections.filter((h) => h.toLowerCase().includes(q)) : s.sections }))
    .filter((s) => !q || s.title.toLowerCase().includes(q) || s.sections.length > 0)

  return (
    <div className="grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)]">
      <aside className="lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto">
        <h1 className="mb-3 text-2xl font-bold tracking-tight">Cheat Sheet</h1>
        <input className="input mb-3" placeholder="Filter topics…" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <ErrorBox error={index.error} />
        <nav className="space-y-0.5 text-sm">
          {sheets.map((s) => (
            <div key={s.key}>
              <Link
                to={`/cheatsheet/${s.key}`}
                className={`block rounded-md px-2 py-1.5 font-medium ${s.key === key ? 'bg-accent-soft text-accent' : 'hover:bg-panel-2'}`}
              >
                {s.title}
              </Link>
              {(s.key === key || q) && s.sections.length > 0 && (
                <ul className="mb-1 ml-3 border-l border-line">
                  {s.sections.map((h) => (
                    <li key={h}>
                      <Link to={`/cheatsheet/${s.key}#${slug(h)}`} onClick={() => setTimeout(() => document.getElementById(slug(h))?.scrollIntoView({ behavior: 'smooth' }))} className="block truncate py-0.5 pl-3 text-xs text-muted hover:text-fg">
                        {h}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </nav>
      </aside>
      <article className="prose min-w-0">
        {page.isLoading && <Loading />}
        <ErrorBox error={page.error} />
        {page.data && (
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeHighlight]}
            components={{
              h2: ({ children }) => <h2 id={slug(textOf(Children.toArray(children)))}>{children}</h2>,
              a: ({ href, children }) => (
                <a href={href} target={href?.startsWith('http') ? '_blank' : undefined} rel="noreferrer">
                  {children}
                </a>
              ),
            }}
          >
            {page.data.body}
          </ReactMarkdown>
        )}
      </article>
    </div>
  )
}
