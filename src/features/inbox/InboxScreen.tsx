import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, Button, Card, IconButton, PageHeader, Pill, Screen } from '@/components/ui';
import { colors, radii, spacing } from '@/theme';

export type InboxItemView = {
  id: string;
  from: string;
  title: string;
  body: string;
  /** e.g. "3 Jul" */
  date: string;
  read: boolean;
  category: 'offer' | 'transfer' | 'contract' | 'squad';
  /** An offer that can still be answered (it hasn't expired, been answered or lapsed with the window). */
  offer: { id: string; playerId: string } | null;
};

type InboxScreenProps = {
  items: readonly InboxItemView[];
  unread: number;
  onOpen: (id: string) => void;
  onMarkAllRead: () => void;
  onAcceptOffer: (offerId: string) => string | null;
  onRejectOffer: (offerId: string) => void;
  onViewPlayer: (playerId: string) => void;
  onBack: () => void;
};

const CATEGORY_LABEL: Record<InboxItemView['category'], string> = {
  offer: 'Offer',
  transfer: 'Transfer',
  contract: 'Contract',
  squad: 'Squad',
};

/** The manager's messages: offers to answer, completed deals, contract news. */
export function InboxScreen({ items, unread, onOpen, onMarkAllRead, onAcceptOffer, onRejectOffer, onViewPlayer, onBack }: InboxScreenProps) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <Screen bottomInset>
      <PageHeader
        title="Inbox"
        subtitle={unread ? `${unread} unread` : 'All caught up'}
        leading={<IconButton icon="back" accessibilityLabel="Back" onPress={onBack} />}
        trailing={unread ? <Button label="Mark all read" variant="secondary" onPress={onMarkAllRead} /> : null}
      />
      {error ? (
        <AppText color="warning" accessibilityLiveRegion="polite">
          {error}
        </AppText>
      ) : null}
      {items.length === 0 ? (
        <Card>
          <AppText color="textSecondary">No messages yet. Offers, deals and contract news will appear here.</AppText>
        </Card>
      ) : (
        <Card>
          {items.map((item, index) => {
            const open = openId === item.id;
            return (
              <View key={item.id} style={[styles.item, index > 0 && styles.divider]}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ expanded: open }}
                  accessibilityLabel={`${item.read ? '' : 'Unread. '}${item.title}, from ${item.from}, ${item.date}`}
                  onPress={() => {
                    setOpenId(open ? null : item.id);
                    if (!item.read) onOpen(item.id);
                  }}
                  style={({ pressed }) => [styles.header, pressed && styles.pressed]}>
                  <View style={[styles.dot, !item.read && styles.dotUnread]} />
                  <View style={styles.text}>
                    <AppText variant="bodyStrong" numberOfLines={open ? undefined : 1}>
                      {item.title}
                    </AppText>
                    <AppText variant="caption" color="textSecondary" numberOfLines={1}>
                      {item.from} · {item.date}
                    </AppText>
                  </View>
                  {item.offer ? <Pill label="Reply" tone="warning" /> : <Pill label={CATEGORY_LABEL[item.category]} />}
                </Pressable>
                {open ? (
                  <View style={styles.body}>
                    <AppText>{item.body}</AppText>
                    {item.offer ? (
                      <View style={styles.actions}>
                        <Button
                          label="Accept"
                          onPress={() => setError(item.offer ? onAcceptOffer(item.offer.id) : null)}
                        />
                        <Button label="Reject" variant="secondary" onPress={() => item.offer && onRejectOffer(item.offer.id)} />
                        <Button label="View player" variant="secondary" onPress={() => item.offer && onViewPlayer(item.offer.playerId)} />
                      </View>
                    ) : null}
                  </View>
                ) : null}
              </View>
            );
          })}
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  item: { paddingVertical: spacing.sm },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 44 },
  pressed: { opacity: 0.7 },
  text: { flex: 1, minWidth: 0 },
  body: { gap: spacing.md, paddingLeft: spacing.xl, paddingTop: spacing.sm },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  dot: { width: 8, height: 8, borderRadius: radii.pill, backgroundColor: colors.surfaceRaised },
  dotUnread: { backgroundColor: colors.accent },
});
