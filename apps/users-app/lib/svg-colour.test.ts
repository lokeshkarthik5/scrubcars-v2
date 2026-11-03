import { expect, test } from 'bun:test';

import { stopOf } from './svg-colour';

test('colour and opacity come apart', () => {
  expect(stopOf('rgba(125, 183, 255, 0.35)')).toEqual({ stopColor: 'rgb(125,183,255)', stopOpacity: 0.35 });
  expect(stopOf('rgb(1,2,3)')).toEqual({ stopColor: 'rgb(1,2,3)', stopOpacity: 1 });
  expect(stopOf('#FFF')).toEqual({ stopColor: '#FFF', stopOpacity: 1 });
});
