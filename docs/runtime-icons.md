# Message avatars

The message header uses the conversation Runtime to choose a locally served generated avatar. On 2026-09-10, the Runtime avatars were restyled to match the user avatar: sage rounded tiles, ivory matte relief, matching margins and 256 × 256 pixel assets. These are custom illustrations, not official unmodified brand assets. The original brand references were retrieved on 2026-09-09:

- Codex: the OpenAI-published [Codex extension](https://marketplace.visualstudio.com/items?itemName=openai.chatgpt), [official icon asset](https://openai.gallerycdn.vsassets.io/extensions/openai/chatgpt/26.5903.61454/1788916118410/Microsoft.VisualStudio.Services.Icons.Default)
- Cursor: [official brand assets](https://cursor.com/brand), `Avatars/Square/PNG/AVATAR_SQUARE_2D_LIGHT.png` from its linked brand archive
- User: an original generated illustration, reduced to 256 pixels for the message header

Files live in `web/assets/`. The avatar is decorative; the adjacent text identifies the speaker and Runtime. The header is a keyboard-operable toggle button with `aria-pressed`; message bodies remain selectable independently.
