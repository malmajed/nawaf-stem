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
3. In Apps Script Project Settings → Script properties, configure `SYNC_SECRET` with your existing sync key. The code reads this property and rejects requests when it is missing. Never commit keys.
4. Deploy → **New deployment** → type: **Web app** → Execute as: **Me** → Who has access: **Anyone** → Deploy. Authorise when asked (Advanced → Go to project).
5. Copy the **Web app URL** (ends in `/exec`).
6. In the app: **Parent view** → *Cloud sync* → paste the URL and your SECRET → **Save & connect**. Do this once on the iPad and once on any device you use for the Parent view.

From then on every lesson, quiz answer and completed mission is written to the sheet (tabs: `state`, `activity`, `summary`), and the Parent view on your phone or Mac loads the same progress. The `activity` tab is a full timestamped log you can filter in Sheets.

## Updating the app
Edit `index.html`, push to `main`. The iPad picks up the new version the next time it opens the app online.

## D. Update the Google Sheet script (weekly email and large progress files)
1. Open the sheet → Extensions → Apps Script. Select all, delete, paste the new `Code.gs` (retain the existing key in the `SYNC_SECRET` Script property).
2. Save. Then **Deploy → Manage deployments → ✏️ (edit) → Version: New version → Deploy**. The URL stays the same.
3. For the weekly email: in the editor choose the function **setupWeeklyTrigger** in the dropdown next to Run, click **Run**, and authorise (it needs email and spreadsheet access). You get the first report at once, then every Friday 08:00 Riyadh time.

## Features
- 80 missions in seven tracks: STEM 27, Math 13, English 14, Social Studies 8, Health 4, Arabic 8, Islamic Studies 6. English/Arabic toggle (English track stays English; Arabic and Islamic tracks are native Arabic with English explanations). (عربي button top-right; labs stay in English).
- 🔊 on every card and question reads it aloud with the device voice.
- Today's Challenge: 5 questions a day from completed missions, with a streak.
- Photo uploads, galleries, quiz-set cover images and camera capture are disabled. Learning records, existing Drive files and stored historical photo metadata are retained.
- Track Tests: 20 questions per track, 80% earns a Certified badge; results in Parent view.
- Parent view: progress, track tests, activity log, custom questions, cloud-sync status.

## Family follow page
`https://malmajed.github.io/nawaf-stem/follow.html` is a read-only page (Arabic) showing Nawaf's progress, badges, activity and tests. Configure the existing sync settings in Parent view on each authorized device first; the follow page uses those local settings. It cannot change progress.

## Photo-feature removal deployment

1. Before updating Apps Script, retain its existing sync key privately in the `SYNC_SECRET` Script property. The old key was publicly exposed: moving it is not rotation or security containment. Saving credential configuration requires action-time confirmation; do not put it in source control.
2. Replace the deployed script with `Code.gs`, save, and update the existing web-app deployment to a new version. GitHub Pages does not deploy Apps Script.
3. Deploy the web files together, including `photo-free.js` and `sw.js`. Version 40 refreshes the offline cache. Reopen installed apps online to obtain the update.
4. Existing locally saved `nawaf-sync` settings are reused. Devices previously relying only on embedded defaults must enter the existing URL/key in Parent view. No new credentials are created.
5. Verify a non-photo progress save/load and game room. Legacy photo upload requests must return `photo uploads disabled` without changing learning state. Sync responses and weekly reports omit historical photo data.

Existing Drive files and their permissions are not modified by this code. Previously installed offline clients and an older Apps Script deployment remain unchanged until updated. Historic source revisions may still contain the previous embedded configuration. Credential rotation requires separate authorization.

Run regression checks with `node --test tests/photo-removal.test.js`.
