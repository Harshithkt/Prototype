const cell = (value: unknown) => {
  const text = value === null || value === undefined ? '' : String(value)
  // A leading = + - or @ would run as a formula in a spreadsheet.
  const safe = typeof value === 'string' && /^[=+\-@]/.test(text) ? `'${text}` : text
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

export function downloadCsv(filename: string, headers: string[], rows: unknown[][]) {
  const body = [headers, ...rows].map((row) => row.map(cell).join(',')).join('\n')
  const url = URL.createObjectURL(new Blob([body], { type: 'text/csv' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
