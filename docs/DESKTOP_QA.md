# Desktop QA checklist (manual, on a Mac)

Use this for every release candidate. Nothing here can run on Linux CI —
these steps need a real Mac (Apple Silicon **and** Intel if both are
supported). Record results in the table at the bottom; file failures as
GitHub issues with the `qa` label.

Prerequisites: built + signed `.dmg`/`.pkg` (or TestFlight/ App Store build),
a test Stripe checkout, test license keys (see `docs/LICENSING.md` for the
stub endpoint), and sample PDFs (clean, scanned, 20 MB, multi-page,
password-protected, corrupted).

## 1. Install & first launch

- [ ] DMG mounts, drag-to-Applications install works
- [ ] First launch: no Gatekeeper block ("cannot be opened because the
      developer cannot be verified") on a **fresh** macOS user account
- [ ] App icon renders correctly (Dock, Finder, Launchpad)
- [ ] App launches cold in < 5 s on Apple Silicon and Intel
- [ ] No crash on launch with no network connection
- [ ] Menu bar, window resize, minimize/fullscreen behave natively
- [ ] Dark Mode + Light Mode render correctly

## 2. Trial flow (unlicensed)

- [ ] Fresh install shows trial state: "3 free PDFs" (copy TBD)
- [ ] Processing PDF #1, #2, #3 each decrement the counter correctly
- [ ] 4th PDF triggers the paywall (no bypass, no crash)
- [ ] Trial counter survives app restart (persisted, not in-memory)
- [ ] Trial counter cannot be reset by reinstalling the app alone
      (document expected behavior — device fingerprint vs fresh trial)

## 3. License activation

- [ ] Buy flow (web → Stripe test mode): key email arrives, format
      `PDFEZ-XXXX-XXXX-XXXX-XXXX`
- [ ] Entering a valid key + email activates; app unlocks immediately
- [ ] Malformed key rejected with a clear message (try: too short,
      lowercase, wrong prefix, pasted with spaces)
- [ ] Unknown/wrong key rejected (stub: `valid:false`)
- [ ] Activation works, then **network is disabled** → app still licensed
      on relaunch (offline grace per design)
- [ ] Expired key shows "expired" state, not "invalid"
- [ ] License status refreshes without restart (hook polls every 60 s)

## 4. Core product flows

- [ ] Upload clean fillable PDF → fields detected, fill, download overlay
- [ ] Upload scanned/image PDF → OCR detects fields (spot-check quality)
- [ ] Upload 20 MB multi-page PDF → processes without hang/OOM
- [ ] Corrupted PDF and password-protected PDF → graceful error, no crash
- [ ] Autofill from saved profile fills mapped fields correctly
- [ ] Signature pad: draw, save, reuse on next form
- [ ] Downloaded PDF opens in Preview; answers overlaid in the right places

## 5. Updates

- [ ] Update check finds a newer version (stage a fake newer release)
- [ ] Update downloads, installs, relaunches with license **intact**
- [ ] Update declined/postponed → app keeps working, re-prompts sanely
- [ ] Rollback story documented if an update ships broken

## 6. Uninstall & privacy

- [ ] Uninstall (drag to Trash) leaves no background processes
- [ ] License deactivation / "sign out" flow clears the local key
- [ ] No PDFs or personal data remain in app containers after
      data wipe (spot-check `~/Library/Application Support/…`)

## 7. Support & polish

- [ ] In-app "Contact support" opens the right channel with diagnostics
      attached (app version, macOS version — no PII)
- [ ] All user-facing copy reviewed (no TODOs, no lorem ipsum)
- [ ] Crash reporter (if any) sends a test crash successfully

## Results log

| Date | Tester | macOS | Chip | Build | Pass/Fail | Notes / issue links |
|------|--------|-------|------|-------|-----------|---------------------|
|      |        |       |      |       |           |                     |

Sign-off required from: engineering + Scott before any paid release.
