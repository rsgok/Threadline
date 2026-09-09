const examples = [
  { title: 'Make room for\nwhat matters.', body: 'Lead with the idea, not the interface. Give the words room to breathe, and let the product tell the rest.', takeaway: 'A quieter page. A clearer story.' },
  { title: 'Context is part\nof the work.', body: 'A saved answer is only half the story. Keep the question, the constraints, and the decision that followed.', takeaway: 'Save the reasoning, not just the result.' },
  { title: 'Start with what\nwe already know.', body: 'Bring the strongest notes into the next discussion. Use the decisions we made to shape the questions we ask next.', takeaway: 'Less recap. More forward motion.' },
];
document.querySelectorAll('[data-example]').forEach(button => {
  button.addEventListener('click', () => {
    const example = examples[Number(button.dataset.example)];
    document.querySelector('#demo-title').textContent = example.title;
    document.querySelector('#demo-title').style.whiteSpace = 'pre-line';
    document.querySelector('#demo-body').textContent = example.body;
    document.querySelector('#demo-takeaway').textContent = example.takeaway;
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
    status.textContent = 'Commands copied. Run them in your Threadline project folder.';
  } catch {
    status.textContent = 'Copy is unavailable in this browser. Select and copy the commands above.';
  }
});
