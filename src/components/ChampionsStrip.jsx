import { fmtCountdown } from '../lib/format'
import { useNow } from '../lib/useNow'

// Bi-Weekly Champions strip (screen 1b). One tile per cycle:
//  · finalized  → champion name(s); co-champions share the crown
//  · current    → countdown + "you're #N this cycle"
//  · future     → dimmed upcoming tile
// cycles: rows with cycle_champions(…profiles(full_name)) nested;
// currentCycleNumber/currentCycleEndsAt/myCycleRank come from the screen
// (engine-derived). cycles empty → strip hidden by the caller.
export default function ChampionsStrip({
  cycles,
  sectionCode,
  currentCycleNumber,
  currentCycleEndsAt,
  myCycleRank,
}) {
  const now = useNow(60000)

  return (
    <div
      style={{
        background: 'var(--navy-card)',
        border: '1px solid var(--border-steel)',
        borderRadius: 'var(--radius-md)',
        padding: '20px 28px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
        <div style={{ fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 19, letterSpacing: 2, color: 'var(--cream)' }}>
          BI-WEEKLY CHAMPIONS
        </div>
        <div style={{ fontFamily: 'var(--font-ui)', fontSize: 14, letterSpacing: 2, color: 'var(--text-dim)' }}>
          NEW CHAMPION CROWNED EVERY 2 WEEKS · SECTION {sectionCode}
        </div>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${Math.min(cycles.length, 6)}, 1fr)`,
          gap: 12,
        }}
      >
        {cycles.map(cy => {
          const isCurrent = cy.number === currentCycleNumber
          const finalized = Boolean(cy.finalized_at)
          const champions = cy.cycle_champions ?? []
          const isFuture = !finalized && !isCurrent

          const border = isCurrent ? 'var(--steel)' : 'var(--border-steel)'
          const bg = isCurrent ? 'rgba(74, 127, 184, .18)' : 'var(--navy-panel)'

          return (
            <div
              key={cy.id}
              style={{
                borderRadius: 8,
                padding: '14px 16px',
                background: bg,
                border: `1px solid ${border}`,
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                opacity: isFuture ? 0.55 : 1,
              }}
            >
              <div
                style={{
                  fontFamily: 'var(--font-ui)',
                  fontSize: 13,
                  letterSpacing: 2,
                  color: isCurrent ? 'var(--steel-light)' : 'var(--text-dim)',
                }}
              >
                CYCLE {cy.number} · WK {cy.week_start}–{cy.week_end}
                {isCurrent && ' · IN PLAY'}
              </div>

              {finalized ? (
                champions.length > 0 ? (
                  <>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: 'var(--cream)', lineHeight: 1.1 }}>
                      ♛ {champions.map(c => c.profiles?.full_name ?? '—').join(' & ').toUpperCase()}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                      {champions[0].points} pts{champions.length > 1 ? ' · co-champions' : ''}
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: 'var(--text-dim)', lineHeight: 1.1 }}>
                      NO CHAMPION
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>no points scored</div>
                  </>
                )
              ) : isCurrent ? (
                <>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: 'var(--cream)', lineHeight: 1.1 }}>
                    ENDS IN{' '}
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 16 }}>
                      {fmtCountdown(currentCycleEndsAt - now)}
                    </span>
                  </div>
                  <div style={{ fontSize: 13, color: myCycleRank ? 'var(--success)' : 'var(--text-muted)' }}>
                    {myCycleRank ? `you're #${myCycleRank} this cycle` : 'score to enter this cycle'}
                  </div>
                </>
              ) : (
                <>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: 'var(--text-muted)', lineHeight: 1.1 }}>
                    UPCOMING
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>crown up for grabs</div>
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
