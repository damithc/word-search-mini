# Guide for AI agents working on Word Search Mini

This file tells AI coding agents how to work in this project: who the game is for, how it is built, what the target device demands, and how changes are tested and deployed.

## Who the game is for

The game is designed for **autistic children with a developmental level of about 5 years**. It is being field tested with one child in **Singapore**, whose favourite things include Thomas the Tank Engine. The parent (the repo owner) tests every change on an iPad before it reaches the child.

**Keep this private everywhere except this file.** Do not mention autism or any condition in the app's UI, code, code comments, README, CREDITS, commit messages, pull requests or issues. Elsewhere, describe the game only as "a simple word search for young children". This avoids stigma for the child. This file is the single, deliberate exception, so that agents understand the design goals.

**Localisation:** the game may later be adapted for other countries, but for now words and pictures are chosen for Singapore (see [Words and pictures](#words-and-pictures)). Keep country-specific content in `js/config.js` and `images/words/` so it can be swapped later.

## Design principles

These come from research on apps for autistic children and from the parent's feedback. Follow them for every change.

* **The play screen shows only the grid, the word and its picture.** No scores, timers, text instructions, menus or animations that don't serve play. Settings, the version number and other grown-up things live on the hidden settings screen.
* **Predictability over novelty.** The same action always gives the same result, with the same timing and the same look. The layout doesn't shift between rounds.
* **Calm senses.** Soft colours, no flashing, no confetti, no sudden or loud sounds. Animations are small (a gentle pop or wiggle) and respect `prefers-reduced-motion`.
* **Errorless learning.** The child cannot get stuck: tapping a letter that isn't part of the word only wiggles it and never selects it.
* **Rewards use the child's special interest.** Photos of Thomas the Tank Engine (real replica engines) are shown after each word.
* **Colour photos, not cartoons,** for word pictures. Autistic children retain words better from colour photographs.
* **Sound is started by the child** (tapping the picture, finding the word), apart from the one-minute reminder and the end-of-game phrase. Speech is slightly slow, and a pause separates the word from the phrase after it.
* **Big touch targets.** Cells are as large as the screen allows, with no dead gaps between them. Selection happens on touch-down for a quick response.
* **The child's name is only ever spoken, never shown,** because the parent may spell it phonetically to fix its pronunciation.

## How the game works

1. A round hides one word in a 10×10 grid of capital letters, running across or down, exactly once.
1. The word's letters and a photo of its meaning are shown above the grid. Tapping them says the word, then "Can you find _word_, _name_?".
1. Correct letters turn yellow (tap again to unselect). Wrong letters wiggle and stay unselected.
1. When the word is found, it turns green, and the word and a random praise phrase are said. After the praise, a Thomas photo is shown for 4 seconds, then the next word starts.
1. If the word isn't found within a minute, the word and the invitation are said once more.
1. Optional game length ("Words per game" in settings): dots under the grid show progress, and the game ends with an "All done!" screen and a Play again button. The default is unlimited.

The settings screen opens by pressing and holding the faint gear in the top-left corner for 1.5 seconds (or with `?setup` in the URL). It has the player's name, game length, "Check for updates", and voice recording of every word and phrase.

## Code layout

The game is plain HTML, CSS and JavaScript modules with no build step and no dependencies, served as static files by GitHub Pages.

* `index.html`: the play screen, reward and "All done" overlays, and the settings screen.
* `css/style.css`: all styles. Colours are CSS variables at the top. Sizes come from variables that `fitToScreen()` sets, all derived from the grid cell size.
* `js/config.js`: **all tunable content and settings**: the word list and pictures, speech settings, spoken phrases, game length choices, reward pictures and timings. Most content changes only touch this file.
* `js/game.js`: game flow (rounds, taps, praise, reward, reminder, game length), layout (`fitToScreen()`), the player's name, and settings screen wiring.
* `js/puzzle.js`: pure logic, testable in Node: grid generation (`makePuzzle`) and `ShuffleBag` (random order, every item before repeats, never the same twice in a row).
* `js/speech.js`: `Speaker`, which says sequences of parts using a recorded clip where one exists and the built-in voice otherwise.
* `js/setup.js`: the voice recording list on the settings screen.
* `js/recordings.js`: stores recordings in IndexedDB, on the device only.
* `js/version.js`: the version shown on the settings screen.
* `sw.js`: a service worker that fetches the latest files whenever online (network first) and falls back to saved copies offline.
* `images/words/`: word photos. `images/rewards/`: Thomas photos. `CREDITS.md` lists the source and license of every photo.
* `tests/check-puzzles.mjs`: checks the puzzle generator and shuffling.

Write code that matches the existing style: small named functions, `const` by default, comments that explain _why_ rather than _what_, and user-facing text in plain language.

## The target device: iPad Safari

The game is played as a Home Screen web app on an iPad. Safari there has several restrictions, each of which has already caused a bug. Keep these in mind before changing audio, storage or loading.

* **Sound must start from a tap, and the tap counts when the finger lifts.** Start speech and playback from `pointerup` or `click`, never from `pointerdown` or a timer. `speaker.say()` starts everything a sequence needs at the moment of the tap. The first plain tap of a session calls `speaker.unlock()` so that the reminder and "All done" phrase can play later without a tap.
* **Web Audio is muted when the iPad is in Silent mode, but `<audio>` elements and speech are not.** Recordings are therefore played as WAV files through a single `<audio>` element. Don't switch playback back to Web Audio.
* **Safari can't always decode its own `MediaRecorder` recordings.** Recordings are captured as raw samples (Web Audio `ScriptProcessor`), trimmed, levelled and stored as 16-bit PCM.
* **Built-in voices:** Safari often exposes only a few voices, and the list includes novelty voices ("Bubbles", "Bad News" and so on), which `speech.js` filters out. Web pages often cannot use higher-quality downloaded voices. Short words are lowercased before speaking, so they aren't spelled out.
* **The microphone needs HTTPS** (or `localhost`), so recording can't be tested on the iPad over the LAN dev server; it needs the deployed site.
* **Home Screen apps have storage separate from Safari.** Recordings and settings made in Safari don't appear in the Home Screen app, and deleting the icon erases them. Never tell the parent to delete and re-add the icon.
* **Caching:** GitHub Pages sends `Cache-Control: max-age=600`. The service worker makes each launch fetch fresh files. "Check for updates" on the settings screen reloads if `js/version.js` changed.
* **The Home Screen icon's URL can't be edited.** A `?name=` in the URL is used only when it differs from the last one seen, so the icon's fixed link doesn't undo a name changed in settings.

## Words and pictures

**Words:** everyday concrete nouns, 3 to 5 letters, that a young child in Singapore meets often. The list lives in `WORDS` in `js/config.js`, grouped by theme. Words must fit the 10×10 grid. Layout reserves room for the longest word, so longer words shrink the picture.

**Pictures:** colour photos from Wikimedia Commons with open licenses (CC0, public domain, CC BY, CC BY-SA), each credited in `CREDITS.md`. The parent's preferences, from reviewing them:

* One clear, single object (one tree, one mango), not a group or a busy scene.
* Plain and unfussy: no elaborate decoration, no fancy furniture, no distracting text or artwork.
* The Singapore version where one exists: a green SG Bus double-decker, a blue ComfortDelGro taxi, an SMRT train, a Singapore Airlines plane, an HDB lift, a Javan myna. Avoid things rarely seen in Singapore (e.g. outdoor ducks).
* Framed like the others: for example, the moon small in the sky, like the sun photo.

**Processing:** crop tightly to the subject, then resize to fit 480×320 and save as JPEG quality 85 in `images/words/<word>.jpg`. When fetching from Commons, set a descriptive `User-Agent`, pause between requests, and use only the standard thumbnail widths (e.g. 330, 960, 1280); other widths get rate limited (HTTP 429).

To add a word, add its entry to `WORDS`, its photo to `images/words/`, and a row to `CREDITS.md`, then run the tests.

## Privacy

* The child's name is set on the settings screen or via `?name=` in the link, and is stored only in the device's `localStorage`. **Never put a real name in the repo**, including code, tests, docs and commit messages.
* Voice recordings stay in the device's IndexedDB and are never uploaded.

## Running and testing

Serve the folder over HTTP. ES modules don't work from `file://`.

```bash
python3 -m http.server 8765
```

* **On the Mac:** <http://localhost:8765/?name=Sam>
* **On the iPad**, on the same Wi-Fi: `http://<Mac's LAN IP>:8765/?name=Sam`. Get the IP with `ipconfig getifaddr en0`.

Run the puzzle tests after changing words or `js/puzzle.js`:

```bash
node tests/check-puzzles.mjs
```

Tips for testing in a browser automation tool:

* Check layout at iPad sizes in both orientations: 1180×820, 820×1180, 1024×768 and 768×1024. Nothing may scroll or overflow.
* A hidden or background browser tab may never start speech or fire speech events, and throttles timers. To test speech logic, replace `window.speechSynthesis` with a stand-in that fires `end` events, rather than trusting timings from a hidden tab. Chrome's speech engine can also jam after many rapid cancels; a fresh tab fixes it.
* To test recording without a microphone, override `navigator.mediaDevices.getUserMedia` to return a `MediaStreamAudioDestinationNode` stream fed by an oscillator.
* Clear test data afterwards: IndexedDB `word-search` and the `localStorage` keys.

## Working with the parent

* After each change, **leave the dev server running and give both URLs** (Mac and iPad) so the parent can test by hand.
* **Commit locally, but don't deploy until the parent says so.** They test on the iPad first.
* **Bump `VERSION` in `js/version.js`** with every change that will be deployed, and say which version to look for. Documentation-only changes don't need a bump.
* When a request conflicts with an earlier design principle (e.g. showing something on the play screen), point out the conflict and suggest an alternative before building.
* Be honest about what couldn't be tested, especially real iPad behaviour.

## Deploying

GitHub Pages serves the `main` branch root at <https://damithc.github.io/word-search-mini/>. Pushing to `main` deploys. The build takes about a minute:

```bash
gh api repos/damithc/word-search-mini/pages/builds/latest --jq '.status + " " + .commit[0:7]'
```

After deploying, open the live site with `?setup` and check that the settings screen shows the new version.

## Commit messages

Follow the SE-EDU conventions: an imperative subject line under about 50 characters, then a body that explains the current situation, why it needs to change, and what the commit does. Again, never mention autism or the child's name.
