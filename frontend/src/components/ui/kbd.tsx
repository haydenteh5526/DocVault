import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

export function Kbd({ className, ...props }: ComponentProps<'kbd'>) {
  return <kbd className={cn('rounded border bg-muted px-1.5 text-xs text-muted-foreground', className)} {...props} />
}
