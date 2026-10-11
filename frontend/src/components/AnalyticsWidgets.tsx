import { useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts'
import type { Document } from '@/lib/api'

const CHART_COLORS = [
  'oklch(0.55 0.22 264)',
  'oklch(0.60 0.20 300)',
  'oklch(0.55 0.18 200)',
  'oklch(0.65 0.18 85)',
  'oklch(0.55 0.20 155)',
  'oklch(0.60 0.18 30)',
]

interface Props {
  docs: Document[]
  categories: { id: string; name: string }[]
}

function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${bytes} B`
}

export function AnalyticsWidgets({ docs, categories }: Props) {
  // Upload trend — last 6 months
  const uploadTrend = useMemo(() => {
    const months: { month: string; count: number }[] = []
    const now = new Date()
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const label = d.toLocaleDateString('en-IE', { month: 'short' })
      const count = docs.filter(doc => {
        const cd = new Date(doc.created_at)
        return cd.getFullYear() === d.getFullYear() && cd.getMonth() === d.getMonth()
      }).length
      months.push({ month: label, count })
    }
    return months
  }, [docs])

  // Category breakdown
  const categoryData = useMemo(() => {
    const uncategorised = docs.filter(d => !d.category_id).length
    const data = categories
      .map(cat => ({ name: cat.name, value: docs.filter(d => d.category_id === cat.id).length }))
      .filter(d => d.value > 0)
    if (uncategorised > 0) data.push({ name: 'Uncategorised', value: uncategorised })
    return data
  }, [docs, categories])

  // Storage
  const totalBytes = useMemo(() => docs.reduce((sum, d) => sum + (d.file_size || 0), 0), [docs])

  if (docs.length === 0) return null

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8 animate-fade-in">
      {/* Upload trend */}
      <div className="md:col-span-2 rounded-xl border border-border/40 bg-card p-5">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-4">Upload activity</p>
        <ResponsiveContainer width="100%" height={120}>
          <BarChart data={uploadTrend} barSize={20}>
            <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--color-muted-foreground)' }} axisLine={false} tickLine={false} />
            <YAxis hide allowDecimals={false} />
            <Tooltip
              contentStyle={{ background: 'var(--color-card)', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: 12 }}
              cursor={{ fill: 'oklch(0.55 0.22 264 / 0.06)' }}
            />
            <Bar dataKey="count" name="Documents" fill="oklch(0.55 0.22 264)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Right column: donut + storage */}
      <div className="flex flex-col gap-4">
        {/* Category donut */}
        <div className="rounded-xl border border-border/40 bg-card p-5 flex-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">By folder</p>
          {categoryData.length > 0 ? (
            <ResponsiveContainer width="100%" height={100}>
              <PieChart>
                <Pie data={categoryData} cx="50%" cy="50%" innerRadius={28} outerRadius={44} paddingAngle={3} dataKey="value">
                  {categoryData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ background: 'var(--color-card)', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-4">No folders yet</p>
          )}
        </div>

        {/* Storage */}
        <div className="rounded-xl border border-border/40 bg-card p-5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Storage</p>
          <div className="space-y-2">
            <p className="text-2xl font-bold tracking-tight">{formatBytes(totalBytes)}</p>
            <p className="text-[11px] text-muted-foreground">
              across {docs.length} file{docs.length !== 1 ? 's' : ''}
              {docs.length > 0 && <> · {formatBytes(Math.round(totalBytes / docs.length))} avg</>}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
