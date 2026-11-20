import { PlusCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export interface FacetOption {
  value: string
  label: string
  count: number
}

/** A faceted filter: a dashed button that opens a menu of options with counts. Options in one facet combine with OR. */
export function FacetFilter({ label, options, selected, onChange }: {
  label: string
  options: FacetOption[]
  selected: ReadonlySet<string>
  onChange: (next: Set<string>) => void
}) {
  const count = selected.size
  const name = 'Filter by ' + label.toLowerCase() + (count ? ', ' + count + ' selected' : '')
  const toggle = (value: string, on: boolean) => {
    const next = new Set(selected)
    if (on) next.add(value)
    else next.delete(value)
    onChange(next)
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" aria-label={name} className="h-10 border-dashed px-3">
          <PlusCircle size={15} aria-hidden="true" />
          {label}
          {count > 0 && <>
            <span aria-hidden="true" className="mx-0.5 h-4 w-px bg-border" />
            <span aria-hidden="true" className="rounded-sm bg-muted px-1.5 text-xs font-medium tabular-nums">{count}</span>
          </>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-52">
        {options.filter(option => option.count > 0).map(option => (
          <DropdownMenuCheckboxItem
            key={option.value}
            checked={selected.has(option.value)}
            onCheckedChange={on => toggle(option.value, on === true)}
            onSelect={event => event.preventDefault()}
          >
            {option.label}
            <span className="ml-auto pl-4 text-xs tabular-nums text-muted-foreground">{option.count}</span>
          </DropdownMenuCheckboxItem>
        ))}
        {count > 0 && <>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => onChange(new Set())}>Clear filter</DropdownMenuItem>
        </>}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
