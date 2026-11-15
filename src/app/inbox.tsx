import { useRouter } from 'expo-router';
import { useMemo } from 'react';

import { InboxScreen } from '@/features/inbox/InboxScreen';
import { unreadCount } from '@/game/inbox/inbox';
import { useGameStore } from '@/store/game-store';
import { useInbox } from '@/store/hooks';
import { formatDate } from '@/utils/format';

/** Route: the manager's inbox. */
export default function InboxRoute() {
  const router = useRouter();
  const entries = useInbox();
  const inbox = useGameStore((s) => s.inbox);
  const actions = useGameStore.getState; // actions never change; read them when called

  const items = useMemo(
    () =>
      entries.map(({ message, liveOffer }) => ({
        id: message.id,
        from: message.from,
        title: message.title,
        body: message.body,
        date: formatDate(message.date),
        read: message.read,
        category: message.category,
        offer: liveOffer ? { id: liveOffer.id, playerId: liveOffer.playerId } : null,
      })),
    [entries],
  );

  return (
    <InboxScreen
      items={items}
      unread={unreadCount(inbox)}
      onOpen={(id) => actions().markMessageRead(id)}
      onMarkAllRead={() => actions().markAllMessagesRead()}
      onAcceptOffer={(offerId) => {
        try {
          actions().acceptOffer(offerId);
          return null;
        } catch (e) {
          return e instanceof Error ? e.message : String(e);
        }
      }}
      onRejectOffer={(offerId) => actions().rejectOffer(offerId)}
      onViewPlayer={(id) => router.push({ pathname: '/player/[id]', params: { id } })}
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))}
    />
  );
}
