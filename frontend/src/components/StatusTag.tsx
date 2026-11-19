import type { ReactNode } from 'react'
import { Badge } from './ui/badge'
const tones = { neutral: 'secondary', attention: 'attention', positive: 'success', caution: 'attention', danger: 'destructive' } as const
export function StatusTag({ tone, children }: {tone: keyof typeof tones; children: ReactNode}) {
  return <Badge variant={tones[tone]}>{children}</Badge>
}
