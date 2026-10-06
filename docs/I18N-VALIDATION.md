# Chinese / English validation

This change starts from public main `6e0406bf9068c4649930c980e7e9d9a6cca6caf4` and is limited to bilingual presentation, language preferences, stable phase metadata, documentation and the associated checks.

## Implementation

- Shared Chinese source sentences and English messages live in `src/i18n/`. Interpolation keeps filenames, paths and IDs opaque. Native diagnostics and existing notices are translated when displayed, so they can follow a language change.
- `language: "zh" | "en"` uses the existing version-1 settings record. Missing or invalid language values use Chinese. Other valid preferences survive migration; match data is not added to settings.
- Engine phase IDs identify the upper/lower bracket, grand final, reset final, groups, ties and ranking places. Music and match hints use these IDs. Labels no longer control those behaviors. JSON keys and existing mode/status/algorithm values stay stable; readable decision labels and notes use the selected language.
- The native image picker, folder picker, save dialog titles and filter labels receive the selected language explicitly. The window title updates separately. Windows supplies its own dialog buttons and system error strings.
- Language changes do not recreate a session, image viewport, sound engine or organization plan.

## Completed checks (2026-10-06)

| Check | Result |
| --- | --- |
| `npm test` | 22 files, 106 tests passed |
| `npm run build` | Production web build passed |
| `npm run build:desktop-ui` | Shared desktop React build passed |
| `npm run desktop:test` | 21 native tests passed; 3 special tests ignored by default |
| Actual Recycle Bin, disposable generated sample | Passed separately |
| ACL-denied destination, disposable temporary directory | Passed separately; temporary ACL restored |
| Actual cross-volume move, synthetic bytes from C: to a new dedicated D: test folder | Passed separately; byte comparison and source removal checked; empty test folder removed |
| `npm run desktop:build` | Windows x64 executable built in the isolated target directory |
| Browser flow | 30 assertions passed using an isolated Edge profile and generated images |

Browser coverage includes legacy Chinese settings, English persistence, unchanged independent preferences, English import failures, all five modes through results, pre-match/mid-match/result language changes, pair and zoom retention, undo after a vote and after disqualifying both images, an English viewer, no-selection results, actual JSON download, unchanged Chinese filenames, and no external image requests or runtime exceptions. Layout was checked at 320×568, 390×844, 844×390 and 1366×900, with visual inspection of screenshots. File-organizer English rendering also covers ready, moved, kept, skipped, cancelled, failed, copied, review and recycled states using isolated plans in unit tests.

Reproduce the browser check on Windows:

```sh
npm run build
npm run preview -- --port 4186
# In a second terminal:
node scripts/check-i18n-browser.mjs
```

Optional environment variables: `IMAGE_ARENA_TEST_URL`, `IMAGE_ARENA_TEST_CDP_PORT`, and `IMAGE_ARENA_BROWSER` (path to a Chromium-compatible executable). Evidence is written under the ignored `validation/i18n/` directory. The script creates a fresh browser profile, generated fixtures and a fresh download directory for each run.

Screenshot capture is supporting evidence, separate from functional assertions. The Edge screenshot endpoint intermittently timed out in this environment; any unavailable captures are listed in `captureWarnings` in the proof JSON. Screenshots from completed captures were inspected, and layout assertions check the actual DOM geometry independently.

## Limits

No physical phone was used in this pass. Native dialog titles/filter selection and the new IPC capability were covered by unit/adapter checks and a complete native build; the actual Windows dialogs were not visually driven. OS-owned labels and error details follow Windows' display language. The rebuilt executable was neither installed nor launched against production settings. The public Site was not changed; its known v5 source differs from the repository and needs a deliberate integration review.

The older main checkout's uncommitted PNG changes were kept outside this branch. No desktop stress tests or unrelated performance changes were run or incorporated.
