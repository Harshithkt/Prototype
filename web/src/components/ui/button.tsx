import type { ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost'
  size?: 'sm' | 'md'
}

export const buttonClass = ({ variant = 'secondary', size = 'md' }: Pick<Props, 'variant' | 'size'>) =>
  cn(
    'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg font-medium transition-colors',
    'disabled:pointer-events-none disabled:opacity-45 [&_svg]:size-4 [&_svg]:shrink-0',
    size === 'md' ? 'h-9 px-3.5 text-[13.5px]' : 'h-7.5 px-2.5 text-[12.5px]',
    variant === 'primary' && 'bg-primary text-primary-ink hover:opacity-85',
    variant === 'secondary' &&
      'border border-line-2 bg-surface text-ink shadow-card hover:bg-surface-2',
    variant === 'ghost' && 'text-ink-2 hover:bg-surface-2 hover:text-ink',
  )

export function Button({ variant, size, className, type = 'button', ...props }: Props) {
  return <button type={type} className={cn(buttonClass({ variant, size }), className)} {...props} />
}
