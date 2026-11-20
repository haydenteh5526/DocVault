import { useRef } from 'react'
import { MoreHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useTransitionNavigate } from '@/lib/useTransitionNavigate'
import type { Document } from '@/lib/api'

/** The one menu on a document row or card: Open, Preview, Rename, Star and Delete. */
export function DocumentRowMenu({ doc, onPreview, onRename, onToggleFavourite, onDelete }: {
  doc: Document
  onPreview: () => void
  onRename: () => void
  onToggleFavourite: () => void
  onDelete: () => void
}) {
  const goTo = useTransitionNavigate()
  // Rename moves focus into the title field. The menu traps focus while it closes and would take it back to its button,
  // so the field is focused once the menu has gone. Every other choice leaves focus on the button, where the keyboard was.
  const renaming = useRef(false)
  const rename = () => {
    renaming.current = true
    onRename()
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="pointer-coarse:size-11" aria-label={'Actions for ' + doc.title}>
          <MoreHorizontal size={18} aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        onCloseAutoFocus={event => {
          if (!renaming.current) return
          renaming.current = false
          event.preventDefault()
          requestAnimationFrame(() => document.getElementById('rename-' + doc.id)?.focus())
        }}
      >
        <DropdownMenuItem onSelect={() => goTo('/app/documents/' + doc.id)}>Open</DropdownMenuItem>
        <DropdownMenuItem onSelect={onPreview}>Preview</DropdownMenuItem>
        <DropdownMenuItem onSelect={rename}>Rename</DropdownMenuItem>
        <DropdownMenuItem onSelect={onToggleFavourite}>{doc.is_favourite ? 'Remove star' : 'Star'}</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={onDelete}>Delete</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
