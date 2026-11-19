import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ShieldCheck, AlertTriangle, Calendar, CheckCircle2, ChevronRight, CalendarPlus } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { QueryError } from '@/components/QueryError'
import { formatBillDate } from '@/components/BillReview'
import { getWarranties } from '@/lib/api'
import { warrantyState, daysUntil } from '@/lib/format'
import { downloadICS } from '@/lib/ics'

export default function Warranties() {
  const { data: warranties = [], isLoading: loading, isError, refetch } = useQuery({
    queryKey: ['warranties'],
    queryFn: getWarranties,
  })

  function statusFor(expiry: string | null): { label: string; color: string; icon: React.ReactNode; bg: string } {
    const state = warrantyState(expiry)
    if (state === 'none') return { label: 'No expiry set', color: 'text-muted-foreground', bg: 'bg-muted/50 border-border/50', icon: <Calendar size={13} /> }
    const days = daysUntil(expiry) ?? 0
    if (state === 'expired') return { label: 'Expired', color: 'text-destructive', bg: 'bg-destructive/10 border-destructive/20', icon: <AlertTriangle size={13} /> }
    if (state === 'expiring') return { label: `Expires in ${days} days`, color: 'text-attention', bg: 'bg-amber-50 border-amber-200/60 dark:bg-amber-950/30 dark:border-amber-900/40', icon: <AlertTriangle size={13} /> }
    return { label: `Active (${days}d)`, color: 'text-success', bg: 'bg-emerald-50 border-emerald-200/60 dark:bg-emerald-950/30 dark:border-emerald-900/40', icon: <CheckCircle2 size={13} /> }
  }

  return (
    <div className="p-4 sm:p-8 max-w-4xl mx-auto h-full overflow-y-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shadow-lg shadow-amber-500/20">
            <ShieldCheck className="h-5 w-5 text-white" />
          </div>
          <h2 className="text-2xl font-semibold tracking-tight text-foreground/90">Warranties</h2>
          {warranties.some(w => w.expiry_date) && (
            <Button
              variant="outline"
              size="sm"
              className="ml-auto h-8 text-xs gap-1.5 rounded-full"
              onClick={() => downloadICS(
                'docvault-warranties.ics',
                warranties
                  .filter(w => w.expiry_date)
                  .map(w => ({ id: w.id, title: w.document_title, expiry: w.expiry_date!, notes: w.notes })),
              )}
            >
              <CalendarPlus size={14} /> Add all to calendar
            </Button>
          )}
        </div>
        <p className="text-muted-foreground text-sm mt-1.5 font-medium ml-13">Track warranty expiry across your documents automatically.</p>
      </div>

      {isError ? (
        <QueryError message="Couldn't load your warranties." onRetry={() => refetch()} />
      ) : loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="animate-pulse border-border/40">
              <CardContent className="h-20" />
            </Card>
          ))}
        </div>
      ) : warranties.length === 0 ? (
        <div className="" style={{ animationDelay: '100ms', animationFillMode: 'both' }}>
          <Card className="border-dashed border-2 border-border/50 bg-transparent shadow-none">
            <CardContent className="flex flex-col items-center justify-center py-24 text-center">
              <h3 className="font-bold text-xl tracking-tight text-foreground">No warranties tracked</h3>
              <p className="text-sm text-muted-foreground mt-2 max-w-sm leading-relaxed">
                Upload a receipt or warranty card and our AI will automatically detect and track the expiry dates for you.
              </p>
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="grid gap-3">
          {warranties.map((w, i) => {
            const status = statusFor(w.expiry_date)
            return (
              <Card 
                key={w.id} 
                className="rounded-none border-0 border-b shadow-none"
                style={{ animationDelay: `${i * 50}ms`, animationFillMode: 'both' }} 
              >

                
                <CardContent className="flex flex-wrap items-center gap-3 p-3">
                  <div className={`w-12 h-12 rounded-xl border flex items-center justify-center shrink-0 transition-colors ${status.bg} ${status.color}`}>
                    <ShieldCheck size={20} />
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <Link to={'/app/documents/' + w.document_id} className="block truncate font-semibold hover:underline">{w.document_title}</Link>
                    <div className="flex items-center gap-2 mt-1">
                      <p className="text-sm text-muted-foreground">
                        {w.expiry_date ? `Expires ${formatBillDate(w.expiry_date)}` : 'No expiry date detected'}
                      </p>
                      {w.notes && (
                        <>
                          <span className="w-1 h-1 rounded-full bg-border" />
                          <p className="text-xs text-muted-foreground truncate">{w.notes}</p>
                        </>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4 shrink-0">
                    {w.expiry_date && (
                      <button
                        onClick={(e) => { e.stopPropagation(); downloadICS(`warranty-${w.document_title}.ics`, [{ id: w.id, title: w.document_title, expiry: w.expiry_date!, notes: w.notes }]) }}
                        className="p-2 rounded-lg text-muted-foreground hover:text-attention hover:bg-amber-500/10 transition-colors"
                        aria-label="Add warranty expiry to calendar"
                        title="Add to calendar"
                      >
                        <CalendarPlus size={16} />
                      </button>
                    )}
                    <div className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold border ${status.bg} ${status.color}`}>
                      {status.icon} {status.label}
                    </div>
                    <ChevronRight size={18} className="text-muted-foreground group-hover:text-amber-500/60 transition-colors" />
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
