# SLSQ Sport Participation Dashboard (dev)

Internal dashboard for the sport team, exec team and board. Separate from the membership dashboard: its own code, its own Fly app and its own volume. It never writes to the membership app.

Maroon theme. Whole site needs a login (Viewer for exec and board, Admin for the sport team).

## Easiest route: Fly.io website (no command window)

1. Put these files in a new GitHub repository (all files sit in one flat list, no folders) (GitHub website: New repository, then Add file, Upload files, drag the contents in).
2. In Fly.io: Create, Launch an App, choose the GitHub repository, and name it (for example slsq-sport-dev).
3. In the app's Secrets, add `VIEWER_PASSWORD` and `ADMIN_PASSWORD` (each 12+ characters, kept in your password manager).
4. Deploy, open the link and sign in as Admin. The Board Summary should show 3,613 core entries for 2026.

The command-line route below does the same job.

## Open viewing mode (no passwords yet)

While `OPEN_VIEWING = "yes"` is in `fly.toml` and no `VIEWER_PASSWORD` is set, anyone with the link can view the dashboard. Admin tools (uploads, corrections, membership entry) stay off. To lock it later, add `VIEWER_PASSWORD` and `ADMIN_PASSWORD` as Fly secrets and remove the `OPEN_VIEWING` line. To switch on Admin tools while keeping viewing open, add only `ADMIN_PASSWORD` and sign in at `/login`.

## Put it on Fly.io with the command line (dev)

You need the Fly CLI (`fly`) installed and to be signed in (`fly auth login`). Run these from this folder.

1. Create the app and its own volume (names must not match the membership app):

   ```
   fly apps create slsq-sport-dev
   fly volumes create sport_data --app slsq-sport-dev --region syd --size 1
   ```

   If `slsq-sport-dev` is taken, pick another name and change `app = ` in `fly.toml`.

2. Make two long random passphrases (12+ characters, keep them in your password manager), then turn each into a hash. Replace the text in quotes:

   ```
   PW='your-long-random-viewer-passphrase' npm run hash
   PW='your-long-random-admin-passphrase' npm run hash
   ```

   (Run `npm install` first. Each command prints a hash starting with `$2`.)

3. Set the secrets on Fly. Use single quotes so the `$` in each hash is kept:

   ```
   fly secrets set --app slsq-sport-dev \
     VIEWER_PASSWORD_HASH='<viewer hash>' \
     ADMIN_PASSWORD_HASH='<admin hash>' \
     SESSION_SECRET="$(openssl rand -hex 32)"
   ```

4. Deploy:

   ```
   fly deploy --app slsq-sport-dev
   ```

5. Open the site, sign in as Admin, and check the Board Summary shows 3,613 core entries for 2026.

Take a volume snapshot before any later deploy: `fly volumes snapshots create <volume id>`.

## Switch on the live membership link

In `fly.toml`, remove the `#` from the `MEMBERSHIP_API_URL` line (it should point to the membership dashboard `/api/data` address) and redeploy. The app reads it every six hours and on the Admin "Refresh" button. It only reads.

The app looks for `juniorAgeGroups` in that response. If your endpoint uses different field names for active or total members, those two boxes stay blank and can be entered by hand on the Admin page. Paste a sample of the JSON to Claude and the reader can be matched exactly.

## Updating the data

Admin page, section 1: upload the new entries workbook. You see a preview of every figure that would change, plus warnings, and nothing changes until you press Publish. Earlier versions are kept and can be restored.

## Rules built in

- Trends use the seven core events (Juniors, Seniors, Masters, Pool, Surf Rescue, IRB, Board Riding) from 2014.
- A blank means "not yet run", never zero. Endurance, North Aussies and Interbranch sit outside the core total.
- 2025 is labelled indicative (TC Alfred). 2020 is labelled COVID.
- School league figures are excluded. Interbranch (fixed 192) is not judged.
- No financial data anywhere.
- Every number comes from one calculation (`calc.js`), so pages cannot disagree. `npm test` checks this.

## Run locally

```
npm install
VIEWER_PASSWORD_HASH='<hash>' ADMIN_PASSWORD_HASH='<hash>' SESSION_SECRET='<24+ chars>' npm start
npm test
```

To rebuild the starting data from a workbook: `npm run seed -- path/to/entries.xlsx`.
