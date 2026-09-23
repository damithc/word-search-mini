# Word Search Mini

A simple word search for young children, made for tablets.

Each round hides one word in a 10x10 grid. The word runs left to right or top to bottom. A photo of what the word means is shown next to it.

- Tap a letter to choose it. Tap it again to unchoose it.
- Letters that are not part of the word give a small wiggle and are not chosen.
- Tap the photo or the word at the top to hear the word, followed by "Can you find ...?".
- When the whole word is found, it turns green, the word is said aloud with some praise ("Well done!"), and a picture is shown for a few seconds. Then a new word starts.

## Playing on an iPad

1. Open the game in Safari. To have the child's name included in the spoken phrases ("Well done, Sam!"), add it to the link: `https://damithc.github.io/word-search-mini/?name=Sam`.
2. Tap **Share**, then **Add to Home Screen**. Opening the game from the Home Screen icon hides the browser bars.
3. Optional: turn on **Guided Access** (Settings > Accessibility > Guided Access) to keep the iPad in the game. Triple-click the side or home button to start it.

Portrait orientation gives the biggest letters.

Phrases you have not recorded (see below) are said with the device's built-in voice. On some iPadOS versions, Safari can use a downloaded **Enhanced** or **Premium** voice (Settings > Accessibility > Spoken Content > Voices > English); on others it cannot, so recording your own voice is the reliable way to get natural speech.

If the built-in voice does not pronounce the name well, spell it the way it sounds in the link (for example `?name=Reeveen`); the name is only spoken, never shown. The name is remembered on the device, and `?name=` with nothing after it clears it.

## Recording your own voice

Press and hold the top-left corner of the game for 3 seconds to open the **Voice recordings** screen (or add `&setup` to the link in Safari). Record each word, the invitation and the praise phrases; each recording plays back so you can check it. Silence before and after is trimmed and volumes are evened out automatically.

- Recordings are stored on the device only and are never uploaded.
- Record from inside the Home Screen app if that is how the game is played, as the Home Screen app and Safari keep separate storage.
- Recording needs the `https://` address (or `localhost`); it is not available over a plain `http://` network address.
- A phrase is said in your voice only if both the word and the phrase after it are recorded; otherwise the built-in voice says the whole thing, so voices are never mixed. Once some praise phrases are recorded, only those are used.

## Changing words, pictures or timing

Edit [`js/config.js`](js/config.js). Each word in `WORDS` has a picture in `images/words/`. Speech settings are in `SPEECH`, and the spoken phrases are in `INVITE_PHRASE` and `PRAISE_PHRASES`. To use your own reward pictures, put them in `images/rewards/` and list them in `REWARD_PICTURES`.

## Running locally

The game uses JavaScript modules, so it must be served over HTTP rather than opened as a file:

```bash
python3 -m http.server 8765
```

Then open <http://localhost:8765>.

## Credits

Picture sources and licenses are listed in [CREDITS.md](CREDITS.md).
