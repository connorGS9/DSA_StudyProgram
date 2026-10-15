import { NavLink, Route, Routes } from 'react-router-dom'
import Books from './pages/Books'
import CheatSheet from './pages/CheatSheet'
import Lab from './pages/Lab'
import Library from './pages/Library'
import ProblemPage from './pages/ProblemPage'
import Projects from './pages/Projects'
import Progress from './pages/Progress'
import SettingsPage from './pages/SettingsPage'
import Solve from './pages/Solve'
import Today from './pages/Today'
import Videos from './pages/Videos'

const NAV: { section?: string; items: { to: string; label: string; icon: string }[] }[] = [
  {
    items: [{ to: '/', label: 'Lab', icon: 'M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z' }],
  },
  {
    section: 'DSA',
    items: [
      { to: '/dsa', label: 'Today', icon: 'M3 12l9-9 9 9M5 10v10h14V10' },
      { to: '/progress', label: 'Progress', icon: 'M4 20V10M10 20V4M16 20v-7M22 20H2' },
      { to: '/library', label: 'Library', icon: 'M4 5h16M4 12h16M4 19h10' },
      { to: '/cheatsheet', label: 'Cheat Sheet', icon: 'M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h7' },
      { to: '/videos', label: 'Videos', icon: 'M3 6h13v12H3zM16 10l5-3v10l-5-3' },
    ],
  },
  {
    section: 'Study',
    items: [
      { to: '/books', label: 'Books', icon: 'M4 5a2 2 0 012-2h5v17H6a2 2 0 00-2 2zM20 5a2 2 0 00-2-2h-5v17h5a2 2 0 012 2z' },
      { to: '/projects', label: 'Projects', icon: 'M3 7h18v13H3zM8 7V4h8v3M3 12h18' },
    ],
  },
  {
    items: [{ to: '/settings', label: 'Settings', icon: 'M12 8a4 4 0 100 8 4 4 0 000-8zM3 12h2M19 12h2M12 3v2M12 19v2' }],
  },
]

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" className="h-4.5 w-4.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  )
}

export default function App() {
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="border-b border-line bg-panel md:sticky md:top-0 md:h-screen md:w-56 md:shrink-0 md:border-r md:border-b-0">
        <div className="flex items-center gap-2 px-5 py-4">
          <img src="/favicon.svg" className="h-7 w-7" alt="" />
          <span className="font-bold tracking-tight">Study Lab</span>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:overflow-visible">
          {NAV.map((g, gi) => (
            <div key={gi} className="flex gap-1 md:flex-col md:pt-3 md:first:pt-0">
              {g.section && <div className="hidden px-3 pb-1 text-[11px] font-semibold tracking-wide text-muted uppercase md:block">{g.section}</div>}
              {g.items.map((n) => (
                <NavLink
                  key={n.to}
                  to={n.to}
                  end={n.to === '/'}
                  className={({ isActive }) =>
                    `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors ${
                      isActive ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-panel-2 hover:text-fg'
                    }`
                  }
                >
                  <Icon d={n.icon} />
                  {n.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-6 md:px-10 md:py-8">
        <div className="mx-auto max-w-6xl">
          <Routes>
            <Route path="/" element={<Lab />} />
            <Route path="/dsa" element={<Today />} />
            <Route path="/books" element={<Books />} />
            <Route path="/projects" element={<Projects />} />
            <Route path="/solve/:slotId" element={<Solve />} />
            <Route path="/problems/:id" element={<ProblemPage />} />
            <Route path="/progress" element={<Progress />} />
            <Route path="/library" element={<Library />} />
            <Route path="/cheatsheet" element={<CheatSheet />} />
            <Route path="/cheatsheet/:key" element={<CheatSheet />} />
            <Route path="/videos" element={<Videos />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </div>
      </main>
    </div>
  )
}
