# 天气小课堂 · 四季漫步 v3

Open `index.html` via any static server (e.g. `python3 -m http.server` in this folder). All files local; three.js r186 vendored in `lib/` (ES modules + importmap).

## Seasons (4 buttons)
| Season | Weather | Scene | Audio |
|--------|---------|-------|-------|
| 春 SPRING / 春雨 | rain | cherry blossoms, green meadow, grey sky, striped umbrella | rain |
| 夏 SUMMER / 海风 | sunny + sea breeze | beach sand, palms, ocean, sailboat + lighthouse | wind + sunny |
| 秋 AUTUMN / 秋夜 | wind + falling leaves | orange trees, purple night sky, moon + stars | wind |
| 冬 WINTER / 冬雪 | snow | evergreen pines, snow cover, blue mountains | snow |

~2 s smooth transitions between seasons. Season badge (top-left) + 4-segment progress (top-right) match the reference UI.

## Walk + camera
Two egg walkers (milky yellow and pink) stroll side by side **left → right** along the dirt path, then teleport back left when off-screen. Short limbs, a light bounce, and a foot-planted gait with a small phase offset. The camera side-scrolls with a smooth follow so both stay in frame. Orbit drag/zoom disabled. Hint: 「点击切换季节」. Spring still carries the striped umbrella.

## Tech notes
- Rain: 14k instanced streaks; snow: 10k GPU flakes; autumn leaves: flat recolored particles; wind ribbons for summer/autumn.
- Trees: deciduous (green / blossom pink / autumn orange), palms, snow-capped pines — swapped per season.
- Keep `audio/` and `lib/` as-is from v2.
