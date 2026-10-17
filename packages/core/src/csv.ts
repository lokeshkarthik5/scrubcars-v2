/**
 * CSV files made in the browser: the admin's exports and the garage's
 * Earnings download. Moved here from apps/admin/lib/bookings.ts when the
 * garage portal needed them too.
 */

/**
 * One CSV cell: quoted when it holds a comma, quote or line break, and
 * defused when it starts like a formula (=, +, -, @), which a spreadsheet
 * would otherwise run.
 */
export function csvCell(value: string | number | null | undefined): string {
  let text = value === null || value === undefined ? '' : String(value)
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** Rows of cells as a CSV file's text, header first, CRLF as Excel expects. */
export function toCsv(header: string[], rows: Array<Array<string | number | null | undefined>>): string {
  return `${[header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`
}

/**
 * Saves text as a CSV file. The link is attached to the page while it is
 * clicked and the URL revoked only later: Safari on iOS reads the blob after
 * the click returns, and fails the download if it is already gone.
 */
export function downloadCsv(text: string, filename: string) {
  // The byte-order mark makes Excel read the file as UTF-8, so ₹ and Tamil
  // names survive the round trip.
  const blob = new Blob(['﻿', text], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.hidden = true
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}
