import { initials, avatarColor } from '../lib/format'

export default function InitialsAvatar({ name, id, size = 34 }) {
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: avatarColor(id ?? name),
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'var(--font-ui)',
        fontWeight: 700,
        fontSize: Math.round(size * 0.38),
        color: 'var(--navy-panel)',
        flex: 'none',
      }}
    >
      {initials(name)}
    </span>
  )
}
