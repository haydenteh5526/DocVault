import { useEffect, useRef, type CSSProperties } from 'react'
import { BookOpen, FileText, Receipt, ShieldCheck, ShoppingBag, type LucideIcon } from 'lucide-react'
import { DocBotMark } from '@/components/DocBotMark'
import { useReducedMotion } from '@/lib/useReducedMotion'

/**
 * Three mirrored pairs, laid out as on t3.codes: x from the hero's centre, y from its top, s the tile size. The lower
 * pair sits at 370 px (t3: 440 px) so it stays beside the buttons of this shorter hero.
 * depth scales how far a tile follows the cursor; fx/fy is where it flies in from; d its entrance delay.
 */
type Tile = { name: string; icon?: LucideIcon; color?: string; x: string; y: string; s: number; rot: number; depth: number; d: number; fx: number; fy: number }
const tiles: Tile[] = [
  { name: 'docbot', x: 'max(-300px, -19vw)', y: '20px', s: 64, rot: 6, depth: 0.6, d: 0.62, fx: -40, fy: -80 },
  { name: 'shopping', icon: ShoppingBag, color: '#F472B6', x: 'min(300px, 19vw)', y: '20px', s: 64, rot: -5, depth: 0.6, d: 0.58, fx: 40, fy: -80 },
  { name: 'receipt', icon: Receipt, color: '#8FD19B', x: 'max(-560px, -38vw)', y: '128px', s: 96, rot: -8, depth: 1.2, d: 0.38, fx: -160, fy: -40 },
  { name: 'manual', icon: BookOpen, color: '#F0A55B', x: 'min(560px, 38vw)', y: '128px', s: 96, rot: 7, depth: 1.2, d: 0.46, fx: 160, fy: -40 },
  { name: 'file', icon: FileText, color: '#7AA7FF', x: 'max(-440px, -30vw)', y: '370px', s: 80, rot: 4, depth: 0.9, d: 0.54, fx: -120, fy: 80 },
  { name: 'warranty', icon: ShieldCheck, color: '#5EEAD4', x: 'min(440px, 30vw)', y: '370px', s: 80, rot: -5, depth: 0.9, d: 0.7, fx: 120, fy: 80 },
]

/** Furthest the tiles shift, in pixels, when the cursor reaches an edge of the hero. */
const SHIFT_X = 36
const SHIFT_Y = 28

/**
 * Follows the cursor across the parent element by setting --px and --py on the tiles' container.
 * Only for a fine pointer with motion allowed; resets when the cursor leaves.
 */
function useCursorParallax(reduced: boolean) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const field = ref.current
    const hero = field?.parentElement
    if (!field || !hero || reduced) return
    const fine = window.matchMedia?.('(pointer: fine)')
    let frame: number | undefined
    let point: { x: number; y: number } | null = null
    const reset = () => {
      if (frame !== undefined) cancelAnimationFrame(frame)
      frame = undefined
      point = null
      field.style.setProperty('--px', '0px')
      field.style.setProperty('--py', '0px')
    }
    const move = (event: PointerEvent) => {
      // Only a mouse moves the tiles: touch and pen are ignored even on a device with a fine pointer.
      if (!fine?.matches || (event.pointerType && event.pointerType !== 'mouse')) return
      point = { x: event.clientX, y: event.clientY }
      frame ??= requestAnimationFrame(() => {
        frame = undefined
        if (!point) return
        const box = hero.getBoundingClientRect()
        if (!box.width || !box.height) return
        field.style.setProperty('--px', `${(((point.x - box.left) / box.width - 0.5) * SHIFT_X).toFixed(1)}px`)
        field.style.setProperty('--py', `${(((point.y - box.top) / box.height - 0.5) * SHIFT_Y).toFixed(1)}px`)
      })
    }
    hero.addEventListener('pointermove', move)
    hero.addEventListener('pointerleave', reset)
    return () => {
      hero.removeEventListener('pointermove', move)
      hero.removeEventListener('pointerleave', reset)
      reset()
    }
  }, [reduced])
  return ref
}

/** Six tilted, coloured tiles around the hero that fly in on load and follow the cursor. Decoration only: hidden from assistive technology, thinned out up to 1100 px and hidden below 900 px. */
export function FloatingTiles() {
  const reduced = useReducedMotion()
  const ref = useCursorParallax(reduced)
  return (
    <div ref={ref} className="floating-tiles" aria-hidden="true">
      {tiles.map(({ name, icon: Icon, color, x, y, s, rot, depth, d, fx, fy }) => (
        <span
          key={name}
          className={`float-mark float-mark-${name}`}
          style={{ '--x': x, '--y': y, '--s': `${s}px`, '--depth': depth } as CSSProperties}
        >
          <span
            className="float-tile"
            style={{ '--rot': `${rot}deg`, '--d': `${d}s`, '--fx': `${fx}px`, '--fy': `${fy}px`, '--tile-color': color } as CSSProperties}
          >
            {Icon ? <Icon strokeWidth={1.75} /> : <DocBotMark size={s * 0.56} />}
          </span>
        </span>
      ))}
    </div>
  )
}
