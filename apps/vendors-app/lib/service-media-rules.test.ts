/// <reference types="bun" />
import { expect, test } from 'bun:test';

import type { ServiceMedia } from '@repo/core/types';

import {
  checkPhotoPick,
  checkVideoPick,
  emptyPhotoSlots,
  mediaSlots,
  NOT_A_PHOTO,
  NOT_A_VIDEO,
  percent,
  PHOTO_TOO_BIG,
  processingIdOf,
  replacingVideo,
  settledList,
  startedList,
  VIDEO_TOO_BIG,
} from './service-media-rules';

const MB = 1024 * 1024;

const photo = (id: string, source: ServiceMedia['source'] = 'upload'): ServiceMedia => ({
  id,
  kind: 'image',
  url: `https://img/${id}.jpg`,
  posterUrl: null,
  durationSecs: null,
  source,
});
const video = (id: string, videoStatus: ServiceMedia['videoStatus']): ServiceMedia => ({
  id,
  kind: 'video',
  url: `https://v/${id}.m3u8`,
  posterUrl: videoStatus === 'ready' ? `https://v/${id}.png` : null,
  durationSecs: videoStatus === 'ready' ? 30 : null,
  source: 'upload',
  videoStatus,
});

test('a photo must be JPEG, PNG or WebP (a phone HEIC is converted, so it passes) and at most 5 MB', () => {
  expect(checkPhotoPick({ uri: 'file:///a.jpg', mimeType: 'image/jpeg', fileSize: 1 * MB })).toBeNull();
  expect(checkPhotoPick({ uri: 'file:///a.png', mimeType: 'image/png' })).toBeNull();
  expect(checkPhotoPick({ uri: 'file:///a.webp', mimeType: 'image/webp' })).toBeNull();
  expect(checkPhotoPick({ uri: 'file:///a.heic', mimeType: 'image/heic' })).toBeNull();
  expect(checkPhotoPick({ uri: 'file:///a.gif', mimeType: 'image/gif' })).toBe(NOT_A_PHOTO);
  expect(checkPhotoPick({ uri: 'file:///a.pdf', mimeType: 'application/pdf' })).toBe(NOT_A_PHOTO);
  expect(checkPhotoPick({ uri: 'file:///a.jpg', mimeType: 'image/jpeg', fileSize: 5 * MB })).toBeNull();
  expect(checkPhotoPick({ uri: 'file:///a.jpg', mimeType: 'image/jpeg', fileSize: 5 * MB + 1 })).toBe(PHOTO_TOO_BIG);
});

test('the web wording of both photo refusals', () => {
  expect(NOT_A_PHOTO).toBe('Use a JPEG, PNG or WebP photo.');
  expect(PHOTO_TOO_BIG).toBe('That photo is over 5 MB. Pick a smaller one.');
});

test('with no mime type the extension decides; with neither the phone is trusted to prepare it', () => {
  expect(checkPhotoPick({ uri: 'file:///x/photo.JPG?cache=1' })).toBeNull();
  expect(checkPhotoPick({ uri: 'file:///x/photo.bmp' })).toBe(NOT_A_PHOTO);
  expect(checkPhotoPick({ uri: 'content://media/42' })).toBeNull();
});

test('a video: at most 2 GB and 60 seconds (60.4 counts as 60), with the web messages', () => {
  const ok = checkVideoPick({ type: 'video', fileSize: 80 * MB, duration: 45_000 }, null);
  expect(ok).toEqual({ ok: true, sizeBytes: 80 * MB, durationSecs: 45 });

  expect(checkVideoPick({ type: 'video', fileSize: 80 * MB, duration: 60_400 }, null).ok).toBe(true);
  expect(checkVideoPick({ type: 'video', fileSize: 80 * MB, duration: 61_000 }, null)).toEqual({
    ok: false,
    message: 'Longer than 60 seconds — trim it on the phone and upload again',
    durationSecs: 61,
  });
  expect(checkVideoPick({ type: 'video', fileSize: 2 * 1024 * MB + 1, duration: 10_000 }, null)).toEqual({
    ok: false,
    message: VIDEO_TOO_BIG,
    durationSecs: null,
  });
  expect(VIDEO_TOO_BIG).toBe('That file is over 2 GB.');
  expect(checkVideoPick({ type: 'video', fileSize: 2 * 1024 * MB, duration: 10_000 }, null).ok).toBe(true);
});

test('a file that is not a video is refused; an unknown length is left to the server and Stream', () => {
  expect(checkVideoPick({ type: 'image', fileSize: MB }, null)).toEqual({ ok: false, message: NOT_A_VIDEO, durationSecs: null });
  expect(checkVideoPick({ mimeType: 'video/mp4', fileSize: MB, duration: null }, null)).toEqual({
    ok: true,
    sizeBytes: MB,
    durationSecs: null,
  });
  expect(checkVideoPick({ mimeType: 'application/zip', fileSize: MB }, null).ok).toBe(false);
});

test('when the picker gives no size, the size read from the file is used', () => {
  expect(checkVideoPick({ type: 'video', duration: 5000 }, 10 * MB)).toMatchObject({ ok: true, sizeBytes: 10 * MB });
  expect(checkVideoPick({ type: 'video', duration: 5000 }, null).ok).toBe(false);
});

test('the video slot shows the unfinished video, else the ready one; a ready one stays while its replacement is on its way', () => {
  const live = video('v1', 'ready');
  const next = video('v2', 'processing');
  expect(mediaSlots([photo('p1'), live]).currentVideo).toBe(live);
  const both = mediaSlots([next, live, photo('p1')]);
  expect(both.currentVideo).toBe(next);
  expect(both.liveVideo).toBe(live);
  expect(both.pendingVideo).toBe(next);
  expect(both.photos).toHaveLength(1);
  expect(mediaSlots([photo('p1')]).currentVideo).toBeNull();
});

test('the poll watches a processing video, but not while this phone is still uploading it', () => {
  expect(processingIdOf(video('v2', 'processing'), false)).toBe('v2');
  expect(processingIdOf(video('v2', 'processing'), true)).toBeNull();
  expect(processingIdOf(video('v1', 'ready'), false)).toBeNull();
  expect(processingIdOf(video('v3', 'error'), false)).toBeNull();
  expect(processingIdOf(null, false)).toBeNull();
});

test('a video that turns ready replaces the earlier one and any AI samples, and keeps the garage photos', () => {
  const list = [video('v2', 'processing'), video('v1', 'ready'), photo('p1'), photo('s1', 'ai')];
  const settled = settledList(list, video('v2', 'ready'));
  expect(settled.map((m) => m.id)).toEqual(['v2', 'p1']);
});

test('a video that fails changes nothing else: the earlier video stays', () => {
  const list = [video('v2', 'processing'), video('v1', 'ready'), photo('s1', 'ai')];
  const failed = { ...video('v2', 'error'), videoError: 'Could not process' };
  const settled = settledList(list, failed);
  expect(settled.map((m) => m.id)).toEqual(['v2', 'v1', 's1']);
  expect(settled[0].videoStatus).toBe('error');
});

test('a replacement replaces a failed or unfinished video first, else the ready one', () => {
  const live = video('v1', 'ready');
  expect(replacingVideo([photo('p1'), live])?.id).toBe('v1');
  expect(replacingVideo([video('v2', 'error'), live])?.id).toBe('v2');
  expect(replacingVideo([photo('p1')])).toBeUndefined();
});

test('starting a video: only a replaced video that was not ready leaves the list', () => {
  const live = video('v1', 'ready');
  const stuck = video('v2', 'error');
  const row = video('v3', 'processing');
  expect(startedList([photo('p1'), live], row, live).map((m) => m.id)).toEqual(['v3', 'p1', 'v1']);
  expect(startedList([photo('p1'), stuck], row, stuck).map((m) => m.id)).toEqual(['v3', 'p1']);
  expect(startedList([photo('p1')], row, undefined).map((m) => m.id)).toEqual(['v3', 'p1']);
});

test('empty photo slots and progress percentages', () => {
  expect(emptyPhotoSlots(3, 1)).toBe(2);
  expect(emptyPhotoSlots(3, 5)).toBe(0);
  expect(percent(0.456)).toBe(46);
  expect(percent(2)).toBe(100);
  expect(percent(-1)).toBe(0);
});
