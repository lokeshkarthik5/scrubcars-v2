import { expect, test } from 'bun:test';

import { certificateHtml } from './certificate-pdf';

const certificate = {
  certificateNumber: 'DSH-ABCD-EFGH',
  asOf: '2026-11-02',
  car: { make: 'Hyundai', model: '<i20>', color: 'Blue', bodyType: 'hatchback', registration: 'TN02 ** ** 0000' },
  totals: { jobs: 1, firstServiceOn: '2026-10-28', lastServiceOn: '2026-10-28' },
  jobs: [{ date: '2026-10-28', services: ['Express Wash'], garage: { name: 'Garage & Co', tier: null }, photos: { before: true, after: true }, photoPair: null }],
} as never;

test('nothing from the server can write into the page', () => {
  const html = certificateHtml(certificate, '', '');
  expect(html).toContain('&lt;i20&gt;');
  expect(html).toContain('Garage &amp; Co');
  expect(html).toContain('DSH-ABCD-EFGH');
  expect(html).toContain('Before and after photos taken');
});
