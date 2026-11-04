import * as Notifications from 'expo-notifications';
import { type Href, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking } from 'react-native';

import { rewriteSystemPath } from './deep-link';
import { pathFromPushUrl } from './notification-routing';

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
 * A tapped notification opens its path, including the one that launched the app from
 * nothing. `ready`: the navigator is up and the session settled, so a signed-out person goes
 * through sign-in and arrives at the booking afterwards.
 */
export function useNotificationTaps(ready: boolean) {
  useEffect(() => {
    if (!ready) return;
    const open = (response: Notifications.NotificationResponse) => {
      if (response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
      router.push(pathFromPushUrl(response.notification.request.content.data?.url) as Href);
      void Notifications.clearLastNotificationResponseAsync().catch(() => undefined);
    };
    void Notifications.getLastNotificationResponseAsync()
      .then((last) => {
        if (last) open(last);
      })
      .catch(() => undefined);
    const subscription = Notifications.addNotificationResponseReceivedListener(open);
    return () => subscription.remove();
  }, [ready]);
}

/**
 * The link that launched the app from nothing: its path, null with none, undefined until
 * read. On iOS the router reads the launch address from expo-linking's getLinkingURL, which
 * came back null on a cold start while React Native's getInitialURL held it (seen in Expo Go).
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
