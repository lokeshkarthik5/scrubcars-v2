import { msg, t } from '@repo/core/i18n/translate';
/**
 * A resumable (tus 1.0.0) upload to a link Cloudflare Stream already created: the
 * server asks Stream for it with the file's length (apps/server/src/lib/stream.ts,
 * createVideoUpload), so the phone only has to find the offset (HEAD) and send the
 * file in chunks (PATCH), which is all tus-js-client does for an `uploadUrl`.
 *
 * Why not tus-js-client: in React Native it turns the file's URI into a Blob first
 * (uriToBlob: an XHR of the whole file into memory), which for a video of up to 2 GB
 * is the app being killed, and its core copy can't be resolved from this app.
 * Chunks read from the file with a FileHandle keep memory to one chunk.
 *
 * The network and the file are passed in (TusIO), so this is plain logic with tests.
 */

/**
 * Stream asks for chunks of at least 5 MiB, multiples of 256 KiB. The web sends 50 MiB;
 * on a phone every chunk is also held in memory and written to disk once, so 16 MiB.
 */
export const TUS_CHUNK_BYTES = 16 * 1024 * 1024;

/** The web's retry delays: now, then 3, 10 and 20 seconds. */
export const TUS_RETRY_DELAYS = [0, 3000, 10000, 20000];

export const TUS_FAILED_MESSAGE = msg('The video did not finish uploading. Try again.');

/** A reply with a status the server chose (as opposed to no reply at all). */
export class TusHttpError extends Error {
  constructor(readonly status: number) {
    super(`tus: unexpected response ${status}`);
  }
}

export interface TusIO {
  /** HEAD: how many bytes the server has. */
  head(url: string): Promise<number>;
  /** PATCH one chunk at `offset`; resolves the server's new offset. `onSent` is bytes of this chunk so far. */
  patch(url: string, offset: number, bytes: Uint8Array, onSent: (sent: number) => void): Promise<number>;
  /** Read `length` bytes from `offset` of the file (fewer at the end). */
  read(offset: number, length: number): Promise<Uint8Array>;
  sleep(ms: number): Promise<void>;
}

/** What tus-js-client retries: no reply, a server fault, or a "try again" status. */
export function isRetriable(error: unknown): boolean {
  if (error instanceof TusHttpError) {
    return error.status >= 500 || [408, 409, 423, 429].includes(error.status);
  }
  return true;
}

export async function tusUpload(options: {
  url: string;
  size: number;
  io: TusIO;
  /** 0 to 1. */
  onProgress: (fraction: number) => void;
  chunkBytes?: number;
  retryDelays?: number[];
  /** Checked between chunks: true stops the upload. */
  cancelled?: () => boolean;
}): Promise<void> {
  const { url, size, io, onProgress } = options;
  const chunkBytes = options.chunkBytes ?? TUS_CHUNK_BYTES;
  const delays = options.retryDelays ?? TUS_RETRY_DELAYS;
  const report = (sent: number) => onProgress(size > 0 ? Math.min(1, sent / size) : 0);

  let attempt = 0;
  let offset = 0;
  let known = false;
  report(0);
  while (!known || offset < size) {
    if (options.cancelled?.()) throw new Error(t(TUS_FAILED_MESSAGE));
    try {
      // The offset is asked for first, and again after any failure: a chunk may have
      // arrived although its answer did not.
      if (!known) {
        offset = await io.head(url);
        known = true;
        report(offset);
        continue;
      }
      const bytes = await io.read(offset, Math.min(chunkBytes, size - offset));
      if (bytes.length === 0) throw new Error('tus: file is shorter than it was');
      const base = offset;
      const next = await io.patch(url, base, bytes, (sent) => report(base + sent));
      // A server that answers with an offset behind the chunk is asked again.
      if (!(next > base)) throw new TusHttpError(409);
      offset = next;
      attempt = 0;
      report(offset);
    } catch (error) {
      const delay = delays[attempt];
      if (!isRetriable(error) || delay === undefined || options.cancelled?.()) {
        throw new Error(t(TUS_FAILED_MESSAGE));
      }
      attempt += 1;
      known = false;
      await io.sleep(delay);
    }
  }
}
