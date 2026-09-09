const examples = [
  { image: '/assets/landing-collect.png', alt: 'Current Threadline interface: a saved conversation in the left sidebar and selectable Codex messages with the latest avatars on the right.', caption: 'Select what is worth saving. Keep the original context.' },
  { image: '/assets/landing-library.png', alt: 'Current Threadline saved-note interface with the conversation sidebar, original messages, and note actions.', caption: 'Come back to your notes. Pick up where you left off.' },
];
document.querySelectorAll('[data-example]').forEach(button => {
  button.addEventListener('click', () => {
    const example = examples[Number(button.dataset.example)];
    const screenshot = document.querySelector('#product-screenshot');
    screenshot.src = example.image;
    screenshot.alt = example.alt;
    document.querySelector('#preview-caption').firstChild.textContent = example.caption;
    document.querySelectorAll('[data-example]').forEach(item => {
      const active = item === button;
      item.setAttribute('aria-pressed', String(active));
      item.className = active ? 'primary' : 'secondary';
    });
  });
});
document.querySelector('#copy-setup').addEventListener('click', async () => {
  const status = document.querySelector('#copy-status');
  try {
    await navigator.clipboard.writeText(document.querySelector('#install-commands').textContent);
    status.textContent = 'Commands copied. Run them in Terminal to clone and set up Threadline.';
  } catch {
    status.textContent = 'Copy is unavailable in this browser. Select and copy the commands above.';
  }
});
