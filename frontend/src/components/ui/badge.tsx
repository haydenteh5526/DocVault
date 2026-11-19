import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'
const styles = {
  default: 'bg-primary text-primary-foreground', secondary: 'bg-secondary text-secondary-foreground',
  outline: 'border border-input', destructive: 'text-destructive border border-destructive',
  attention: 'bg-attention-wash text-attention', success: 'bg-muted text-success',
}
export function Badge({ variant = 'default', className, ...props }: ComponentProps<'span'> & { variant?: keyof typeof styles }) {
  return <span className={cn('inline-flex items-center rounded-md px-2 py-0.5 text-[13px] font-medium', styles[variant], className)} {...props} />
}
