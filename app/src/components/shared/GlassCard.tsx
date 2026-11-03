import type { MouseEventHandler, ReactNode } from 'react'

interface GlassCardProps {
  children: ReactNode
  variant?: 'base' | 'vibrant' | 'subtle'
  className?: string
  onClick?: MouseEventHandler<HTMLDivElement>
}

const variantClasses = {
  base: 'ios-glass',
  vibrant: 'ios-glass-vibrant',
  subtle: 'ios-glass-subtle',
} as const

export function GlassCard({
  children,
  variant = 'base',
  className = '',
  onClick,
}: GlassCardProps) {
  return (
    <div className={`${variantClasses[variant]} ${className}`.trim()} onClick={onClick}>
      {children}
    </div>
  )
}

export default GlassCard
