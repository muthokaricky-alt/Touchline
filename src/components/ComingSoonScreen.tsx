import { StyleSheet, View } from 'react-native';

import { AppText, Card, Icon, Pill, Screen, type IconName } from '@/components/ui';
import { colors, radii, spacing } from '@/theme';

type ComingSoonScreenProps = {
  title: string;
  icon: IconName;
  milestone: string;
  description: string;
  /** Bullet list of what this screen will eventually contain. */
  planned: readonly string[];
};

/** Placeholder for tabs whose features belong to a later milestone. */
export function ComingSoonScreen({ title, icon, milestone, description, planned }: ComingSoonScreenProps) {
  return (
    <Screen>
      <View style={styles.header}>
        <View style={styles.iconWrap}>
          <Icon name={icon} size={26} color="accent" />
        </View>
        <AppText variant="display" accessibilityRole="header">
          {title}
        </AppText>
        <Pill label={milestone} tone="accent" />
        <AppText color="textSecondary">{description}</AppText>
      </View>
      <Card title="Planned" icon="construction">
        {planned.map((item) => (
          <View key={item} style={styles.item}>
            <View style={styles.bullet} />
            <AppText style={styles.itemText}>{item}</AppText>
          </View>
        ))}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.md, paddingTop: spacing.sm },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: radii.lg,
    backgroundColor: colors.accentMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  item: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  bullet: { width: 6, height: 6, borderRadius: radii.pill, backgroundColor: colors.accent },
  itemText: { flex: 1 },
});
