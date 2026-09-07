// Display formatting only — no scoring or week math (that's src/engine/).

export function initials(fullName) {
  if (!fullName) return '?'
  const parts = fullName.trim().split(/\s+/)
  const first = parts[0]?.[0] ?? ''
  const last = parts.length > 1 ? parts[parts.length - 1][0] : ''
  return (first + last).toUpperCase() || '?'
}

// < 24h → HH:MM:SS ticking urgency; otherwise "3d 14h".
export function fmtCountdown(msRemaining) {
  const ms = Math.max(0, msRemaining)
  const totalSec = Math.floor(ms / 1000)
  const days = Math.floor(totalSec / 86400)
  const hours = Math.floor((totalSec % 86400) / 3600)
  if (days >= 1) return `${days}d ${hours}h`
  const mins = Math.floor((totalSec % 3600) / 60)
  const secs = totalSec % 60
  const pad = n => String(n).padStart(2, '0')
  return `${pad(hours)}:${pad(mins)}:${pad(secs)}`
}

export function fmtDateShort(isoDate) {
  const d = new Date(`${isoDate}T00:00:00`)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

const AVATAR_COLORS = ['#4A7FB8', '#6B9BC9', '#8FB3D9', '#D9B96B', '#7CC08B', '#B08FD9']

export function avatarColor(key) {
  let h = 0
  for (const ch of String(key)) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}
