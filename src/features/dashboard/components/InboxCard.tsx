import { StyleSheet, View } from 'react-native';

import { AppText, Card, ListRow, Pill } from '@/components/ui';
import { colors, radii } from '@/theme';

import type { InboxMessage } from '../dashboard.types';

export function InboxCard({ messages }: { messages: readonly InboxMessage[] }) {
  const unread = messages.filter((m) => m.unread).length;
  return (
    <Card
      title="Inbox"
      icon="inbox"
      headerAction={unread > 0 ? <Pill label={`${unread} new`} tone="accent" /> : undefined}>
      <View>
        {messages.map((message, index) => (
          <ListRow
            key={message.id}
            divider={index > 0}
            title={message.subject}
            subtitle={message.from}
            leading={
              <View
                style={[styles.dot, message.unread && styles.dotUnread]}
                accessibilityLabel={message.unread ? 'Unread' : undefined}
              />
            }
            trailing={
              <AppText variant="caption" color="textSecondary">
                {message.date}
              </AppText>
            }
          />
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  dot: { width: 8, height: 8, borderRadius: radii.pill, backgroundColor: colors.surfaceRaised },
  dotUnread: { backgroundColor: colors.accent },
});
