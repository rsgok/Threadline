# First-use tour

Page headers contain titles and relevant actions, not generic feature explanations. Keep user-authored topic goals, actual status and empty states.

The native `PreparationView` presents three steps while first-use components download: collect, organize, continue. Images are bundled so the tour works before Node or the feature package is available. Step navigation is independent of installation progress. It advances every eight seconds until the final step; manual navigation stops autoplay, and reduced-motion settings disable autoplay. Completed preparation offers “开始使用”; normal launches stay silent. Failure keeps the retry action visible.

## Rebuild fictional screenshots

Run `npm run build && node scripts/capture-onboarding.mjs`. The script starts an isolated fixture server, renders the actual React UI with fictional data, and closes the browser and server. Images in `web/assets/onboarding` are copied into the native bundle by `scripts/build-mac.sh`.

## Preview without installation

Run `bash scripts/preview-onboarding.sh`, then open `dist/Threadline Tour Preview.app`. This uses the production view and fictional progress; it does not access user data or start a service. The preview menu offers downloading, ready, failure and minimum window size scenarios.

Local installation targets `~/Applications/Threadline.app`. Do not manage the copy under `/Applications`.
