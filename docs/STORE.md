# Shipping ClassKernel to the Microsoft Store

The Store accepts two packaging routes for a Tauri app. Both start from the CI-built
NSIS installer (or a local `npx tauri build` on Windows).

## Route A (recommended): MSIX package

1. **Get a Partner Center account** — a one-time individual developer fee. Reserve the
   app name ("ClassKernel") under *Apps and games → New product*.
2. **Build the app** on Windows: `npm ci && npx tauri build`. The raw binaries are in
   `src-tauri/target/release/` (`classkernel.exe` plus the WebView2 loader is not needed —
   WebView2 ships with Windows 10/11).
3. **Package as MSIX** with the [MSIX Packaging Tool](https://apps.microsoft.com/detail/9N5LW3JBCXKF)
   (free, from the Store): point it at the NSIS installer, let it run the install in the
   sandbox, and it emits an `.msix`. Set:
   - Package identity: use the values Partner Center reserved for you
     (*Product management → Product identity*): Package/Identity/Name, Publisher, and
     Publisher display name.
   - Capabilities: none needed beyond defaults — the app only touches files the user picks.
4. **Do not self-sign** — upload the unsigned MSIX to Partner Center; the Store signs it
   during ingestion.
5. **Submission checklist**
   - Age ratings questionnaire (utility/education, no user-generated online content).
   - Privacy policy: the app collects nothing and has no network access — a one-paragraph
     statement hosted anywhere public satisfies the requirement.
   - Screenshots: attendance grid, seating designer, live lesson view, dashboard.

## Route B: Win32 app via the Store (EXE/MSI submission)

Partner Center also accepts classic Win32 installers. Upload the NSIS `.exe` and provide
a silent-install switch (`/S` for NSIS). This skips MSIX conversion but requires the
installer to be code-signed with your own certificate first (the Store does not sign
Win32 submissions) — Azure Trusted Signing is the cheapest route to a cert.

## Updating

Bump `version` in `src-tauri/tauri.conf.json` and `package.json`, tag `v<version>`, let CI
produce the installer, re-package, and submit an update in Partner Center. Store updates
roll out automatically to users.

## Outside the Store

The NSIS installer from CI works standalone for direct sharing with colleagues — Windows
SmartScreen will warn until the installer is signed or gains reputation; "More info → Run
anyway" proceeds.
