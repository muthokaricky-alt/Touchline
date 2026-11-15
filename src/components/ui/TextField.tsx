import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { colors, layout, radii, spacing, typography } from '@/theme';

import { AppText } from './AppText';

type TextFieldProps = {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  maxLength?: number;
  /** Shown under the field, e.g. a validation message. */
  hint?: string;
};

/** A labelled single-line text input in the Touchline style (accent border while focused). */
export function TextField({ label, value, onChangeText, placeholder, maxLength, hint }: TextFieldProps) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.wrap}>
      <AppText variant="overline" color="textSecondary">
        {label}
      </AppText>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        maxLength={maxLength}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        accessibilityLabel={label}
        autoCorrect={false}
        style={[styles.input, focused && styles.focused]}
      />
      {hint ? (
        <AppText variant="caption" color="textSecondary">
          {hint}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  input: {
    minHeight: layout.minTouchTarget,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
    color: colors.textPrimary,
    fontSize: typography.body.fontSize,
    // The accent border shows focus; hide the browser's own outline on web.
    outlineWidth: 0,
  },
  focused: { borderColor: colors.accent },
});
