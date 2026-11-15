import { StyleSheet, View } from 'react-native';

import { AppText, Button, Card, ListRow, Pill } from '@/components/ui';
import { colors, radii } from '@/theme';

import type { InboxMessage } from '../dashboard.types';

type InboxCardProps = {
  /** The latest few messages. */
  messages: readonly InboxMessage[];
  /** Unread across the whole inbox. */
  unread: number;
  onOpen: () => void;
};

export function InboxCard({ messages, unread, onOpen }: InboxCardProps) {
  return (
    <Card title="Inbox" icon="inbox" headerAction={unread > 0 ? <Pill label={`${unread} new`} tone="accent" /> : undefined}>
      {messages.length === 0 ? (
        <AppText color="textSecondary">No messages yet.</AppText>
      ) : (
        <View>
          {messages.map((message, index) => (
            <ListRow
              key={message.id}
              divider={index > 0}
              title={message.subject}
              subtitle={message.from}
              onPress={onOpen}
              accessibilityHint="Opens the inbox"
              leading={
                <View style={[styles.dot, message.unread && styles.dotUnread]} accessibilityLabel={message.unread ? 'Unread' : undefined} />
              }
              trailing={
                <AppText variant="caption" color="textSecondary">
                  {message.date}
                </AppText>
              }
            />
          ))}
        </View>
      )}
      <Button label="Open inbox" variant="secondary" icon="inbox" onPress={onOpen} />
    </Card>
  );
}

const styles = StyleSheet.create({
  dot: { width: 8, height: 8, borderRadius: radii.pill, backgroundColor: colors.surfaceRaised },
  dotUnread: { backgroundColor: colors.accent },
});
