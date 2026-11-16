const commonWords = new Set((
  'about across additional also and another any answer applied applications are based basic been being both build building but candidate candidates can could company contribute ' +
  'data demonstrate details develop developer developing development discussed engineer engineering explain experience feedback ' +
  'focus focused following for from full general good had has have help how improve improvement include into internship internships intern interview job join knowledge ' +
  'learn learning looking maintain maintaining may might model models more most needs new opportunity other our overall per practical practice product projects project required related ' +
  'relevant role should skills software strong support systems tasks technical team teams technologies technology understand undergraduate ' +
  'such than that the their them then there these they this those through use uses using user users want was ways well were what when where while which will with within work working would yet you your'
).split(' '))

function keywords(value) {
  const words = value.toLowerCase().match(/[a-z0-9]+(?:[.-][a-z0-9]+|[+#]+)*/g) ?? []
  return new Set(words.map(word => word.replaceAll('.', '')).filter(word => word.length >= 3 && !commonWords.has(word)))
}

function excerpt(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

export function selectPracticeMemory(rows, jobDescription, projectNotes) {
  const target = keywords(jobDescription + ' ' + projectNotes)
  return rows.flatMap(({ jobDescription, summary }) => {
    const gaps = excerpt(summary?.gaps, 750)
    const nextStep = excerpt(summary?.nextStep, 550)
    if (!gaps && !nextStep) return []

    const score = [...keywords(jobDescription)].filter(word => target.has(word)).length
    return score ? [{ score, notes: { gaps, nextStep } }] : []
  }).sort((a, b) => b.score - a.score).slice(0, 3).map(({ notes }) => notes)
}
