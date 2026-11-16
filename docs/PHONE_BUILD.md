# Getting Touchline onto a phone

Touchline ships as a phone app first, then as a website. This guide gets the
Android app onto your phone. Everything here is free.

## Step 1: try it in Expo Go (development)

Expo Go runs the game straight from your computer: good for testing, not
for giving the game to other people.

1. Install **Expo Go** from the Play Store (it must support Expo SDK 58).
2. In the project folder:

   ```powershell
   npm install
   npm start
   ```

3. Scan the QR code with Expo Go. Phone and computer must be on the same
   Wi-Fi; if it can't connect, stop the server (Ctrl+C) and run
   `npx expo start --tunnel`.
4. Work through [DEVICE_TEST_CHECKLIST.md](DEVICE_TEST_CHECKLIST.md) and note
   anything that doesn't match. Also note how long it takes from **Skip to
   full time** to the match report appearing (it tells us whether the
   matches abroad need a faster simulation).

## Step 2: build a real Android app (APK)

This builds Touchline in Expo's cloud and gives you an `.apk` file that
installs like any app, with its own icon, and works without the computer.

1. Create a free account at <https://expo.dev/signup>.
2. Install the EAS command-line tool and log in:

   ```powershell
   npm install -g eas-cli
   eas login
   ```

3. Start the build (the `preview` profile in `eas.json` makes an APK):

   ```powershell
   eas build --platform android --profile preview
   ```

   - The first time, it asks to **create an EAS project** for Touchline:
     answer **yes**. It adds a `projectId` to `app.json`; commit that change.
   - It asks about an **Android keystore** (the app's signing key): answer
     **yes, generate a new one**. Expo stores it for you; keep using the same
     one so updates install over the old app.
   - The build runs in the cloud (often 10–20 minutes; the free plan can
     queue). The command prints a link to follow it.

4. When it finishes, open the link **on your phone** (or scan the QR code it
   shows) and download the `.apk`.
5. Open the file. Android asks to allow installing apps from this source
   (your browser or file manager): allow it, then **Install**.

Your saves live on the phone. To move a career between devices, use
**Club → Save slots → Export / Import**.

## Updating the app later

Run the same build command again and install the new `.apk` over the old one
(same signing key, so your saves stay). Expo keeps the build numbers
(`appVersionSource: "remote"`).

## Later steps (not needed yet)

- **Website:** `npm run build:web` creates the site in `dist/`; it can be put
  on a free static host. This is the next step after the phone app.
- **Google Play Store:** a one-time $25 Google developer fee, a store listing
  and a privacy policy; `eas build --profile production` then
  `eas submit --platform android`.
- **Apple App Store:** $99 a year (Apple Developer Program). iPhones can't
  install an app from a file like Android can.
