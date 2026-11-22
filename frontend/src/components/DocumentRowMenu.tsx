import { useRef, useState } from 'react'
import { MoreHorizontal } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useTransitionNavigate } from '@/lib/useTransitionNavigate'
import { refreshDocumentDetails, type Document } from '@/lib/api'
import { useToast } from '@/components/Toast'

/** The one menu on a document row or card: Open, Preview, Rename, Star, Read details again and Delete. */
export function DocumentRowMenu({ doc, onPreview, onRename, onToggleFavourite, onDelete }: {
  doc: Document
  onPreview: () => void
  onRename: () => void
  onToggleFavourite: () => void
  onDelete: () => void
}) {
  const goTo = useTransitionNavigate()
  const queryClient = useQueryClient()
  const { toast } = useToast()
  // One read at a time: a second choice while the first is in flight would only spend another model call.
  const [reading, setReading] = useState(false)
  const readAgain = async () => {
    if (reading) return
    setReading(true)
    try {
      await refreshDocumentDetails(doc.id)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['documents'] }),
        queryClient.invalidateQueries({ queryKey: ['document', doc.id] }),
        queryClient.invalidateQueries({ queryKey: ['document-list-status'] }),
        queryClient.invalidateQueries({ queryKey: ['warranties'] }),
      ])
      toast('Details updated.')
    } catch {
      toast('Could not read the details again. Try again.', 'error')
    } finally {
      setReading(false)
    }
  }
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
        {doc.processing_status === 'complete' && (
          <DropdownMenuItem disabled={reading} onSelect={() => void readAgain()}>
            {reading ? 'Reading details…' : 'Read details again'}
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={onDelete}>Delete</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
