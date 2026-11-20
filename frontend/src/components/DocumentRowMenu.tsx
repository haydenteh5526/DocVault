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
  // Rename and Preview put focus somewhere else (a field, a dialog), so the menu must not pull it back to its button.
  const handOff = useRef(false)
  const handOffTo = (action: () => void) => () => {
    handOff.current = true
    action()
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
          if (handOff.current) event.preventDefault()
          handOff.current = false
        }}
      >
        <DropdownMenuItem onSelect={() => goTo('/app/documents/' + doc.id)}>Open</DropdownMenuItem>
        <DropdownMenuItem onSelect={handOffTo(onPreview)}>Preview</DropdownMenuItem>
        <DropdownMenuItem onSelect={handOffTo(onRename)}>Rename</DropdownMenuItem>
        <DropdownMenuItem onSelect={onToggleFavourite}>{doc.is_favourite ? 'Remove star' : 'Star'}</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={onDelete}>Delete</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
