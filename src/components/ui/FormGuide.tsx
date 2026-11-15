import { StyleSheet, View } from 'react-native';

import type { MatchOutcome } from '@/types/football';
import { colors, radii, spacing } from '@/theme';
import { describeForm } from '@/utils/format';

import { AppText } from './AppText';

const OUTCOME_COLOR = {
  W: colors.win,
  D: colors.draw,
  L: colors.loss,
} as const satisfies Record<MatchOutcome, string>;

type FormGuideProps = {
  /** Most recent result last, e.g. ['W', 'D', 'L', 'W', 'W']. */
  results: readonly MatchOutcome[];
};

/** Row of W/D/L badges. Letters are shown too, so colour isn't the only signal. */
export function FormGuide({ results }: FormGuideProps) {
  return (
    <View style={styles.row} accessible accessibilityLabel={`Recent form: ${describeForm(results)}`}>
      {results.map((result, index) => (
        <View key={index} style={[styles.badge, { backgroundColor: OUTCOME_COLOR[result] }]}>
          <AppText variant="overline" color="onAccent">
            {result}
          </AppText>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.xs },
  badge: {
    width: 22,
    height: 22,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
