# Image Arena

[中文](README.md) · English

Which image comes out on top? Turn a folder of images into a little game: compare two at a time, pick your favorite, and keep going.

**[Try the web demo](https://image-arena.noredge.chatgpt.site/)**. The Windows app also lets you move original files into folders or send unselected files to the Recycle Bin. The hosted demo may run a different version from this checkout.

## How to play

| Mode | Minimum images | What happens |
| --- | ---: | --- |
| Rank your favorites | 1 | Pick your top K images, in order |
| Single elimination | 2 | One loss knocks an image out; one winner remains |
| Winner stays | 3 | The winner faces the next image in a shuffled queue |
| Double elimination | 4 | First loss sends an image to the lower bracket; second loss knocks it out |
| Group stage | 6 | Round-robin groups, then the top two in each group advance to a knockout bracket |

Add static PNG, JPEG or WebP images. Scroll to zoom, drag to pan, link the two views, or open an image separately. On a phone, tap an image to open it and pinch to zoom. Use `A / ←` to pick left, `D / →` to pick right, and `Ctrl+Z` to undo. Disqualifying an image removes it from this round only; it doesn't delete the file.

Choose **中文** or **English** in the language control (inside **Settings** on compact screens). The choice is saved, along with light/dark mode, sound, volume and setup preferences. Existing settings keep Chinese as the default. Switching languages keeps your current match, undo history, image zoom and other settings.

Rounds are temporary. Refreshing or closing loses match progress, and images must be imported again. Downloaded JSON keeps a record of the results; it cannot restore a session. See [the full rules](docs/RULES.en.md) for byes, tiebreakers, disqualification and undo.

## Run locally

For the web app, install **Node.js 22.12 or newer**, then:

```sh
npm ci
npm run dev
```

Open `http://127.0.0.1:5173/`. For a production preview:

```sh
npm run build
npm run preview
```

Open `http://127.0.0.1:4173/`. The static web build is in `dist/`.

### Build the Windows app

The desktop target is **Windows x64**. In addition to Node.js, building requires Rust stable with the **MSVC** toolchain, Visual Studio C++ Build Tools (including a Windows SDK), and the WebView2 Runtime.

```sh
npm ci
npm run desktop:build
```

The executable is `src-tauri/target/release/image-arena.exe`. You can run that file directly. Running a built copy requires WebView2, but doesn't require Node.js or Rust. The current executable is unsigned; this build does not create an installer. `npm run desktop:dev` starts the desktop development app. `IMAGE_ARENA_TOOLCHAIN` optionally points to a portable toolchain with `cargo/bin/` and `rustup/` directories.

## Your files and privacy

- Matches run locally. The app doesn't upload your images. The web app reads images; only the Windows app can organize originals, after you choose an action and start processing.
- Destination files are never overwritten. Choose automatic numbered filenames or skip name conflicts. Recycling stops if the Windows Recycle Bin isn't available; it never falls back to permanent deletion.
- Detailed file previews are optional. Files and destinations are always checked before processing. Recycling requires an extra confirmation. Once file processing starts, match results lock.
- Match undo does not undo disk operations. Processing can partly succeed; check individual results and the local activity record. Uncertain outcomes need a manual check and are not retried automatically.
- Each session supports up to 256 images, up to 256 MiB per image and 1 GiB in total. These are input limits, not a promise that large batches will fit comfortably in memory. Start with a few images on a phone. Animated PNG/WebP, GIF and HEIC aren't supported; convert to a supported static format first.

The web and Windows apps share the React interface and tournament logic. Native file-dialog buttons and operating-system errors follow your Windows display language; the app supplies its own dialog titles and filter labels in your chosen interface language.

## Tests and license

```sh
npm test
npm run build
npm run desktop:test
```

The last command needs the Windows Rust toolchain. Cross-drive, ACL and actual Recycle Bin tests require dedicated temporary environments and are ignored by default. Browser emulation doesn't establish compatibility with every physical phone.

Image Arena is licensed under [MIT](LICENSE). See [third-party notices](THIRD_PARTY_NOTICES.txt) for dependency licenses.
