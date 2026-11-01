import { toast } from '@repo/native-ui/toast';
import * as Sharing from 'expo-sharing';
import { type ComponentRef, type ReactNode, useEffect, useRef, useState } from 'react';
import { PixelRatio, Share, View } from 'react-native';
import { create } from 'zustand';

/**
 * Shared pictures (the web's lib/share-image.ts): the picture is laid out as an ordinary view,
 * a third of its pixel size, out of sight; view-shot makes it a PNG on the phone and the share
 * sheet takes it. No server sees it, and nothing else about the customer goes in it.
 */
interface Job {
  node: ReactNode;
  width: number;
  height: number;
  title: string;
  done: (ok: boolean) => void;
}

// Its types come from its source, which doesn't compile against this React Native.
const { captureRef } = require('react-native-view-shot') as { captureRef: (view: unknown, options: object) => Promise<string> };

const useJob = create<{ job: Job | null }>(() => ({ job: null }));

export function sharePicture(node: ReactNode, size: { width: number; height: number }, title: string): Promise<boolean> {
  return new Promise((done) => useJob.setState({ job: { node, ...size, title, done } }));
}

export function ShareHost() {
  const job = useJob((s) => s.job);
  const ref = useRef<ComponentRef<typeof View>>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!job) {
      setReady(false);
      return;
    }
    // Long enough for the bundled photo to paint.
    const timer = setTimeout(() => setReady(true), 350);
    return () => clearTimeout(timer);
  }, [job]);

  useEffect(() => {
    if (!job || !ready) return;
    (async () => {
      try {
        const uri = await captureRef(ref, { format: 'png', width: job.width / PixelRatio.get(), height: job.height / PixelRatio.get(), result: 'tmpfile' });
        if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'image/png', UTI: 'public.png', dialogTitle: job.title });
        else await Share.share({ url: uri });
        job.done(true);
      } catch {
        toast.error("Couldn't make the picture. Try again.");
        job.done(false);
      } finally {
        useJob.setState({ job: null });
      }
    })();
  }, [job, ready]);

  if (!job) return null;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: -2000, top: 0 }}>
      <View ref={ref} collapsable={false} style={{ width: job.width / 3, height: job.height / 3, overflow: 'hidden' }}>
        {job.node}
      </View>
    </View>
  );
}
