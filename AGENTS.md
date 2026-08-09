# WebTTS — Agent Instructions

> Full feature details: [README.md](README.md)

## Build & Run

```bash
npm run dev       # Vite dev server (http://localhost:5173) — HMR, local OCR + TTS runtime asset plugins
npm run build     # Production build → dist/
npm run lint      # ESLint (uses flat config: eslint.config.js)
npm run preview   # Preview dist/ locally
```

## Architecture

```
User imports book → Parser extracts metadata+TOC → IndexedDB (localforage)
  → Player extracts sentences → TTS Engine synthesizes → Read-along highlighting
  → Progress/bookmarks saved to IndexedDB
```

**Two plugin registries** — both in `src/core/` with a base class + factory pattern:

| Registry | Base Class | Registry File | Adding a new one |
|----------|-----------|---------------|------------------|
| **Parsers** | `BookParser` | `src/core/parsers/index.js` | Extend `BookParser`, implement `canParse()` + `parse()`, add to the `parsers` array |
| **TTS Engines** | `TTSEngine` | `src/core/tts/index.js` | Extend `TTSEngine`, implement `speak()`, add to the `engines` object |
| **TTS engines in registry** | — | — | `webSpeech` (System TTS), `kokoro` (Kokoro (On-device Neural)) |

**Parser return shape** (from `parse()`): `{ title, author, cover: Blob|null, toc: [{ title, href, words, spineIndex? }], spineLength, instance }`

**TTS engine interface** (`speak()`): `speak(text, options, callbacks)` where `options = { voiceId, rate, pitch, volume? }` and `callbacks = { onStart, onBoundary, onEnd, onError }`.

## Project Conventions

- **No TypeScript** — plain JavaScript with JSDoc annotations. ESLint flat config (`eslint.config.js`).
- **No state management library** — `useState()` in each component + IndexedDB persistence. No Redux, no Context.
- **Refs for async state** — `useRef()` to track playback position, prefetch state, swipe state (`swipeStart`, `isVerticalScroll`), and scroll dedup (`lastScrolledIndex`); avoids stale closure bugs.
- **CSS variable theming** — `--bg-primary`, `--bg-secondary`, `--text-primary`, `--accent-color`, `--border-color`, plus `--toast-bg-*`, `--toast-border-*`, `--toast-text-*` for toast notifications. Dark/light via `ThemeToggle`.
- **Slide-out panel pattern** — `Settings.jsx` and `BookmarkPanel.jsx` both use a 320px right-side overlay with `position: absolute; top: 0; right: 0; bottom: 0; z-index: 100`. New panels should follow this pattern.
- **Context for toasts only** — `ToastProvider` wraps the app at `App.jsx`. Components use `useToast()` to show notifications. This is the **only** React Context in the project.
- **ES modules** (`"type": "module"`) with Vite absolute imports from `src/`.
- **React Router v7** — 4 routes: `/`, `/book/:id/toc`, `/book/:id/read/:cfi`, `/test-tts`. SPA rewrite in `vercel.json`.
- **IDs are timestamps** — books identified by `Date.now().toString()`.
- **Word counting** — uniform across all parsers: `text.trim().split(/\s+/).filter(w => w.length > 0).length`. Used for reading-time estimates (200 WPM baseline × TTS rate).

## Shared UI Components

| Component | File | Purpose |
|-----------|------|---------|
| **`Skeleton`** | `src/ui/components/Skeleton.jsx` | Reusable shimmer loading placeholder. Props: `width`, `height`, `count`, `style`, `className`. |
| **`Toast`** | `src/ui/components/Toast.jsx` | Notification system. Exports `ToastProvider` (wrap app) and `useToast()` hook. `showToast(message, type)` where `type` is `'info'|'warning'|'error'`. |
| **`BookmarkPanel`** | `src/ui/components/BookmarkPanel.jsx` | Slide-out panel for managing bookmarks. Props: `bookmarks`, `currentSpineIndex`, `onNavigate`, `onDelete`, `isOpen`, `onClose`. Includes search filter. |

**When to use each**:
- Skeleton replaces all `"Loading..."` text with shimmer placeholders — use anytime a component waits for async data.
- Toast replaces `alert()` for all user-facing messages — use `showToast()` instead of `alert()`.
- BookmarkPanel is integrated in `Player.jsx` via a toggle button in the nav bar.

## Storage

[localforage](https://github.com/localForage/localForage) with 4 IndexedDB stores (see `src/core/bookStore.js`):

| Store | Key | Holds |
|-------|-----|-------|
| `books` | timestamp ID | Raw file `ArrayBuffer` |
| `metadata` | timestamp ID | `{ title, author, cover, toc, addedAt, lastProgress }` |
| `bookmarks` | timestamp ID | Array of `{ id, spineIndex, nodeIndex, text, timestamp }` |
| `settings` | string key | Any value (TTS config, theme, etc.) |

**Storage quota management** — see `src/core/quotaManager.js`:
- `getStorageEstimate()` — returns `{ usage, quota, percentUsed }` via `navigator.storage.estimate()`
- `canStoreBook(sizeBytes)` — pre-flight check with 5MB safety buffer; returns `{ ok, reason?, percentAfter }`
- `formatBytes(bytes)` — human-readable byte formatting
- `bookStore.addBook()` now catches `QuotaExceededError` and throws `{ isQuotaError: true, message }`
- Settings panel shows a storage usage progress bar + "Delete All Books" button

## Player Feature Details

**Pointer event system** (`src/ui/Player.jsx`) — unified mouse + touch handling on `.reader-content` div:
- **Tap** a sentence → plays from that index
- **Long-press** (500ms, ≤10px movement) → toggles bookmark with haptic feedback (`navigator.vibrate(50)`)
- **Swipe** left (>50px horizontal) → next sentence; swipe right → previous sentence. Vertical scroll is automatically disambiguated (deltas compared at 5px threshold). Haptic on confirmation (`navigator.vibrate(15)`)
- **Right-click / context menu** → toggles bookmark (fallback for desktop)

**Auto-scroll follow** — `playFromIndex()` scrolls the active sentence into view within the `.reader-content` container (not `window`). Uses `lastScrolledIndex` ref to avoid redundant scrolls per sentence. Chapter changes reset scroll to top.

**Chapter auto-continue** — when the last sentence of a chapter finishes the player auto-loads and starts the next chapter (tracked via `autoContinueRef`, cleared on manual navigation/stop/config change); stops at book end.

**Playback controls** — the play/pause button toggles true pause/resume: speech stops and resumes at the current sentence without losing position. A sleep timer stops playback automatically after a set duration.

**Bookmark integration** — `BookmarkPanel` slides out from right with: search filter, text expand/collapse (>120 chars), chapter-aware styling (highlighted if current chapter), delete button, empty state guidance.

**Loading skeletons** — all loading states use `<Skeleton />` with shimmer animation. Home shows 4 book card placeholders, TOC shows 6 chapter rows, Player shows 14 paragraph-lines.

## Pitfalls

1. **Two TTS engines shipped: `webSpeech` + `kokoro`** — The registry pattern in `src/core/tts/` is the extension point for new sources: extend `TTSEngine`, implement `speak()`, register in `engines`/`getAvailableEngines()`. Stale persisted configs are handled: `Settings` falls back to `webSpeech` when the stored `engineId` no longer exists, and `Player` resolves `engines[ttsConfig.engineId] || engines.webSpeech` before speaking. Kokoro emits estimated word boundaries; Web Speech boundary events remain unreliable on Firefox/Safari.
2. **IndexedDB quota** — ~50MB per origin. Large EPUBs with images can exceed it. Quota check warns on import but doesn't block; Settings shows usage bar.
3. **PDF OCR** — Native text extraction is preferred; image-only pages use lazy local English Tesseract.js OCR. Complex layouts and non-English scans remain best-effort.
4. **Web Speech API varies** — Sentence boundary events unreliable on Firefox/Safari.
5. **Parsing blocks UI** — All parsing on main thread (no Web Workers). Large books cause ~2-5s lag on import.
6. **Kokoro model storage** — The ~88MB quantized Kokoro model downloads on first use and is cached via the Cache API (transformers.js cache), subject to origin quota. It can be deleted from Settings to reclaim space.
7. **Prefetch race conditions** — `playNextRef` and `prefetchRef` track async state; be careful when modifying playback logic. Only 1 sentence is prefetched ahead (single `{ index, promise }` slot).
8. **Swipe vs scroll disambiguation** — Direction is decided at 5px movement threshold. If the user starts a swipe diagonally, the first 5px of dominant direction wins. Changing `touchAction` off `pan-y pinch-zoom` would break this.
