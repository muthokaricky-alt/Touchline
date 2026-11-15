import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { spacing } from '@/theme';

import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';

type SectionHeaderProps = {
  title: string;
  icon?: IconName;
  action?: ReactNode;
};

export function SectionHeader({ title, icon, action }: SectionHeaderProps) {
  return (
    <View style={styles.row}>
      <View style={styles.titleGroup}>
        {icon ? <Icon name={icon} size={16} color="accent" /> : null}
        <AppText variant="overline" color="textSecondary" accessibilityRole="header">
          {title}
        </AppText>
      </View>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  titleGroup: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
