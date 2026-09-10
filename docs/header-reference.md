# Header reference measurements

Measured from the two user-provided Codex screenshots on 2026-09-11:

- Collapsed: `codex-clipboard-58786fac-6a46-4338-adff-784f6778ed89.png`
- Expanded: `codex-clipboard-0cbbc071-0a0a-4c0d-8dfb-ffe05ee0eabe.png`

Both original PNG files are 3560 × 2324 pixels with approximately 144 DPI metadata (2 physical pixels per macOS point). Ignore the black margin: the window occupies [112, 76, 3448, 2176), or 1668 × 1050 points. Coordinates below are relative to that window, not the image or screen. Pixel centers are measured using pixel-cell centers.

| Element | Expanded | Collapsed | Evidence |
| --- | --- | --- | --- |
| Header height | 46 pt | 46 pt | Window top y=76; divider at y=168, a 92-pixel difference |
| Header centerline | y=23 pt | y=23 pt | Native circles and icons centered at image y=122 |
| Traffic-light diameter | 14 pt | 14 pt | Each colored circle occupies 28 × 28 pixels |
| Traffic-light centers | x=23,46,69 pt | x=23,46,69 pt | Image centers x=158,204,250 |
| Traffic-light center spacing | 23 pt | 23 pt | 46 physical pixels |
| Sidebar-toggle visible icon | 13 × 12 pt | 13 × 12 pt | Dark pixels x=303…328, y=110…133 |
| Sidebar-toggle center | x=102,y=23 pt | x=102,y=23 pt | Visible bounds unchanged |
| Left sidebar width including separator | 266.5 pt | 0 | Sidebar x=112…643; separator x=644 |
| Folder icon center | x=288,y=23 pt | x=180.5,y=23 pt | Icon x=675…700 or 460…485 |
| First visible title glyph | x=308.5 pt | x=201 pt | First dark glyph pixel x=729 or 514 |
| Title visible glyph height | 13 pt | 13 pt | Dark pixels y=109…134 |
| Title font size | approximately 14 pt | approximately 14 pt | Inferred from glyphs, not obtained from source/CSS |
| Share-label visible glyph height | 11.5 pt | 11.5 pt | Dark pixels y=111…133 |
| Share-label font size | approximately 14 pt | approximately 14 pt | Glyph size and font size are not interchangeable |
| Toggle blue focus outline | 26 × 26 pt | not active in this shot | Outer blue pixels x=290…341,y=96…147; not proof of hit-target size |

The title's glyph shapes, height, and width are identical between states; the visible title shifts left by 107.5 pt. Font family, exact CSS font weight/line height, and invisible click target dimensions cannot be read reliably from these raster images. The sidebar's Codex brand label is a separate, larger text role, approximately 18 pt; it is not the header title.

The reference changes the navigation contents when collapsed: the back/forward pair is replaced with a compose control. Threadline must retain its always-present back/forward controls as explicitly requested earlier; do not remove them merely to copy this screenshot. Accordingly, matching header metrics does not imply every horizontal item position or action is identical.

Threadline uses a 46-pixel CSS chrome row, 14-pixel title font, native button centers (23,23), (46,23), (69,23), and a toggle center at (102,23) in native mode. Keep native and web geometry synchronized; sidebar resizing remains user-controlled. The header divider only spans the right pane and stays subtle.

## Shared page layout

All desktop route titles render once through `WindowHeading` in the 46px window header, using 14px/20px system sans, weight 500. On narrow screens and panel surfaces they remain in the page, using 20px/1.4, weight 500. Page content uses `--page-gutter`: 20px on desktop, 16px on narrow/panel surfaces. Collection, library, thoughts, note reading/editing and settings share this inset; page containers do not add individual centering/max-width rules. Card padding remains independent.

Application-wide actions (open runtime, sharing history) live in the application menu; collection details supply their own combined conversation menu. Do not duplicate these in the page body. Page-specific actions such as editing, adding notes and filtering stay beside the relevant content.
