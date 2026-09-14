# Button inventory

The shared appearance owner is web/buttons.css. Page styles retain placement and content layout. Native macOS window controls and file pickers retain system styling.

| Scenario | Controls | Rule |
| --- | --- | --- |
| Navigation | Collect conversations / My thoughts, workspace tabs, thought links | 36px height, 13px medium text, 18px icons, pale green selected row |
| Primary | Create thought, save note, collect selection, copy for AI, Feishu bind/authorize/send | 32px minimum height, 12px medium text, pale green fill, no shadow |
| Secondary | Secondary actions, use-note, open-in-runtime, Feishu search/permission checks/recipient trigger | Neutral thin border; same size and typography as primary |
| Quiet utility | Edit/export/refresh/back/manual add/expand/manage thoughts/view original | Transparent; soft hover; inline variants 28px minimum |
| Icon utility | Search, sidebar toggle, toolbar export/menu, mobile navigation | 28px square, 17px icon, neutral hover |
| Content selection | session-choice, native-note, thread-card, thinking-choice, note-open, image-preview | Preserve content hierarchy; thin neutral border where applicable; no hard shadow or transform |
| Menus and segments | More menu, Feishu recipient options, private/group switch, card theme picker | Quiet rows and pale green selected state |
| Destructive | Delete note, disconnect Feishu | Muted red text and light red hover |
| Inline references | File links and annotations | Text action, no raised button appearance |
| Notifications | Notification close | Small control retaining status layout, no shadow |

Pointer clicks do not add focus rings. Tab/arrow navigation retains visible focus. Disabled primary actions use muted fill/text; other disabled controls use reduced opacity. Coarse pointers get at least 40px targets.

The shared stylesheet explicitly overrides old page-specific appearance rules to prevent earlier yellow/blue fills, heavy weights and hard shadows from resurfacing. New controls should reuse the scenario classes above, rather than adding page-specific variants.

## Selection controls

`web/buttons.css` also owns select, checkbox, switch, dropdown menu and segmented-control appearance. Native select semantics are retained for keyboard navigation and platform option pickers; the closed control uses a shared 36px shell (40px for coarse pointers), chevron, muted green border and visible keyboard focus. Do not add page-specific control palettes.

Use `role="switch"` on a checkbox only for an on/off setting, such as including progress messages. Selection checkboxes remain checkboxes. Switches use a green track and moving thumb, respect reduced motion, and keep native controls in forced-colors mode. Segmented choices retain their existing `aria-pressed` state.

Settings sections and note details use spacing and quiet disclosure surfaces instead of stacked horizontal borders. Note Markdown separators retain their semantic position as whitespace; source text and exported Markdown are unchanged.
