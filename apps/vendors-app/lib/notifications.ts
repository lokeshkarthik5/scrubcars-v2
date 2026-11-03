import { type Href, router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { useEffect, useState } from 'react';
import { Linking } from 'react-native';

import { rewriteSystemPath } from './deep-link';
import { pathFromPushUrl } from './notification-routing';
import { queryClient } from './query-client';
import { refreshBookingsNow } from './use-vendor-bookings';

// In front too: the web's service worker shows them whatever the tab is doing.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * A tapped notification opens its path, including the one that launched the app
 * from nothing. `ready`: the navigator is up and the session settled, so a
 * signed-out person goes through sign-in and arrives at the job afterwards.
 */
export function useNotificationTaps(ready: boolean) {
  useEffect(() => {
    if (!ready) return;
    const open = (response: Notifications.NotificationResponse) => {
      if (response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
      const path = pathFromPushUrl(response.notification.request.content.data?.url);
      router.push(path as Href);
      void Notifications.clearLastNotificationResponseAsync().catch(() => undefined);
    };
    void Notifications.getLastNotificationResponseAsync()
      .then((last) => {
        if (last) open(last);
      })
      .catch(() => undefined);
    const subscription = Notifications.addNotificationResponseReceivedListener(open);
    // A push that lands while the app is open: the lists it is about are read now, not at the next poll.
    const received = Notifications.addNotificationReceivedListener(() => {
      refreshBookingsNow();
      void queryClient.invalidateQueries({ queryKey: ['requests'] });
      void queryClient.invalidateQueries({ queryKey: ['guarantee'] });
    });
    return () => {
      subscription.remove();
      received.remove();
    };
  }, [ready]);
}

/**
 * The link that launched the app from nothing: its path, null with none, undefined
 * until read. On iOS the router reads the launch address from expo-linking's
 * getLinkingURL, which came back null on a cold start while React Native's
 * getInitialURL held it (seen in Expo Go), so the app opened at the start. The
 * session gate goes here instead of Home.
 */
export function useColdStartLink(): string | null | undefined {
  const [path, setPath] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    Linking.getInitialURL()
      .then((url) => {
        const target = url ? rewriteSystemPath(url) : '/';
        if (live) setPath(target === '/' ? null : target);
      })
      .catch(() => {
        if (live) setPath(null);
      });
    return () => {
      live = false;
    };
  }, []);
  return path;
}
