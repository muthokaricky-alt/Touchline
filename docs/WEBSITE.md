# Putting Touchline on the web

The same code that builds the phone app also builds a website. It's
installable ("Add to Home screen" / "Install app") and works offline after
the first visit. Hosting is free on Netlify or Cloudflare Pages; pick one.
Both build the site from the GitHub repository automatically on every push
to `main`.

## Try the website on your computer first

```powershell
npm run build:web
npx serve dist
```

Open the address it prints (usually <http://localhost:3000>). `npm run
build:web` exports the site to `dist/` and adds the offline support
(`scripts/build-sw.mjs`).

## Option A: Netlify

1. Sign up at <https://app.netlify.com/signup> with your GitHub account.
2. **Add new site → Import an existing project → GitHub**, then choose the
   `Touchline` repository.
3. Netlify reads `netlify.toml` from the repository (build command
   `npm run build:web`, publish folder `dist`, Node 22). Click **Deploy**.
4. After a few minutes the site is live at an address like
   `https://<name>.netlify.app`. Rename it under **Site configuration → Site
   details → Change site name** (e.g. `touchline-game`).

## Option B: Cloudflare Pages

1. Sign up at <https://dash.cloudflare.com/sign-up>.
2. **Workers & Pages → Create → Pages → Connect to Git**, then choose the
   `Touchline` repository.
3. Build settings:
   - Framework preset: **None**
   - Build command: `npm run build:web`
   - Build output directory: `dist`
   - Environment variable: `NODE_VERSION` = `22`
4. **Save and Deploy**. The site appears at `https://<name>.pages.dev`.

## Installing it like an app

- **Android (Chrome):** open the site, then menu **⋮ → Install app** (or "Add
  to Home screen").
- **iPhone (Safari):** **Share → Add to Home Screen**.
- **Desktop (Chrome/Edge):** the install icon in the address bar.

It then opens in its own window with the Touchline icon, and works without
internet.

## Good to know

- **Saves are per browser.** A career saved in Chrome on your phone isn't in
  Safari or on your laptop. Use **Club → Save slots → Export / Import** to
  move it. Clearing the browser's site data deletes saves, so export first.
- **Updates:** every push to `main` redeploys the site. Players get the new
  version the next time they open it (the old offline copy is replaced).
- **Custom domain** (e.g. `touchline.co.ke`): both hosts support one for
  free, but buying the domain itself costs money; ask before buying.
