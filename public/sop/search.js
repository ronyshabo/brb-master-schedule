// Search bar for the SOP page. A separate file because the site's CSP blocks inline scripts.
(() => {
  const form = document.getElementById('search');
  const input = document.getElementById('search-input');
  const count = document.getElementById('search-count');
  const prev = document.getElementById('search-prev');
  const next = document.getElementById('search-next');
  const content = document.querySelector('.wrap');
  let marks = [];
  let current = -1;
  let searched = '';
  let timer;

  function clear() {
    for (const mark of marks) {
      const parent = mark.parentNode;
      mark.replaceWith(...mark.childNodes);
      parent.normalize();
    }
    marks = [];
    current = -1;
  }

  function go(index) {
    if (!marks.length) return;
    marks[current]?.classList.remove('current');
    current = (index + marks.length) % marks.length;
    marks[current].classList.add('current');
    marks[current].scrollIntoView({ block: 'center' });
    count.textContent = `${current + 1} of ${marks.length}`;
  }

  function search() {
    clear();
    const term = input.value.trim().toLowerCase();
    searched = term;
    if (term.length >= 2) {
      const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT, {
        acceptNode: (node) => node.parentElement.closest('.topbar, style, script') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
      });
      const nodes = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);
      for (let node of nodes) {
        let at;
        while ((at = node.data.toLowerCase().indexOf(term)) !== -1) {
          const hit = node.splitText(at);
          node = hit.splitText(term.length);
          const mark = document.createElement('mark');
          hit.replaceWith(mark);
          mark.append(hit);
          marks.push(mark);
        }
      }
    }
    prev.disabled = next.disabled = marks.length < 2;
    count.textContent = term.length >= 2 && !marks.length ? 'No matches' : '';
    go(0);
  }

  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(search, 200);
  });
  // Enter steps to the next match (Shift+Enter goes back); Esc clears.
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    clearTimeout(timer);
    if (input.value.trim().toLowerCase() !== searched) search();
    else go(current + 1);
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && event.shiftKey) {
      event.preventDefault();
      go(current - 1);
    } else if (event.key === 'Escape') {
      input.value = '';
      search();
    }
  });
  prev.addEventListener('click', () => go(current - 1));
  next.addEventListener('click', () => go(current + 1));
})();
