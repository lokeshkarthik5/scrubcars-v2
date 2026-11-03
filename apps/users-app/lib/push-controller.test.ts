/// <reference types="bun" />
import { expect, test } from 'bun:test';

import { createPushController, type PermissionState, type PushControllerDeps } from './push-controller';

const TOKEN = 'ExponentPushToken[abc]';

function setup(options: { permission?: PermissionState; answer?: PermissionState; projectId?: string | null } = {}) {
  const store = new Map<string, string>();
  const calls: string[] = [];
  const deps: PushControllerDeps = {
    getPermission: async () => options.permission ?? 'granted',
    requestPermission: async () => {
      calls.push('ask');
      return options.answer ?? 'granted';
    },
    getProjectId: () => (options.projectId === undefined ? 'project' : options.projectId),
    getToken: async () => TOKEN,
    register: async (token) => {
      calls.push(`register ${token}`);
      return { devices: 1 };
    },
    remove: async (token) => {
      calls.push(`remove ${token}`);
    },
    storage: {
      getItem: (key) => store.get(key) ?? null,
      setItem: (key, value) => void store.set(key, value),
      removeItem: (key) => void store.delete(key),
    },
  };
  return { controller: createPushController(deps), calls };
}

test('asks the phone once, then registers and remembers the person', async () => {
  const { controller, calls } = setup({ permission: 'undetermined' });
  expect(await controller.turnOn('a')).toEqual({ result: 'on', devices: 1 });
  expect(calls).toEqual(['ask', `register ${TOKEN}`]);
  expect(controller.isOn('a')).toBe(true);
  expect(controller.isOn('b')).toBe(false);
});

test('registers nothing without a project id (Expo Go)', async () => {
  const { controller, calls } = setup({ projectId: null });
  expect((await controller.turnOn('a')).result).toBe('no_project');
  expect(calls).toEqual([]);
  expect(controller.isOn('a')).toBe(false);
});

test('a refusal, now or from before, registers nothing', async () => {
  const asked = setup({ permission: 'undetermined', answer: 'denied' });
  expect((await asked.controller.turnOn('a')).result).toBe('denied');
  expect(asked.calls).toEqual(['ask']);
  const before = setup({ permission: 'denied' });
  expect((await before.controller.turnOn('a')).result).toBe('denied');
  expect(before.calls).toEqual([]);
});

test('a refused register is not remembered as on', async () => {
  const { controller } = setup();
  const failing = createPushController({
    getPermission: async () => 'granted',
    requestPermission: async () => 'granted',
    getProjectId: () => 'p',
    getToken: async () => TOKEN,
    register: async () => {
      throw new Error('not found');
    },
    remove: async () => undefined,
    storage: { getItem: () => null, setItem: () => undefined, removeItem: () => undefined },
  });
  await expect(failing.turnOn('a')).rejects.toThrow('not found');
  expect(controller.isOn('a')).toBe(false);
});

test('off removes it from the server', async () => {
  const { controller, calls } = setup();
  await controller.turnOn('a');
  await controller.turnOff();
  expect(calls.at(-1)).toBe(`remove ${TOKEN}`);
  expect(controller.isOn('a')).toBe(false);
});

test('signing out removes it, unless the session is already gone', async () => {
  const out = setup();
  await out.controller.turnOn('a');
  await out.controller.forget({ sessionGone: false });
  expect(out.calls.at(-1)).toBe(`remove ${TOKEN}`);
  const deleted = setup();
  await deleted.controller.turnOn('a');
  await deleted.controller.forget({ sessionGone: true });
  expect(deleted.calls.some((call) => call.startsWith('remove'))).toBe(false);
  expect(deleted.controller.isOn('a')).toBe(false);
});

test('a launch re-registers for its person only', async () => {
  const { controller, calls } = setup();
  await controller.turnOn('a');
  calls.length = 0;
  await controller.refresh('b');
  expect(calls).toEqual([]);
  await controller.refresh('a');
  await controller.refresh('a');
  expect(calls).toEqual([`register ${TOKEN}`]);
});

