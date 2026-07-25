# Setting up Google Drive sync

Drive sync is optional and off unless you turn it on. It needs a Google OAuth
client, which is free but has to be created once in the Google Cloud console.
Without one the app still builds and runs — Drive sync just shows as
unavailable.

You only need to do this once, for the app as a whole. Teachers using the
installer never see any of it; they just press **Sign in with Google**.

---

## 1. Create a Cloud project

1. Go to <https://console.cloud.google.com/projectcreate>.
2. Name it something like `ClassKernel` and create it.
3. Make sure it is selected in the project picker at the top of the page.

## 2. Enable the Drive API

1. Go to **APIs & Services → Library**.
2. Search for **Google Drive API** and press **Enable**.

## 3. Configure the consent screen

1. Go to **APIs & Services → OAuth consent screen**.
2. Choose **External** (unless every user is in your Google Workspace, in which
   case **Internal** is simpler and skips everything about publishing below).
3. Fill in the app name, your support email, and a developer contact email.
4. On the **Scopes** step, add exactly one scope:

   ```
   https://www.googleapis.com/auth/drive.file
   ```

   The app also requests `openid` and `email`, which are added automatically and
   are only used to show which account is connected.

> **Add nothing else.** `drive.file` is a *non-sensitive* scope: it only reaches
> files ClassKernel itself created, so Google requires no verification review
> and no CASA security assessment. Adding any broader Drive scope (`drive`,
> `drive.readonly`) drags the project into a paid third-party security audit.

## 4. Publish the app — don't skip this

On the OAuth consent screen, press **Publish app** to move it from *Testing* to
*In production*.

While the consent screen is in **Testing**:

- only accounts you list as test users can sign in, up to 100, **and**
- **refresh tokens expire after 7 days**, so sync silently stops working about a
  week after each sign-in.

That second one is the one that catches people out. Because the app only uses
non-sensitive scopes, publishing needs no review — it takes effect immediately.

## 5. Create the OAuth client

1. Go to **APIs & Services → Credentials → Create credentials → OAuth client ID**.
2. Application type: **Desktop app**.
3. Name it (e.g. `ClassKernel desktop`) and create it.
4. Copy the **Client ID** and **Client secret**.

No redirect URI needs configuring: the desktop flow uses a loopback address on
`127.0.0.1` with a port picked at run time, which Google allows for this client
type automatically.

> The client secret of a Desktop-app client is not confidential — Google's own
> documentation says so, because the flow is protected by PKCE rather than by
> the secret. It still shouldn't be committed to git; pass it in as below.

---

## 6. Give the credentials to the app

### For a local build

```powershell
$env:CLASSKERNEL_GOOGLE_CLIENT_ID     = "….apps.googleusercontent.com"
$env:CLASSKERNEL_GOOGLE_CLIENT_SECRET = "…"
npm run tauri build
```

```bash
# macOS / Linux
export CLASSKERNEL_GOOGLE_CLIENT_ID="….apps.googleusercontent.com"
export CLASSKERNEL_GOOGLE_CLIENT_SECRET="…"
npm run tauri dev
```

### Without rebuilding

Handy while testing, or to point an existing install at a different project.
Create `google_client.json` in the app config directory —
`%APPDATA%\com.classkernel.app\` on Windows:

```json
{
  "client_id": "….apps.googleusercontent.com",
  "client_secret": "…"
}
```

This file takes priority over whatever was baked in at build time.

### For CI

Add both values as repository secrets named `GOOGLE_CLIENT_ID` and
`GOOGLE_CLIENT_SECRET` (**Settings → Secrets and variables → Actions**). The
Windows build job in `.github/workflows/build.yml` already reads them, and
builds fine without them — the resulting installer simply has Drive sync
disabled.

---

## 7. Check it works

1. Start the app with a fresh data folder.
2. Onboarding should offer **This PC + Google Drive**.
3. Sign in; your browser opens the Google consent screen, then says you can
   close the tab.
4. A `ClassKernel` folder should appear at the top of your My Drive, filling up
   with `classes/…` as you add data.

If the Drive option is greyed out, the build has no credentials — check the env
vars, or use the `google_client.json` override.

---

## Notes for the future Android app

- The data lives in an **ordinary, visible folder in My Drive**, not in the
  hidden `appDataFolder`. That is deliberate: even if `drive.file` grants turn
  out to be scoped per OAuth client rather than per Cloud project, an Android
  app can still be granted this exact folder through the Google Drive Picker.
- Create the Android OAuth client **in this same Cloud project**, and check
  first whether it can already see files the desktop client created. That is
  the cheap path; the Picker is the fallback.
- Every file carries `appProperties.ck_rel_path`, so the whole tree can be read
  with one flat `files.list` call rather than walking folders.
- `ck-meta.json` in the folder root records the schema version.
- Match the merge rules in `src/lib/sync/policy.ts` — they are the contract
  that keeps two devices from clobbering each other.
