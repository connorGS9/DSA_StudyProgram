function localISO(d: Date) {
  const m = (d.getMonth() + 1).toString().padStart(2, '0')
  const day = d.getDate().toString().padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

/** GitHub-style activity grid: one column per week, Sunday at the top. */
export default function Heatmap({ activity, weeks = 26 }: { activity: Record<string, number>; weeks?: number }) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const start = new Date(today)
  start.setDate(start.getDate() - today.getDay() - (weeks - 1) * 7)

  const columns: { iso: string; count: number; future: boolean }[][] = []
  for (let w = 0; w < weeks; w++) {
    const col = []
    for (let d = 0; d < 7; d++) {
      const date = new Date(start)
      date.setDate(start.getDate() + w * 7 + d)
      const iso = localISO(date)
      col.push({ iso, count: activity[iso] ?? 0, future: date > today })
    }
    columns.push(col)
  }

  const level = (n: number) =>
    n === 0 ? 'bg-panel-2' : n === 1 ? 'bg-accent/35' : n === 2 ? 'bg-accent/60' : n <= 4 ? 'bg-accent/80' : 'bg-accent'

  return (
    <div className="flex gap-[3px] overflow-x-auto">
      {columns.map((col, i) => (
        <div key={i} className="flex flex-col gap-[3px]">
          {col.map((c) => (
            <div
              key={c.iso}
              title={c.future ? '' : `${c.iso}: ${c.count} problem${c.count === 1 ? '' : 's'}`}
              className={`h-3 w-3 rounded-[3px] ${c.future ? 'opacity-0' : level(c.count)}`}
            />
          ))}
        </div>
      ))}
    </div>
  )
}
