# Nawaf's STEM Portal

Private Grade 3 STEM learning app for Nawaf. Single-file web app, installable on iPad, with progress saved to a Google Sheet in Google Drive.

## A. Publish (GitHub Pages)
1. Push this folder to the `nawaf-stem` repo (main branch).
2. Repo → Settings → Pages → Source: *Deploy from a branch* → Branch: `main` / `(root)` → Save.
3. After a minute the app is live at `https://<your-username>.github.io/nawaf-stem/`.

## B. Install on Nawaf's iPad
1. Open the URL in **Safari** on the iPad.
2. Tap Share → **Add to Home Screen** → Add.
3. Open it from the home-screen icon. It runs full-screen and works offline after the first load.

## C. Save progress to Google Drive (one-time, about 5 minutes)
1. In Google Drive: New → Google Sheets. Name it `Nawaf STEM Progress`.
2. In the sheet: Extensions → **Apps Script**. Delete the sample code, paste the contents of `Code.gs`.
3. Change `SECRET` to a private word of your own. Save (💾).
4. Deploy → **New deployment** → type: **Web app** → Execute as: **Me** → Who has access: **Anyone** → Deploy. Authorise when asked (Advanced → Go to project).
5. Copy the **Web app URL** (ends in `/exec`).
6. In the app: **Parent view** → *Cloud sync* → paste the URL and your SECRET → **Save & connect**. Do this once on the iPad and once on any device you use for the Parent view.

From then on every lesson, quiz answer and completed mission is written to the sheet (tabs: `state`, `activity`, `summary`), and the Parent view on your phone or Mac loads the same progress. The `activity` tab is a full timestamped log you can filter in Sheets.

## Updating the app
Edit `index.html`, push to `main`. The iPad picks up the new version the next time it opens the app online.
