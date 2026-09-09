# Threadline contributor instructions

## UI conventions

Before adding or changing dialogs or controls, read `docs/modal-system.md` and `docs/button-inventory.md`. Reuse the existing shared modal structure, dismissal helper and button styles; page CSS should own content layout only. Verify the rendered dialog as well as functional checks.

The modal shell must not display a scrollbar. Preserve long-content scrolling and apply this rule through the shared modal stylesheet.
