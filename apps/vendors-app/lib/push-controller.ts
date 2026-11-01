/**
 * Turning this phone's alerts on and off, with the phone and the API passed in,
 * so every path is tested without either. A phone is on for one garage at a time,
 * as a browser is: the server keeps one row per token, and registering under
 * another garage moves it.
 */
export type PermissionState = 'granted' | 'denied' | 'undetermined';

export interface PushControllerDeps {
  getPermission(): Promise<PermissionState>;
  requestPermission(): Promise<PermissionState>;
  /** Null in a build with no EAS project (Expo Go): no remote token to be had. */
  getProjectId(): string | null;
  getToken(projectId: string): Promise<string>;
  register(token: string): Promise<{ devices?: number }>;
  remove(token: string): Promise<unknown>;
  storage: {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
  };
}

interface Record {
  vendorId: string;
  token: string;
}

const KEY = 'detlio.pushDevice';

export type TurnOnResult = 'on' | 'denied' | 'no_project';

export function createPushController(deps: PushControllerDeps) {
  const read = (): Record | null => {
    try {
      const raw = deps.storage.getItem(KEY);
      const parsed = raw ? (JSON.parse(raw) as Partial<Record>) : null;
      return parsed?.vendorId && parsed.token ? (parsed as Record) : null;
    } catch {
      return null;
    }
  };

  const clear = () => deps.storage.removeItem(KEY);
  /** The garage this launch has re-registered for: every screen asks, the server hears once. */
  let refreshedFor: string | null = null;

  return {
    /** Whether this phone is on, for this garage. */
    isOn: (vendorId: string | null) => Boolean(vendorId && read()?.vendorId === vendorId),

    /** Asks the phone when it hasn't been asked, then registers. Throws what the API refuses. */
    async turnOn(vendorId: string): Promise<{ result: TurnOnResult; devices?: number }> {
      let permission = await deps.getPermission();
      if (permission === 'undetermined') permission = await deps.requestPermission();
      if (permission !== 'granted') return { result: 'denied' };
      const projectId = deps.getProjectId();
      if (!projectId) return { result: 'no_project' };
      const token = await deps.getToken(projectId);
      const status = await deps.register(token);
      deps.storage.setItem(KEY, JSON.stringify({ vendorId, token } satisfies Record));
      return { result: 'on', devices: status.devices };
    },

    async turnOff() {
      const record = read();
      if (record) await deps.remove(record.token);
      clear();
    },

    /**
     * On launch, for a phone already on: the token can change, and permission
     * can be taken away in the phone's settings. Never throws, and no signal
     * doesn't turn anything off.
     */
    async refresh(vendorId: string | null): Promise<PermissionState> {
      const permission = await deps.getPermission().catch((): PermissionState => 'undetermined');
      const record = read();
      if (!record || record.vendorId !== vendorId) return permission;
      if (permission === 'denied') {
        clear();
        return permission;
      }
      const projectId = deps.getProjectId();
      if (permission !== 'granted' || !projectId || refreshedFor === vendorId) return permission;
      refreshedFor = vendorId;
      try {
        const token = await deps.getToken(projectId);
        await deps.register(token);
        if (token !== record.token) deps.storage.setItem(KEY, JSON.stringify({ vendorId, token } satisfies Record));
      } catch {
        // Tried again next launch.
      }
      return permission;
    },

    /** Signing out: this phone stops getting the account's alerts. */
    async forget(options: { sessionGone: boolean }) {
      const record = read();
      clear();
      if (record && !options.sessionGone) await deps.remove(record.token).catch(() => undefined);
    },
  };
}

export type PushController = ReturnType<typeof createPushController>;
