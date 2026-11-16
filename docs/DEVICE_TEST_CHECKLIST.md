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
| Tactics → tap a pitch slot (the picker opens as a sheet) → swipe it down (iOS) / back (Android) | The picker closes without changing the lineup. |
| On the **New career** screen, press back (Android) | Either nothing happens or the app closes. It must **not** show the dashboard or tabs without a career. |
| Rotate the phone | Stays in portrait (the app is portrait-only). |

## 5. Look and feel

| Step | Expected |
| --- | --- |
| Home screen icon | Navy icon with the green touchline and ball; on Android 13+ with *themed icons* on, a single-colour version. |
| Scroll every tab | Nothing cut off at the bottom behind the tab bar; nothing wider than the screen. |
| Text size: set the phone's font size to large | Text grows; no overlapping labels on the dashboard and squad list (truncation with … is fine). |

## Reporting back

For anything that doesn't match, note the step, the phone model and OS
version, and a screenshot if possible. That's enough to reproduce it.
