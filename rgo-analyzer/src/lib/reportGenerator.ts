import type { MatchedTask, Revision, Settings, SequenceInversion, ProjectEndDates } from '../types'

interface ReportData {
  revisionA: Revision
  revisionB: Revision
  tasks: MatchedTask[]
  inversions: SequenceInversion[]
  projectEnd: ProjectEndDates
  settings: Settings
  projectTitle: string
  language: 'fr' | 'en'
}

function fmtDate(d: Date | null): string {
  if (!d) return '—'
  return d.toLocaleDateString('fr-CA')
}

function sign(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`
}

export function generateReport(data: ReportData): string {
  const { revisionA, revisionB, tasks, inversions, projectEnd, settings, projectTitle, language } = data
  const fr = language === 'fr'

  const newTasks = tasks.filter((t) => t.status === 'NEW')
  const removedTasks = tasks.filter((t) => t.status === 'REMOVED')
  const slippedTasks = tasks.filter((t) => t.status === 'SLIPPED' || t.status === 'EXTENDED')
  const stableTasks = tasks.filter((t) => t.status === 'STABLE')
  const totalMatched = tasks.filter((t) => t.taskA && t.taskB).length
  const pctSlipped = totalMatched > 0 ? Math.round((slippedTasks.length / totalMatched) * 100) : 0

  const top10Slipped = slippedTasks
    .filter((t) => t.deltaEnd !== null)
    .sort((a, b) => (b.deltaEnd ?? 0) - (a.deltaEnd ?? 0))
    .slice(0, 10)

  const atRiskMilestones = tasks.filter(
    (t) => t.taskA?.isMilestone && t.deltaEnd !== null && t.deltaEnd > settings.milestoneSlippageAlertThreshold
  )

  const complexKeywords = settings.shortTaskKeywords
  const shortComplex = tasks.filter((t) => {
    if (!t.taskB) return false
    if (t.taskB.duration >= settings.shortTaskAlertThreshold) return false
    const nameLower = t.name.toLowerCase()
    return complexKeywords.some((kw) => nameLower.includes(kw.toLowerCase()))
  })

  const lines: string[] = []

  lines.push(`# ${projectTitle}`)
  lines.push(`**${fr ? 'Révision A' : 'Revision A'}:** ${revisionA.label} | **${fr ? 'Révision B' : 'Revision B'}:** ${revisionB.label}`)
  lines.push('')

  lines.push(`## ${fr ? '1. Résumé exécutif' : '1. Executive Summary'}`)
  lines.push('')
  lines.push(fr
    ? `Comparaison entre **${revisionA.label}** et **${revisionB.label}**.`
    : `Comparison between **${revisionA.label}** and **${revisionB.label}**.`)
  lines.push('')
  lines.push(`| ${fr ? 'Indicateur' : 'Metric'} | ${fr ? 'Valeur' : 'Value'} |`)
  lines.push('|---|---|')
  lines.push(`| ${fr ? 'Tâches revision A' : 'Tasks revision A'} | ${revisionA.tasks.length} |`)
  lines.push(`| ${fr ? 'Tâches revision B' : 'Tasks revision B'} | ${revisionB.tasks.length} |`)
  lines.push(`| ${fr ? 'Nouvelles tâches' : 'New tasks'} | ${newTasks.length} |`)
  lines.push(`| ${fr ? 'Tâches supprimées' : 'Removed tasks'} | ${removedTasks.length} |`)
  lines.push(`| ${fr ? 'Tâches glissées/prolongées' : 'Slipped/extended tasks'} | ${slippedTasks.length} (${pctSlipped}%) |`)
  lines.push(`| ${fr ? 'Tâches stables' : 'Stable tasks'} | ${stableTasks.length} |`)
  lines.push(`| ${fr ? 'Fin projet A' : 'Project end A'} | ${fmtDate(projectEnd.endA)} |`)
  lines.push(`| ${fr ? 'Fin projet B' : 'Project end B'} | ${fmtDate(projectEnd.endB)} |`)
  lines.push(`| ${fr ? 'Δ fin projet' : 'Δ project end'} | ${projectEnd.deltaCalendarDays !== null ? sign(projectEnd.deltaCalendarDays) + 'j' : '—'} |`)
  lines.push('')

  lines.push(`## ${fr ? '2. Analyse des glissements' : '2. Slippage Analysis'}`)
  lines.push('')
  if (top10Slipped.length === 0) {
    lines.push(fr ? '_Aucun glissement significatif détecté._' : '_No significant slippage detected._')
  } else {
    lines.push(`| ${fr ? 'Tâche' : 'Task'} | ${fr ? 'Phase' : 'Phase'} | Δ${fr ? 'fin' : 'end'} | ${fr ? 'Statut' : 'Status'} |`)
    lines.push('|---|---|---|---|')
    for (const t of top10Slipped) {
      lines.push(`| ${t.name} | ${t.phase} | ${sign(t.deltaEnd ?? 0)}j | ${t.status} |`)
    }
  }
  lines.push('')

  lines.push(`## ${fr ? '3. Changements de séquence' : '3. Sequence Changes'}`)
  lines.push('')
  if (inversions.length === 0) {
    lines.push(fr ? '_Aucune inversion de séquence détectée._' : '_No sequence inversions detected._')
  } else {
    lines.push(fr ? `**${inversions.length} inversion(s) de séquence détectée(s).**` : `**${inversions.length} sequence inversion(s) detected.**`)
    lines.push('')
    lines.push(`| ${fr ? 'Tâche X' : 'Task X'} | ${fr ? 'Tâche Y' : 'Task Y'} | ${fr ? 'Phase' : 'Phase'} | Δ ${fr ? 'déplacement' : 'displacement'} |`)
    lines.push('|---|---|---|---|')
    for (const inv of inversions.slice(0, 5)) {
      lines.push(`| ${inv.taskX} | ${inv.taskY} | ${inv.phase} | ${inv.deltaDisplacement}j |`)
    }
  }
  lines.push('')

  lines.push(`## ${fr ? '4. Jalons à risque' : '4. At-risk Milestones'}`)
  lines.push('')
  if (atRiskMilestones.length === 0) {
    lines.push(fr ? '_Aucun jalon à risque._' : '_No at-risk milestones._')
  } else {
    lines.push(`| ${fr ? 'Jalon' : 'Milestone'} | Δ${fr ? 'fin' : 'end'} |`)
    lines.push('|---|---|')
    for (const m of atRiskMilestones) {
      lines.push(`| ${m.name} | ${sign(m.deltaEnd ?? 0)}j |`)
    }
  }
  lines.push('')

  lines.push(`## ${fr ? '5. Durées à questionner' : '5. Durations to Question'}`)
  lines.push('')
  if (shortComplex.length === 0) {
    lines.push(fr ? '_Aucune durée suspecte détectée._' : '_No suspicious durations detected._')
  } else {
    lines.push(`| ${fr ? 'Tâche' : 'Task'} | ${fr ? 'Durée B' : 'Duration B'} |`)
    lines.push('|---|---|')
    for (const t of shortComplex) {
      lines.push(`| ${t.name} | ${t.taskB?.duration ?? '?'}j |`)
    }
  }
  lines.push('')

  lines.push(`## ${fr ? '6. Recommandations' : '6. Recommendations'}`)
  lines.push('')

  if (projectEnd.deltaCalendarDays !== null && projectEnd.deltaCalendarDays > 30) {
    lines.push(fr
      ? `- **Attention**: La date de fin de projet a glissé de **${projectEnd.deltaCalendarDays} jours calendaires**. Une revue des jalons critiques s'impose.`
      : `- **Warning**: Project end date has slipped by **${projectEnd.deltaCalendarDays} calendar days**. A critical milestones review is required.`)
  }
  if (pctSlipped > 30) {
    lines.push(fr
      ? `- ${pctSlipped}% des tâches ont glissé ou sont prolongées. Revoir le plan de ressources.`
      : `- ${pctSlipped}% of tasks have slipped or been extended. Review the resource plan.`)
  }
  if (atRiskMilestones.length > 0) {
    lines.push(fr
      ? `- ${atRiskMilestones.length} jalon(s) dépassent le seuil d'alerte de ${settings.milestoneSlippageAlertThreshold}j. Action requise.`
      : `- ${atRiskMilestones.length} milestone(s) exceed the ${settings.milestoneSlippageAlertThreshold}d alert threshold. Action required.`)
  }
  if (shortComplex.length > 0) {
    lines.push(fr
      ? `- ${shortComplex.length} tâche(s) complexe(s) ont une durée inférieure à ${settings.shortTaskAlertThreshold}j. Vérifier la faisabilité.`
      : `- ${shortComplex.length} complex task(s) have a duration below ${settings.shortTaskAlertThreshold}d. Verify feasibility.`)
  }
  if (
    (projectEnd.deltaCalendarDays ?? 0) <= 30 &&
    pctSlipped <= 30 &&
    atRiskMilestones.length === 0 &&
    shortComplex.length === 0
  ) {
    lines.push(fr ? '_Le calendrier est globalement stable. Aucune action prioritaire requise._' : '_The schedule is globally stable. No priority action required._')
  }

  return lines.join('\n')
}
