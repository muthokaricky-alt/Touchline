# Device test checklist (Expo Go)

Everything below has been tested in a desktop browser, but these parts only
run on a real phone. Work through the list on Android (and iOS if you have
one) and note anything that doesn't match **Expected**.

## Setup

1. Install **Expo Go** from the Play Store / App Store (it must support SDK 58).
2. On your computer, in the project folder:

   ```powershell
   npm install
   npm start
   ```

3. Scan the QR code with Expo Go (Android) or the Camera app (iOS).
   Phone and computer must be on the same Wi-Fi. If it can't connect, stop
   the server and run `npx expo start --tunnel`.

## 1. First launch and the splash screen

| Step | Expected |
| --- | --- |
| Open the app for the first time | Navy splash screen with the green touchline icon, then the **New career** screen. No white flash, no half-drawn dashboard. |
| Tap **Your name** | The keyboard opens and the field gets a green border. The **Start career** button stays reachable (scroll if the keyboard covers it). |
| Type a name, pick a club, **Start career** | The dashboard shows *Manager &lt;your name&gt;*. |

## 2. Saving on the phone (native SQLite storage)

| Step | Expected |
| --- | --- |
| Play two matches (Home → Play match → Kick off → Skip → Continue / Done) | Normal match screens. |
| **Fully close** the app (swipe it away), then reopen it | Splash, then the dashboard at the same matchday. Club tab → *Career save* says it was loaded from your last session. |
| Play a match, then **immediately** switch to another app, then close Touchline | On reopening, that last match is still there (the save is flushed when the app goes to the background). |
| Kick off a league match, tap **Manage team**, make a substitution, go back to the match, then fully close the app | On reopening you're back in the same match (no tabs until full time), with your substitution in the feed. |

## 3. Save slots, export and import

| Step | Expected |
| --- | --- |
| Club → **Save slots** → slot 2 → **New career** | New career screen. Start a second career, play one match. |
| Club → slot 1 → **Load** | Back to the first career, same matchday as before. |
| Slot 1 → **Export** | The **share sheet** opens with a `touchline-….json` file. Save it to Files / Drive (or email it to yourself). |
| Slot 3 → **Import** → pick that file | The **file picker** opens; after choosing the file the app switches to slot 3 with the same career as slot 1. |
| Import something that isn't a save (any other file) | A message saying it isn't a Touchline save. Nothing changes. |

## 4. Navigation and gestures

| Step | Expected |
| --- | --- |
| Open a player profile, then use Android's **back** gesture/button (iOS: swipe from the left edge) | Returns to the previous screen. |
| Tactics → tap a player on the pitch → **Pick from squad** (the picker opens as a sheet) → swipe it down (iOS) / back (Android) | The picker closes without changing the lineup. |
| Tactics → tap one player, then another (pitch or bench) | They swap places; the pitch doesn't jump when the first player is selected. |
| On the **New career** screen, press back (Android) | Either nothing happens or the app closes. It must **not** show the dashboard or tabs without a career. |
| Rotate the phone on any screen except a match | Stays in portrait. |
| During a match (2D view on), tilt the phone sideways | The pitch fills the screen with the score at the top and the commentary line at the bottom; tilting back returns to the normal view. |
| During a match, tap the full-screen button next to "2D / Commentary" (auto-rotate off is fine) | The phone turns to landscape with the full-screen pitch; the exit button turns it back. |
| Switch to "Commentary", leave the match, start another | It remembers "Commentary" (and "2D" when you switch back). |
| Leave a match while the phone is sideways | The rest of the app is portrait again. |

## 5. Look and feel

| Step | Expected |
| --- | --- |
| Home screen icon | Navy icon with the green touchline and ball; on Android 13+ with *themed icons* on, a single-colour version. |
| Scroll every tab | Nothing cut off at the bottom behind the tab bar; nothing wider than the screen. |
| Text size: set the phone's font size to large | Text grows; no overlapping labels on the dashboard and squad list (truncation with … is fine). |

## Reporting back

For anything that doesn't match, note the step, the phone model and OS
version, and a screenshot if possible. That's enough to reproduce it.
