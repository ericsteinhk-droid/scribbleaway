import { useRef, useEffect, useMemo, useState } from 'react'
import * as d3 from 'd3'
import type { MatchedTask } from '../types'
import { useScheduleStore } from '../store/scheduleStore'

const STATUS_COLORS: Record<string, string> = {
  STABLE: '#38bdf8',
  SLIPPED: '#f59e0b',
  EXTENDED: '#a78bfa',
  ACCELERATED: '#4ade80',
  COMPRESSED: '#4ade80',
  NEW: '#4ade80',
  REMOVED: '#f87171',
}

const BAR_HEIGHTS: Record<string, number> = { compact: 14, normal: 20, spacious: 28 }
const ROW_GAPS: Record<string, number> = { compact: 2, normal: 4, spacious: 8 }

interface Props {
  tasks: MatchedTask[]
  onTaskClick: (name: string) => void
}

export function GanttTimeline({ tasks, onTaskClick }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const { settings } = useScheduleStore()
  const [containerWidth, setContainerWidth] = useState(900)

  const barH = BAR_HEIGHTS[settings.timelineBarHeight]
  const rowGap = ROW_GAPS[settings.timelineBarHeight]
  const rowH = barH * 2 + rowGap + 6

  const groupedByPhase = useMemo(() => {
    const map = new Map<string, MatchedTask[]>()
    for (const t of tasks) {
      if (!map.has(t.phase)) map.set(t.phase, [])
      map.get(t.phase)!.push(t)
    }
    return map
  }, [tasks])

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const allDates = useMemo(() => {
    const dates: Date[] = []
    for (const t of tasks) {
      if (t.taskA) { dates.push(t.taskA.startDate, t.taskA.endDate) }
      if (t.taskB) { dates.push(t.taskB.startDate, t.taskB.endDate) }
    }
    return dates
  }, [tasks])

  const minDate = useMemo(() => (allDates.length ? d3.min(allDates)! : new Date()), [allDates])
  const maxDate = useMemo(() => (allDates.length ? d3.max(allDates)! : new Date()), [allDates])

  useEffect(() => {
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width
      if (w) setContainerWidth(w)
    })
    if (containerRef.current) ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  const LABEL_W = 220
  const CHART_W = Math.max(600, containerWidth - LABEL_W - 20)
  const HEADER_H = 40

  const xScale = useMemo(
    () =>
      d3.scaleTime()
        .domain([d3.timeMonth.offset(minDate, -1), d3.timeMonth.offset(maxDate, 1)])
        .range([0, CHART_W]),
    [minDate, maxDate, CHART_W]
  )

  const rows: Array<{ task: MatchedTask; y: number; phase: string }> = []
  const phaseHeaders: Array<{ phase: string; y: number; count: number }> = []
  let yOffset = HEADER_H

  for (const [phase, phaseTasks] of groupedByPhase.entries()) {
    phaseHeaders.push({ phase, y: yOffset, count: phaseTasks.length })
    yOffset += 28
    if (!collapsed.has(phase)) {
      for (const task of phaseTasks) {
        rows.push({ task, y: yOffset, phase })
        yOffset += rowH
      }
    }
  }

  const totalH = yOffset + 20

  useEffect(() => {
    if (!svgRef.current || rows.length === 0) return
    const svgEl = svgRef.current
    const svg = d3.select(svgEl)

    const timeFmt = d3.timeFormat('%b %y')
    const tickFmt = (d: Date | d3.NumberValue) => timeFmt(d instanceof Date ? d : new Date(+d))

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.5, 20])
      .on('zoom', (event) => {
        svg.select<SVGGElement>('.chart-area').attr('transform', `translate(${event.transform.x},0) scale(${event.transform.k},1)`)
        const newX = event.transform.rescaleX(xScale)
        const axisUpdate = svg.select<SVGGElement>('.x-axis')
        axisUpdate.call(d3.axisTop<Date>(newX).ticks(d3.timeMonth.every(1)).tickFormat(timeFmt))
      })

    svg.call(zoom)

    const axisG = svg.select<SVGGElement>('.x-axis')
    axisG
      .attr('transform', `translate(${LABEL_W},${HEADER_H - 5})`)
      .call(d3.axisTop<Date>(xScale).ticks(d3.timeMonth.every(1)).tickFormat(timeFmt))
    axisG.select('.domain').remove()
    axisG.selectAll('text')
      .attr('fill', '#64748b')
      .attr('font-size', '10px')
    axisG.selectAll('.tick line')
      .attr('stroke', '#1e2d45')
      .attr('y2', totalH - HEADER_H)

    void tickFmt

  }, [rows, xScale, totalH, LABEL_W, HEADER_H])

  return (
    <div ref={containerRef} className="w-full overflow-hidden">
      <svg
        ref={svgRef}
        width={containerWidth}
        height={totalH}
        className="select-none"
        style={{ background: '#0b0f1a' }}
      >
        <g className="x-axis" />

        {phaseHeaders.map(({ phase, y, count }) => (
          <g key={phase}>
            <rect x={0} y={y} width={containerWidth} height={26} fill="#131929" />
            <text
              x={8}
              y={y + 17}
              fill="#a78bfa"
              fontSize={11}
              fontWeight={600}
              fontFamily="Inter, sans-serif"
              cursor="pointer"
              onClick={() =>
                setCollapsed((prev) => {
                  const s = new Set(prev)
                  s.has(phase) ? s.delete(phase) : s.add(phase)
                  return s
                })
              }
            >
              {collapsed.has(phase) ? '▶' : '▼'} {phase} ({count})
            </text>
          </g>
        ))}

        {rows.map(({ task, y }) => {
          const color = STATUS_COLORS[task.status] ?? '#38bdf8'
          const tA = task.taskA
          const tB = task.taskB

          const xA = tA ? xScale(tA.startDate) + LABEL_W : null
          const wA = tA ? Math.max(2, xScale(tA.endDate) - xScale(tA.startDate)) : null
          const xB = tB ? xScale(tB.startDate) + LABEL_W : null
          const wB = tB ? Math.max(2, xScale(tB.endDate) - xScale(tB.startDate)) : null

          const isMilestone = tB?.isMilestone ?? tA?.isMilestone

          return (
            <g key={task.name} onClick={() => onTaskClick(task.name)} className="cursor-pointer">
              <rect x={0} y={y} width={containerWidth} height={rowH} fill="transparent" />
              <text
                x={4}
                y={y + rowH / 2 + 4}
                fill="#e2e8f0"
                fontSize={10}
                fontFamily="Inter, sans-serif"
                clipPath={`url(#label-clip)`}
              >
                <title>{task.name}</title>
                {task.name.length > 32 ? task.name.slice(0, 30) + '…' : task.name}
              </text>

              {tA && xA !== null && wA !== null && (
                isMilestone ? (
                  <polygon
                    points={`${xA},${y + rowH / 2} ${xA + 7},${y + rowH / 2 - 7} ${xA + 14},${y + rowH / 2} ${xA + 7},${y + rowH / 2 + 7}`}
                    fill="#475569"
                    opacity={0.5}
                  />
                ) : (
                  <rect x={xA} y={y + 1} width={wA} height={barH} fill="#475569" rx={2} opacity={0.6} />
                )
              )}
              {tB && xB !== null && wB !== null && (
                isMilestone ? (
                  <polygon
                    points={`${xB},${y + barH + rowGap + barH / 2} ${xB + 8},${y + barH + rowGap} ${xB + 16},${y + barH + rowGap + barH / 2} ${xB + 8},${y + rowH - 2}`}
                    fill={color}
                  />
                ) : (
                  <rect x={xB} y={y + barH + rowGap} width={wB} height={barH} fill={color} rx={2} opacity={0.85} />
                )
              )}
            </g>
          )
        })}
        <defs>
          <clipPath id="label-clip">
            <rect x={0} y={0} width={LABEL_W - 4} height={totalH} />
          </clipPath>
        </defs>
      </svg>
    </div>
  )
}
