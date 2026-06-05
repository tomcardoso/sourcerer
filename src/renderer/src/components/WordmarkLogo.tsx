// WordmarkLogo.tsx
// Drop-in replacement — same props as the previous version.
// Renders the Sourcerer newsprint wordmark (full) or dock/taskbar icon (compact).
//
// Usage:
//   <WordmarkLogo size={28} />            sidebar
//   <WordmarkLogo size={48} />            setup / unlock / splash
//   <WordmarkLogo compact size={64} />    app icon / dock / taskbar

const INK   = '#1a1815'
const PAPER = '#faf9f5'
const AMBER = '#e8a840'
const FONT  = "Spectral, Georgia, 'Times New Roman', serif"

// 4-point star, 18×18 bounding box.
// Fleuron top edge aligns with Spectral 700 cap height at fontSize 56.
const FLEURON_LG = 'M 9 0 L 10.8 7.2 L 18 9 L 10.8 10.8 L 9 18 L 7.2 10.8 L 0 9 L 7.2 7.2 Z'

// Smaller star for the compact icon, 10×10 bounding box.
const FLEURON_SM = 'M 5 0 L 6 4 L 10 5 L 6 6 L 5 10 L 4 6 L 0 5 L 4 4 Z'

// Full wordmark coordinate space.
const VB_W = 270
const VB_H = 64

interface Props {
  compact?: boolean
  size?: number
  className?: string
}

export function WordmarkLogo({ compact = false, size, className }: Props) {
  // ── Compact: ink square icon (dock / taskbar / app icon) ──────────────────
  if (compact) {
    const dim = size ?? 64
    return (
      <svg
        width={dim}
        height={dim}
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        role="img"
        aria-label="Sourcerer"
      >
        <rect width="64" height="64" rx="13" fill={INK} />
        <text
          x="30"
          y="46"
          textAnchor="middle"
          fontFamily={FONT}
          fontWeight="700"
          fontSize="46"
          letterSpacing="-1"
          fill={PAPER}
        >
          S
        </text>
        <g transform="translate(44, 10)" fill={AMBER}>
          <path d={FLEURON_SM} />
        </g>
      </svg>
    )
  }

  // ── Full wordmark ─────────────────────────────────────────────────────────
  // Thick rule above + text + inline fleuron + thin rule below.
  // Rules are suppressed below size 24 (sub-pixel at that scale).
  const h      = size ?? 36
  const w      = Math.round(h * (VB_W / VB_H))

  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="Sourcerer"
    >

      {/* Wordmark text */}
      <text
        x="0"
        y="56"
        fontFamily={FONT}
        fontWeight="700"
        fontSize="56"
        letterSpacing="-1"
        fill="currentColor"
      >
        Sourcerer
      </text>

      {/* Amber fleuron — top edge aligned to Spectral 700 cap height */}
      <g transform="translate(250, 17)" fill={AMBER}>
        <path d={FLEURON_LG} />
      </g>

    </svg>
  )
}
