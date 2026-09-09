# Modal implementation contract

Existing owners: `web/threadline.css` (Shared modal system), `Modal` in `app/components/modal.tsx`, `setupModal()` in `app/lib/modal.ts`, and `web/buttons.css` (button appearance)

New dialogs must use the existing surface and content structure:

```html
<dialog>
  <div class="dialog-inner">
    <div class="dialog-head"><h2>Title</h2><!-- utility actions --></div>
    <p class="dialog-hint">Context</p>
    <label class="field-label">Field</label>
    <!-- fields and content -->
    <p class="dialog-error"></p>
    <div class="dialog-bottom"><!-- secondary and primary actions --></div>
  </div>
</dialog>
```

- Use the shared React `Modal` component, which calls `setupModal(dialog, { canDismiss, dismiss })`; it adds `modal-surface` and provides backdrop/Escape dismissal behavior
- Do not add the legacy `compact-dialog` class to new dialogs
- Shared styles own centering, viewport margins, radius, backdrop, padding, typography, fields, keyboard focus and action appearance
- Set `--modal-width` only when the content needs a different width; default is 560px. Do not introduce another width variable or override the surface geometry
- The modal shell must not display a scrollbar. Keep scrolling available for long content via wheel, trackpad, touch and keyboard; hide the shell scrollbar using shared CSS, not `overflow: hidden`. Nested content areas retain their own scrolling rules
- Put content inside `dialog-inner`; the outer surface intentionally has zero padding
- Use `tool`, `secondary`, `primary` and other existing button scenario classes. Extend selected-segment selectors in `buttons.css`, not a page-specific palette
- Page CSS may arrange content but should not replace modal or control appearance. Do not add negative-offset sticky actions inside the scrolling body
- Keep the existing viewport adaptation and dismissal guards. Closing a dialog must not navigate the underlying page or reset its selection
- Verify the actual rendered dialog, including spacing, long-content scrolling, shared selected states and close behavior, rather than relying only on API tests

Sharing and sharing history follow this structure; `web/sharing.css` contains content layout only
