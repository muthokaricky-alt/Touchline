import { useState } from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** Strong ease-out: the press shows the instant the finger lands. */
const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
const PRESS_IN_MS = 100;
const RELEASE_MS = 150;

type PressableScaleProps = Omit<PressableProps, 'style'> & {
  style?: StyleProp<ViewStyle> | ((state: { pressed: boolean }) => StyleProp<ViewStyle>);
  /** How far it shrinks while pressed: 0.97 for buttons and chips, closer to 1 for wide rows. */
  scaleTo?: number;
};

/**
 * A Pressable that shrinks slightly while pressed (snappy, physical feedback:
 * it reacts on press-in, the action happens on release). The scale runs on
 * the UI thread (Reanimated); with Reduce Motion on, only the pressed colour
 * changes. A finger drifting a little doesn't cancel the press.
 */
export function PressableScale({ style, scaleTo = 0.97, onPressIn, onPressOut, pressRetentionOffset = 12, ...rest }: PressableScaleProps) {
  const [pressed, setPressed] = useState(false);
  const scale = useSharedValue(1);
  const reduced = useReducedMotion();
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  return (
    <AnimatedPressable
      {...rest}
      pressRetentionOffset={pressRetentionOffset}
      onPressIn={(e) => {
        setPressed(true);
        if (!reduced) scale.set(withTiming(scaleTo, { duration: PRESS_IN_MS, easing: EASE_OUT }));
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        setPressed(false);
        scale.set(withTiming(1, { duration: RELEASE_MS, easing: EASE_OUT }));
        onPressOut?.(e);
      }}
      style={[typeof style === 'function' ? style({ pressed }) : style, animated]}
    />
  );
}
