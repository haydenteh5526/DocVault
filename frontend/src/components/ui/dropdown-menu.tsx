import * as React from 'react'
import * as Menu from '@radix-ui/react-dropdown-menu'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

export const DropdownMenu = Menu.Root
export const DropdownMenuTrigger = Menu.Trigger
export const DropdownMenuPortal = Menu.Portal

const item = 'relative flex min-h-9 cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50'

export const DropdownMenuContent = React.forwardRef<
  React.ComponentRef<typeof Menu.Content>,
  React.ComponentPropsWithoutRef<typeof Menu.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <Menu.Portal>
    <Menu.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn('z-50 min-w-40 overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md', className)}
      {...props}
    />
  </Menu.Portal>
))
DropdownMenuContent.displayName = 'DropdownMenuContent'

export const DropdownMenuItem = React.forwardRef<
  React.ComponentRef<typeof Menu.Item>,
  React.ComponentPropsWithoutRef<typeof Menu.Item>
>(({ className, ...props }, ref) => <Menu.Item ref={ref} className={cn(item, className)} {...props} />)
DropdownMenuItem.displayName = 'DropdownMenuItem'

export const DropdownMenuCheckboxItem = React.forwardRef<
  React.ComponentRef<typeof Menu.CheckboxItem>,
  React.ComponentPropsWithoutRef<typeof Menu.CheckboxItem>
>(({ className, children, ...props }, ref) => (
  <Menu.CheckboxItem ref={ref} className={cn(item, 'pl-8', className)} {...props}>
    <span className="absolute left-2 flex size-4 items-center justify-center">
      <Menu.ItemIndicator><Check size={14} aria-hidden="true" /></Menu.ItemIndicator>
    </span>
    {children}
  </Menu.CheckboxItem>
))
DropdownMenuCheckboxItem.displayName = 'DropdownMenuCheckboxItem'

export const DropdownMenuSeparator = React.forwardRef<
  React.ComponentRef<typeof Menu.Separator>,
  React.ComponentPropsWithoutRef<typeof Menu.Separator>
>(({ className, ...props }, ref) => <Menu.Separator ref={ref} className={cn('-mx-1 my-1 h-px bg-border', className)} {...props} />)
DropdownMenuSeparator.displayName = 'DropdownMenuSeparator'
