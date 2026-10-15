import { cpp } from '@codemirror/lang-cpp'
import { java } from '@codemirror/lang-java'
import { python } from '@codemirror/lang-python'
import { oneDark } from '@codemirror/theme-one-dark'
import CodeMirror from '@uiw/react-codemirror'
import { useEffect, useState } from 'react'

export type Lang = 'java' | 'python' | 'cpp'

const LANG_EXT = { java: java(), python: python(), cpp: cpp() }

function useDarkMode() {
  const mq = window.matchMedia('(prefers-color-scheme: dark)')
  const [dark, setDark] = useState(mq.matches)
  useEffect(() => {
    const on = (e: MediaQueryListEvent) => setDark(e.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [mq])
  return dark
}

export function CodeEditor({
  value,
  onChange,
  language,
  readOnly = false,
  minHeight = '220px',
  maxHeight,
}: {
  value: string
  onChange?: (v: string) => void
  language: Lang | 'other'
  readOnly?: boolean
  minHeight?: string
  maxHeight?: string
}) {
  const dark = useDarkMode()
  return (
    <CodeMirror
      value={value}
      onChange={onChange}
      readOnly={readOnly}
      editable={!readOnly}
      theme={dark ? oneDark : 'light'}
      extensions={language === 'other' ? [] : [LANG_EXT[language]]}
      minHeight={minHeight}
      maxHeight={maxHeight}
      basicSetup={{ foldGutter: false, highlightActiveLine: !readOnly }}
      className="overflow-hidden rounded-lg border border-line text-[13px]"
    />
  )
}

export const LANG_LABEL: Record<Lang, string> = { java: 'Java', python: 'Python', cpp: 'C++' }

export function langFromFilename(name: string): Lang | null {
  const ext = name.split('.').pop()?.toLowerCase()
  if (ext === 'java') return 'java'
  if (ext === 'py') return 'python'
  if (ext && ['cpp', 'cc', 'cxx', 'h', 'hpp'].includes(ext)) return 'cpp'
  return null
}
