import { useEffect, useMemo, useState } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
  ScatterChart,
  Scatter,
  ZAxis,
  ResponsiveContainer,
} from 'recharts'
import { fetchSectionLedger, fetchActivityTypes } from '../lib/studentData'
import { getGradebookRows, getSectionTerm, listGradebookUploads } from '../lib/instructorData'
import {
  DEFAULT_ENGAGEMENT_TIER_THRESHOLDS,
  classifyEngagementTier,
  gradeDistributionByTier,
  gradeHistogram,
  pointsByActivityType,
  pointsVsGrade,
  studentCategoryTotals,
  weeklyParticipationByCategory,
} from '../engine/analytics'
import { LoadingBlock, ErrorBlock } from './DataStates'

const PIE_COLORS = ['var(--steel)', 'var(--steel-light)', 'var(--success)', 'var(--warning)', 'var(--danger)', 'var(--cream)']
const TIER_COLORS = { comprehensive: 'var(--success)', predominantly_large_scale: 'var(--steel-light)', minimal: 'var(--text-dim)' }
const TIER_LABELS = { comprehensive: 'Comprehensive', predominantly_large_scale: 'Predom. large-scale', minimal: 'Minimal' }

// Instructor analytics + gradebook report (P10, data model §9). All
// aggregation is computed on read via src/engine/analytics.js — this
// component only fetches, wires, and renders; it never sums points itself.
export default function AnalyticsDashboard({ sectionId, refreshKey }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [events, setEvents] = useState([])
  const [activityTypes, setActivityTypes] = useState([])
  const [term, setTerm] = useState(null)
  const [uploads, setUploads] = useState([])
  const [currentRows, setCurrentRows] = useState([])
  const [baselineRows, setBaselineRows] = useState([])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const [ledger, types, sectionTerm, gbUploads] = await Promise.all([
          fetchSectionLedger(sectionId),
          fetchActivityTypes(),
          getSectionTerm(sectionId),
          listGradebookUploads(sectionId),
        ])
        if (cancelled) return
        setEvents(ledger)
        setActivityTypes(types)
        setTerm(sectionTerm)
        setUploads(gbUploads)

        // Most recent upload of each kind — a re-upload supersedes the
        // previous one for analytics purposes (uploads are otherwise kept
        // as history, browsable in GradebookUploadHistory).
        const latestCurrent = gbUploads.find((u) => !u.is_baseline)
        const latestBaseline = gbUploads.find((u) => u.is_baseline)
        const [cur, base] = await Promise.all([
          latestCurrent ? getGradebookRows(latestCurrent.id) : Promise.resolve([]),
          latestBaseline ? getGradebookRows(latestBaseline.id) : Promise.resolve([]),
        ])
        if (cancelled) return
        setCurrentRows(cur)
        setBaselineRows(base)
      } catch (err) {
        if (!cancelled) setError(err.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [sectionId, refreshKey])

  const activityTypesById = useMemo(() => new Map(activityTypes.map((a) => [a.id, a])), [activityTypes])

  const weekly = useMemo(
    () => (term ? weeklyParticipationByCategory(events, activityTypesById, term.weeks_total) : []),
    [events, activityTypesById, term]
  )

  const pie = useMemo(() => pointsByActivityType(events, activityTypes), [events, activityTypes])
  const pieHasData = pie.some((p) => p.points > 0)

  const categoryTotals = useMemo(() => studentCategoryTotals(events, activityTypesById), [events, activityTypesById])

  const tierByStudent = useMemo(() => {
    const map = new Map()
    for (const [studentId, totals] of categoryTotals) {
      map.set(studentId, classifyEngagementTier(totals.individual, totals.large_scale))
    }
    return map
  }, [categoryTotals])

  const scatter = useMemo(() => pointsVsGrade(events, currentRows), [events, currentRows])
  const hasCurrentGradebook = uploads.some((u) => !u.is_baseline)
  const hasBaselineGradebook = uploads.some((u) => u.is_baseline)

  const gradedStudents = useMemo(
    () =>
      currentRows
        .filter((r) => r.student_id != null && r.final_grade != null)
        .map((r) => {
          const totals = categoryTotals.get(r.student_id) ?? { individual: 0, large_scale: 0 }
          return { grade: r.final_grade, tier: classifyEngagementTier(totals.individual, totals.large_scale) }
        }),
    [currentRows, categoryTotals]
  )
  const tierDistribution = useMemo(() => gradeDistributionByTier(gradedStudents), [gradedStudents])

  const beforeAfter = useMemo(() => {
    const currentGrades = currentRows.filter((r) => r.final_grade != null).map((r) => r.final_grade)
    const baselineGrades = baselineRows.filter((r) => r.final_grade != null).map((r) => r.final_grade)
    const currentHist = gradeHistogram(currentGrades)
    const baselineHist = gradeHistogram(baselineGrades)
    return currentHist.map((bin, i) => ({ label: bin.label, current: bin.count, baseline: baselineHist[i].count }))
  }, [currentRows, baselineRows])

  if (loading) return <LoadingBlock label="loading analytics…" height={200} />
  if (error) return <ErrorBlock message={error} />

  return (
    <div className="fml-report" style={{ display: 'flex', flexDirection: 'column', gap: 24, width: '100%' }}>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .fml-report, .fml-report * { visibility: visible; }
          .fml-report { position: absolute; left: 0; top: 0; width: 100%; }
          .fml-report .no-print { display: none; }
        }
      `}</style>

      <div className="no-print" style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={() => window.print()} style={printButtonStyle}>
          Print / export report
        </button>
      </div>

      <ChartCard title="Weekly participation — individual vs. large-scale">
        {events.length === 0 ? (
          <EmptyChart message="No point events yet — participation bars will appear once activities are posted." />
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={weekly}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-steel)" />
              <XAxis dataKey="week" tickFormatter={(w) => `W${w}`} stroke="var(--text-dim)" fontSize={12} />
              <YAxis stroke="var(--text-dim)" fontSize={12} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} labelFormatter={(w) => `Week ${w}`} />
              <Legend wrapperStyle={{ fontSize: 12, color: 'var(--text-dim)' }} />
              <Bar dataKey="individual" name="Individual" fill="var(--steel-light)" />
              <Bar dataKey="large_scale" name="Large-scale" fill="var(--warning)" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      <ChartCard title="Contributions by activity type">
        {!pieHasData ? (
          <EmptyChart message="No points awarded yet — the contributions pie will appear once activities are posted." />
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={pie} dataKey="points" nameKey="label" cx="50%" cy="50%" outerRadius={90} label={(d) => d.label}>
                {pie.map((entry, i) => (
                  <Cell key={entry.id} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 12, color: 'var(--text-dim)' }} />
            </PieChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      <ChartCard title="FML points vs. final grade" subtitle={scatter.r != null ? `Pearson r = ${scatter.r.toFixed(3)}` : null}>
        {!hasCurrentGradebook ? (
          <EmptyChart message="Upload a gradebook to see the points-vs-grade correlation." />
        ) : scatter.pairs.length === 0 ? (
          <EmptyChart message="No gradebook rows are both matched to a student and graded yet." />
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <ScatterChart>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-steel)" />
              <XAxis type="number" dataKey="points" name="FML points" stroke="var(--text-dim)" fontSize={12} />
              <YAxis type="number" dataKey="grade" name="Final grade" stroke="var(--text-dim)" fontSize={12} />
              <ZAxis range={[60, 60]} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ strokeDasharray: '3 3' }} />
              <Scatter data={scatter.pairs} fill="var(--steel-light)" />
            </ScatterChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      <ChartCard
        title="Grade distribution by engagement tier"
        subtitle={`Tiers: minimal ≤ ${DEFAULT_ENGAGEMENT_TIER_THRESHOLDS.minimalPointsMax} pts; comprehensive ≥ ${Math.round(DEFAULT_ENGAGEMENT_TIER_THRESHOLDS.comprehensiveIndividualShare * 100)}% individual share (defaults, instructor-tunable later)`}
      >
        {!hasCurrentGradebook ? (
          <EmptyChart message="Upload a gradebook to see grade distribution by engagement tier." />
        ) : gradedStudents.length === 0 ? (
          <EmptyChart message="No gradebook rows are both matched to a student and graded yet." />
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={tierDistribution}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-steel)" />
              <XAxis dataKey="label" stroke="var(--text-dim)" fontSize={12} interval={0} />
              <YAxis stroke="var(--text-dim)" fontSize={12} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend
                wrapperStyle={{ fontSize: 12, color: 'var(--text-dim)' }}
                formatter={(value) => TIER_LABELS[value] ?? value}
              />
              <Bar dataKey="comprehensive" name="comprehensive" stackId="tier" fill={TIER_COLORS.comprehensive} />
              <Bar dataKey="predominantly_large_scale" name="predominantly_large_scale" stackId="tier" fill={TIER_COLORS.predominantly_large_scale} />
              <Bar dataKey="minimal" name="minimal" stackId="tier" fill={TIER_COLORS.minimal} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      <ChartCard title="Before / after FML — grade distribution">
        {!hasBaselineGradebook ? (
          <EmptyChart message="Upload a baseline gradebook (pre-FML historical cohort) to see this comparison." />
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={beforeAfter}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-steel)" />
              <XAxis dataKey="label" stroke="var(--text-dim)" fontSize={12} interval={0} />
              <YAxis stroke="var(--text-dim)" fontSize={12} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 12, color: 'var(--text-dim)' }} />
              <Bar dataKey="baseline" name="Before (baseline)" fill="var(--text-dim)" />
              <Bar dataKey="current" name="After (FML)" fill="var(--steel-light)" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>
    </div>
  )
}

function ChartCard({ title, subtitle, children }) {
  return (
    <div
      style={{
        background: 'var(--navy-card)',
        border: '1px solid var(--border-steel)',
        borderRadius: 'var(--radius-md)',
        padding: '16px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div style={sectionTitleStyle}>{title}</div>
      {subtitle && <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{subtitle}</div>}
      {children}
    </div>
  )
}

function EmptyChart({ message }) {
  return (
    <div
      style={{
        minHeight: 200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        color: 'var(--text-dim)',
        fontSize: 13,
        padding: '0 24px',
      }}
    >
      {message}
    </div>
  )
}

const sectionTitleStyle = {
  fontFamily: 'var(--font-mono)',
  fontSize: 12,
  color: 'var(--text-dim)',
  textTransform: 'uppercase',
}

const tooltipStyle = {
  background: 'var(--navy-nav)',
  border: '1px solid var(--border-steel)',
  borderRadius: 'var(--radius-sm)',
  color: 'var(--text-body)',
  fontSize: 12,
}

const printButtonStyle = {
  padding: '6px 16px',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--border-steel-strong)',
  background: 'transparent',
  color: 'var(--steel-light)',
  fontFamily: 'var(--font-ui)',
  letterSpacing: 1,
  cursor: 'pointer',
}
