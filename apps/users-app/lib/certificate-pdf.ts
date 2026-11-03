import type { ServiceHistoryCertificate } from '@repo/core/api/certificates';
import { bodyTypeLabel, CERTIFICATE_SCOPE_NOTE, certificateDateLabel } from '@repo/core/service-history-certificate';
import { tierMedalName } from '@repo/core/tiers';

import { escapeHtml as e } from './receipt-html';

/** The A4 page behind Print / Save as PDF: the same words as the screen, black on white. Pure and tested. */
export function certificateHtml(certificate: ServiceHistoryCertificate, verification: string, sealSvg: string): string {
  const { car, jobs, totals } = certificate;
  const rows = jobs
    .map(
      (job) => `<tr><td class="d">${e(certificateDateLabel(job.date))}</td><td><b>${e(job.services.join(', ') || 'Service')}</b><br><span>${e(job.garage.name)}${job.garage.tier ? ` · ${e(tierMedalName(job.garage.tier))}` : ''}</span><br><small>${e(job.photos.before && job.photos.after ? 'Before and after photos taken' : job.photos.before ? 'Before photos taken' : job.photos.after ? 'After photos taken' : 'No photos on record')}</small></td></tr>`
    )
    .join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@page{size:A4;margin:14mm}body{font-family:-apple-system,Helvetica,Arial,sans-serif;color:#000;font-size:13px;margin:0}
h1{font-size:24px;margin:8px 0 2px}.top{display:flex;justify-content:space-between}.mark{font-size:26px;font-weight:700}.mark i{color:#E4002B;font-style:normal}
.lab{font-size:11px;font-weight:600;text-transform:uppercase;color:#333;letter-spacing:.02em}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;border-top:1px solid #d4d4d4;padding-top:12px;margin-top:16px}
table{width:100%;border-collapse:collapse;margin-top:6px}td{vertical-align:top;padding:8px 0;border-top:1px dashed #d4d4d4}td.d{width:104px}tr{break-inside:avoid}small{color:#333}
.foot{border-top:1px solid #d4d4d4;margin-top:16px;padding-top:12px;font-size:11px;line-height:1.5;display:flex;justify-content:space-between;gap:24px}.foot p{margin:0 0 4px}
</style></head><body>
<div class="top"><div><div class="mark">Detlio<i>.</i></div><h1>Service History</h1><div>Certificate ${e(certificate.certificateNumber)}</div><div>Issued ${e(certificateDateLabel(certificate.asOf))}</div></div>${sealSvg}</div>
<div class="grid"><div><div class="lab">Car</div>${e(`${car.make} ${car.model}`)}</div><div><div class="lab">Colour</div>${e(car.color || '—')}</div><div><div class="lab">Body type</div>${e(bodyTypeLabel(car.bodyType))}</div><div><div class="lab">Registration</div>${e(car.registration ?? 'Not shown')}</div></div>
<div class="grid" style="grid-template-columns:repeat(3,1fr)"><div><div class="lab">Jobs through Detlio</div><b style="font-size:20px">${e(totals.jobs)}</b></div><div><div class="lab">First service</div>${e(totals.firstServiceOn ? certificateDateLabel(totals.firstServiceOn) : '—')}</div><div><div class="lab">Latest service</div>${e(totals.lastServiceOn ? certificateDateLabel(totals.lastServiceOn) : '—')}</div></div>
<div style="border-top:1px solid #d4d4d4;margin-top:16px;padding-top:12px"><div class="lab">Jobs, newest first</div><table>${rows || '<tr><td>No completed jobs through Detlio yet.</td></tr>'}</table></div>
<div class="foot"><div><p>${e(CERTIFICATE_SCOPE_NOTE)}</p><p>This is a record of work booked through Detlio, not an inspection report. It says nothing about the car's condition, mileage or ownership. Garage marks show each garage's standing on the date above.</p><p><b>Detlio · detlio.com</b></p></div><div>${verification}</div></div>
</body></html>`;
}

export const SEAL_SVG = `<svg viewBox="0 0 120 120" width="92" height="92"><circle cx="60" cy="60" r="58" fill="#E4002B"/><circle cx="60" cy="60" r="49" fill="none" stroke="#fff" stroke-width="1.2"/><circle cx="60" cy="60" r="33" fill="none" stroke="#fff" stroke-width="1.2"/><text x="60" y="58" text-anchor="middle" fill="#fff" font-size="15" font-weight="700">Detlio</text><text x="60" y="72" text-anchor="middle" fill="#fff" font-size="6.5" font-weight="600">RECORD</text></svg>`;
