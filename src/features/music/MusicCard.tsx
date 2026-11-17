import { StyleSheet, View } from 'react-native';

import { AppText, Button, Card, Pill } from '@/components/ui';
import { spacing } from '@/theme';

export type MusicCardProps = {
  enabled: boolean;
  /** Title of the track playing (or paused) now. */
  nowPlaying: string;
  onToggle: () => void;
  onNext: () => void;
};

/** Club tab: menu music on/off, what's playing, next track. */
export function MusicCard({ enabled, nowPlaying, onToggle, onNext }: MusicCardProps) {
  return (
    <Card title="Music" icon="match" headerAction={<Pill label={enabled ? 'On' : 'Off'} tone={enabled ? 'accent' : 'neutral'} />}>
      <AppText color="textSecondary">
        {enabled ? `Now playing: ${nowPlaying}. ` : ''}Original lo-fi jazz in the menus; it fades out for matches. Remembered on this
        device.
      </AppText>
      <View style={styles.buttons}>
        <Button label={enabled ? 'Turn music off' : 'Turn music on'} variant="secondary" onPress={onToggle} />
        {enabled ? <Button label="Next track" variant="secondary" onPress={onNext} /> : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
