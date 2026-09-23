# Word Search Mini

A simple word search for young children, made for tablets.

Each round hides one word in a 10x10 grid. The word runs left to right or top to bottom. A photo of what the word means is shown next to it.

- Tap a letter to choose it. Tap it again to unchoose it.
- Letters that are not part of the word give a small wiggle and are not chosen.
- When the whole word is found, it turns green and a picture is shown for a few seconds. Then a new word starts.

## Playing on an iPad

1. Open the game in Safari.
2. Tap **Share**, then **Add to Home Screen**. Opening the game from the Home Screen icon hides the browser bars.
3. Optional: turn on **Guided Access** (Settings > Accessibility > Guided Access) to keep the iPad in the game. Triple-click the side or home button to start it.

Portrait orientation gives the biggest letters.

## Changing words, pictures or timing

Edit [`js/config.js`](js/config.js). Each word in `WORDS` has a picture in `images/words/`. To use your own reward pictures, put them in `images/rewards/` and list them in `REWARD_PICTURES`.

## Running locally

The game uses JavaScript modules, so it must be served over HTTP rather than opened as a file:

```bash
python3 -m http.server 8765
```

Then open <http://localhost:8765>.

## Credits

Picture sources and licenses are listed in [CREDITS.md](CREDITS.md).
