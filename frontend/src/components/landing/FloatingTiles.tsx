import { BookOpen, FileText, Receipt, ShieldCheck, ShoppingBag, type LucideIcon } from 'lucide-react'
import { DocBotMark } from '@/components/DocBotMark'
import { useReducedMotion } from '@/lib/useReducedMotion'

const tiles: { name: string; icon?: LucideIcon; tilt: number }[] = [
  { name: 'receipt', icon: Receipt, tilt: -8 },
  { name: 'file', icon: FileText, tilt: 6 },
  { name: 'docbot', tilt: -4 },
  { name: 'manual', icon: BookOpen, tilt: 9 },
  { name: 'warranty', icon: ShieldCheck, tilt: -6 },
  { name: 'shopping', icon: ShoppingBag, tilt: 5 },
]

/** Six tilted tiles around the hero. Decoration only: hidden from assistive technology and below 640 px. */
export function FloatingTiles() {
  const reduced = useReducedMotion()
  return (
    <div className="floating-tiles" aria-hidden="true">
      {tiles.map(({ name, icon: Icon, tilt }, index) => (
        <span
          key={name}
          className={`float-tile float-tile-${name}`}
          style={{ transform: `rotate(${tilt}deg)` }}
        >
          <span className={reduced ? undefined : 'docbot-drift'} style={{ animationDelay: `${-index * 1.3}s` }}>
            {Icon ? <Icon size={24} strokeWidth={1.75} /> : <DocBotMark size={30} />}
          </span>
        </span>
      ))}
    </div>
  )
}
