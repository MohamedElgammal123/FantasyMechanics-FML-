import { useEffect, useState } from 'react'
import { useStudentSection } from './StudentShell'
import { fetchActivityTypes, fetchClaimRules, fetchMyClaims, submitClaim } from '../lib/studentData'
import { fmtDateShort } from '../lib/format'
import { ErrorBlock, LoadingBlock } from '../components/DataStates'
import ClaimSubmitForm from '../components/ClaimSubmitForm'

const STATUS_COLOR = {
  pending: 'var(--steel-light)',
  approved: 'var(--success)',
  rejected: 'var(--danger)',
}

export default function ClaimsHistory() {
  const { profile, sectionId, section, term } = useStudentSection()
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    setData(null)
    setError(null)
    Promise.all([fetchMyClaims(sectionId, profile.id, 100), fetchActivityTypes(), fetchClaimRules(sectionId)])
      .then(([claims, types, claimRules]) => !cancelled && setData({
        claims,
        types,
        claimRules,
        labels: new Map(types.map(t => [t.id, t.label])),
      }))
      .catch(e => !cancelled && setError(e))
    return () => { cancelled = true }
  }, [sectionId, profile.id, attempt])

  async function handleSubmit(activityTypeId, lectureDate, description) {
    const claim = await submitClaim(sectionId, activityTypeId, lectureDate, description)
    setData(d => ({ ...d, claims: [claim, ...d.claims] }))
    return claim
  }

  if (error) {
    return (
      <div style={{ padding: 32 }}>
        <ErrorBlock message="Couldn't load your claims." onRetry={() => setAttempt(a => a + 1)} />
      </div>
    )
  }
  if (!data) {
    return (
      <div style={{ padding: '32px 120px' }}>
        <LoadingBlock height={240} label="loading claims…" />
      </div>
    )
  }

  return (
    <div style={{ padding: '32px 120px 48px', maxWidth: 1440, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 52, color: 'var(--cream)', letterSpacing: 1 }}>
          YOUR CLAIMS
        </div>
      </div>
      <div style={{ fontSize: 14, color: 'var(--text-dim)', marginBottom: 24 }}>
        WuClap &amp; game points post automatically — claims are for in-class activities only.
      </div>

      <ClaimSubmitForm
        term={term}
        weeklyClaimCap={section.weekly_claim_cap}
        claimTypes={data.types.filter(t => t.scoring === 'claim')}
        claimRules={data.claimRules}
        existingClaims={data.claims}
        onSubmit={handleSubmit}
      />

      {data.claims.length === 0 ? (
        <div
          style={{
            background: 'var(--navy-card)',
            border: '1px solid var(--border-steel)',
            borderRadius: 'var(--radius-md)',
            padding: '64px 28px',
            textAlign: 'center',
          }}
        >
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 30, color: 'var(--text-muted)', marginBottom: 6 }}>
            NO CLAIMS YET
          </div>
          <div style={{ fontSize: 14, color: 'var(--text-dim)' }}>
            Raise your hand in lecture — discussions, corrections, demos and act-as-professor all earn points.
          </div>
        </div>
      ) : (
        <div
          style={{
            background: 'var(--navy-card)',
            border: '1px solid var(--border-steel)',
            borderRadius: 'var(--radius-md)',
            overflow: 'hidden',
          }}
        >
          {data.claims.map((c, i) => (
            <div
              key={c.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 16,
                padding: '12px 24px',
                borderTop: i > 0 ? '1px solid rgba(107,155,201,.15)' : 'none',
              }}
            >
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-dim)', width: 70, flex: 'none' }}>
                {fmtDateShort(c.lecture_date)}
              </span>
              <span style={{ fontSize: 15, color: 'var(--text-body)', flex: 1 }}>
                <span style={{ color: 'var(--steel-light)' }}>{data.labels.get(c.activity_type_id) ?? c.activity_type_id}</span>
                {' — '}{c.description}
              </span>
              {c.status === 'approved' && c.awarded_points != null && c.awarded_points !== c.computed_points && (
                <span style={{ fontSize: 12, color: 'var(--warning)' }}>instructor adjusted</span>
              )}
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--cream)' }}>
                +{c.awarded_points ?? c.computed_points}
              </span>
              <span
                style={{
                  fontFamily: 'var(--font-ui)',
                  fontSize: 13,
                  letterSpacing: 2,
                  padding: '3px 12px',
                  borderRadius: 'var(--radius-pill)',
                  color: STATUS_COLOR[c.status],
                  border: `1px solid ${STATUS_COLOR[c.status]}`,
                }}
              >
                {c.status.toUpperCase()}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
