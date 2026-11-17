import { useEffect, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  Easing,
  Keyframe,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { AppText } from '@/components/ui';
import type { Side } from '@/engine/types';
import { colors, radii } from '@/theme';

import type { PitchFrame } from '../pitch2d';

/** A team's dot colours: fill and the shirt-number colour on it. */
export type Kit = { fill: string; text: string };

type Pitch2DProps = {
  frame: PitchFrame;
  kits: Record<Side, Kit>;
  /** Shirt number shown on a player's dot. */
  numberOf: (playerId: string) => string;
  /** Shown over the pitch when a goal is scored: "GOAL! Ravensmoor United" and "39' Julien Girard · assist Théo Mercier". */
  goalBanner?: { title: string; detail: string } | null;
  /** How long the dots and the ball take to glide to this frame (the match screen passes the frame's own time). */
  moveMs?: number;
};

const DEFAULT_MOVE_MS = 480;
const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);

/**
 * The goal banner springs in: from a little smaller and below, overshooting
 * slightly (anticipation and follow-through) — the one big moment of a match.
 */
const BANNER_IN = new Keyframe({
  0: { opacity: 0, transform: [{ translateY: 14 }, { scale: 0.9 }] },
  60: { opacity: 1, transform: [{ translateY: -3 }, { scale: 1.04 }], easing: EASE_OUT },
  100: { opacity: 1, transform: [{ translateY: 0 }, { scale: 1 }] },
})
  .duration(420)
  .reduceMotion(ReduceMotion.System);
/** Pitch proportions (105 × 68 m), drawn horizontally: home goal on the left. */
export const PITCH_RATIO = 105 / 68;

/**
 * The illustrative 2D pitch (see ../pitch2d.ts): numbered dots in club
 * colours and the ball, gliding to each new frame. Animations run with
 * Reanimated on the UI thread, so they stay smooth while JavaScript works.
 * Positions are fractions of the measured pitch, so it fits any size (a
 * phone in portrait, full screen in landscape, a desktop window).
 */
export function Pitch2D({ frame, kits, numberOf, goalBanner, moveMs = DEFAULT_MOVE_MS }: Pitch2DProps) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const onLayout = (e: LayoutChangeEvent) => setSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height });
  const dotSize = Math.max(14, Math.min(28, size.height * 0.075));

  return (
    <View
      style={styles.pitch}
      onLayout={onLayout}
      accessible
      accessibilityRole="image"
      accessibilityLabel="Match view: the players as dots on the pitch">
      <Markings />
      {size.width > 0
        ? frame.dots.map((dot) => {
            // A goal: the scorer and the assister in focus, everyone else steps back (staging).
            const inGoal = frame.goal !== null;
            const star = inGoal && dot.playerId === frame.goal?.scorerId;
            const involved = star || (inGoal && dot.playerId === frame.goal?.assistId);
            return (
              <Dot
                key={dot.playerId}
                x={dot.x * size.width}
                y={dot.y * size.height}
                size={dotSize}
                kit={kits[dot.side]}
                label={numberOf(dot.playerId)}
                highlight={dot.highlight}
                moveMs={moveMs}
                dimmed={inGoal && !involved}
                star={star}
              />
            );
          })
        : null}
      {size.width > 0 ? <Ball x={frame.ball.x * size.width} y={frame.ball.y * size.height} size={Math.max(7, dotSize * 0.42)} moveMs={moveMs} /> : null}
      {frame.goal && goalBanner ? (
        <Animated.View entering={BANNER_IN} style={styles.goalBanner} pointerEvents="none" accessibilityLiveRegion="polite">
          <AppText variant="heading" color="onAccent" align="center">
            {goalBanner.title}
          </AppText>
          <AppText variant="caption" color="onAccent" align="center" numberOfLines={1}>
            {goalBanner.detail}
          </AppText>
        </Animated.View>
      ) : null}
    </View>
  );
}

/** Glides to (x, y): the first render places it, later changes animate. */
function useGlide(x: number, y: number, moveMs: number) {
  const tx = useSharedValue(x);
  const ty = useSharedValue(y);
  useEffect(() => {
    // Ease in and out (the default): a pass leaves the foot and arrives, and long glides don't look mechanical.
    tx.set(withTiming(x, { duration: moveMs }));
    ty.set(withTiming(y, { duration: moveMs }));
    // moveMs only matters when the target changes: a new speed shouldn't restart a glide.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [x, y, tx, ty]);
  return { tx, ty };
}

type DotProps = {
  x: number;
  y: number;
  size: number;
  kit: Kit;
  label: string;
  highlight: boolean;
  moveMs: number;
  /** Faded back while a goal is celebrated. */
  dimmed: boolean;
  /** The scorer: pops up and stays a little bigger while the goal is shown. */
  star: boolean;
};

function Dot({ x, y, size, kit, label, highlight, moveMs, dimmed, star }: DotProps) {
  const { tx, ty } = useGlide(x, y, moveMs);
  const opacity = useSharedValue(1);
  const scale = useSharedValue(1);
  const reduced = useReducedMotion();
  useEffect(() => {
    opacity.set(withTiming(dimmed ? 0.35 : 1, { duration: 250, easing: EASE_OUT }));
  }, [dimmed, opacity]);
  useEffect(() => {
    if (reduced) return;
    // Pose to pose: up past the resting size, then settle a little larger while the goal shows.
    scale.set(
      star
        ? withSequence(withTiming(1.45, { duration: 160, easing: EASE_OUT }), withTiming(1.2, { duration: 240, easing: EASE_OUT }))
        : withTiming(1, { duration: 200, easing: EASE_OUT }),
    );
  }, [star, reduced, scale]);
  const style = useAnimatedStyle(() => ({
    opacity: opacity.get(),
    transform: [{ translateX: tx.get() - size / 2 }, { translateY: ty.get() - size / 2 }, { scale: scale.get() }],
  }));
  return (
    <Animated.View
      style={[
        styles.dot,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: kit.fill },
        highlight && { borderColor: colors.accent, borderWidth: 2 },
        style,
      ]}
      pointerEvents="none">
      <AppText style={[styles.number, { color: kit.text, fontSize: size * 0.45, lineHeight: size * 0.55 }]}>{label}</AppText>
    </Animated.View>
  );
}

function Ball({ x, y, size, moveMs }: { x: number; y: number; size: number; moveMs: number }) {
  const { tx, ty } = useGlide(x, y, moveMs);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: tx.get() - size / 2 }, { translateY: ty.get() - size / 2 }] }));
  return <Animated.View style={[styles.ball, { width: size, height: size, borderRadius: size / 2 }, style]} pointerEvents="none" />;
}

function Markings() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={styles.halfway} />
      <View style={styles.centreWrap}>
        <View style={styles.centreCircle} />
      </View>
      <View style={[styles.box, styles.boxLeft]} />
      <View style={[styles.box, styles.boxRight]} />
      <View style={[styles.goal, styles.goalLeft]} />
      <View style={[styles.goal, styles.goalRight]} />
    </View>
  );
}

const styles = StyleSheet.create({
  pitch: {
    width: '100%',
    aspectRatio: PITCH_RATIO,
    backgroundColor: colors.pitch,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.pitchLine,
    overflow: 'hidden',
  },
  halfway: { position: 'absolute', top: 0, bottom: 0, left: '50%', width: 1, backgroundColor: colors.pitchLine },
  centreWrap: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  centreCircle: { height: '27%', aspectRatio: 1, borderRadius: 999, borderWidth: 1, borderColor: colors.pitchLine },
  box: { position: 'absolute', top: '21%', bottom: '21%', width: '16%', borderWidth: 1, borderColor: colors.pitchLine },
  boxLeft: { left: -1 },
  boxRight: { right: -1 },
  goal: { position: 'absolute', top: '44%', bottom: '44%', width: 4, backgroundColor: 'rgba(255, 255, 255, 0.5)' },
  goalLeft: { left: 0 },
  goalRight: { right: 0 },
  dot: {
    position: 'absolute',
    left: 0,
    top: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.35)',
  },
  number: { fontWeight: '700', textAlign: 'center' },
  ball: { position: 'absolute', left: 0, top: 0, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: 'rgba(0, 0, 0, 0.5)' },
  goalBanner: {
    position: 'absolute',
    left: '18%',
    right: '18%',
    bottom: '8%',
    paddingVertical: 6,
    borderRadius: radii.md,
    backgroundColor: colors.accent,
  },
});
