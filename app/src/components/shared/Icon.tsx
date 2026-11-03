interface IconProps {
  name: string
  className?: string
  filled?: boolean
  size?: number
}

export function Icon({ name, className = '', filled = false, size }: IconProps) {
  return (
    <span
      aria-hidden="true"
      className={`material-symbols-rounded ${className}`}
      style={{
        fontVariationSettings: `'FILL' ${filled ? 1 : 0}`,
        ...(size === undefined ? {} : { fontSize: size }),
      }}
    >
      {name}
    </span>
  )
}

export default Icon
