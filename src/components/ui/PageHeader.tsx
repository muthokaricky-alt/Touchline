import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { spacing } from '@/theme';

import { AppText } from './AppText';

type PageHeaderProps = {
  title: string;
  /** Small uppercase line above the title, e.g. the club name. */
  overline?: string;
  subtitle?: string;
  /** Left of the title, e.g. a back/close IconButton. */
  leading?: ReactNode;
  /** Right of the title, e.g. an action button. */
  trailing?: ReactNode;
};

/** Standard top-of-screen title block. */
export function PageHeader({ title, overline, subtitle, leading, trailing }: PageHeaderProps) {
  return (
    <View style={styles.row}>
      {leading}
      <View style={styles.text}>
        {overline ? (
          <AppText variant="overline" color="accent" numberOfLines={1}>
            {overline}
          </AppText>
        ) : null}
        <AppText variant="display" accessibilityRole="header" numberOfLines={2}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText color="textSecondary" numberOfLines={2}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {trailing}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingTop: spacing.sm },
  text: { flex: 1, minWidth: 0, gap: spacing.xxs },
});
