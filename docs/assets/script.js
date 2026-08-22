(() => {
  const SECTIONS = ['overview', 'quickstart', 'how-to-use', 'how-it-works', 'connection-to-ai'];

  // ── Navigation ──────────────────────────────────────────────────────────────
  function getHash() {
    const h = location.hash.replace('#', '');
    return SECTIONS.includes(h) ? h : 'overview';
  }

  function showSection(id) {
    SECTIONS.forEach(s => {
      document.getElementById('sec-' + s)?.classList.toggle('active', s === id);
    });
    document.querySelectorAll('.nav-link').forEach(el => {
      el.classList.toggle('active', el.dataset.section === id);
    });
    buildToc(id);
    document.querySelector('.content-wrap').scrollTo(0, 0);
    closeSidebar();
  }

  function navigate(id) {
    history.pushState(null, '', '#' + id);
    showSection(id);
  }

  // ── Sidebar links ────────────────────────────────────────────────────────────
  document.querySelectorAll('.nav-link[data-section]').forEach(el => {
    el.addEventListener('click', e => {
      e.preventDefault();
      navigate(el.dataset.section);
    });
  });

  window.addEventListener('popstate', () => showSection(getHash()));

  // ── Hamburger ────────────────────────────────────────────────────────────────
  const sidebar = document.querySelector('.sidebar');
  const hamburger = document.querySelector('.hamburger');
  hamburger?.addEventListener('click', () => sidebar.classList.toggle('open'));
  function closeSidebar() { sidebar?.classList.remove('open'); }
  document.addEventListener('click', e => {
    if (!sidebar.contains(e.target) && !hamburger.contains(e.target)) closeSidebar();
  });

  // ── Tabs ─────────────────────────────────────────────────────────────────────
  document.querySelectorAll('.tab-bar').forEach(bar => {
    bar.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const group = btn.closest('.tab-group');
        group.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        group.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        group.querySelector('.tab-content[data-tab="' + btn.dataset.tab + '"]')?.classList.add('active');
      });
    });
  });

  // ── Copy buttons ─────────────────────────────────────────────────────────────
  document.querySelectorAll('.copy-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const pre = btn.closest('.code-block').querySelector('pre');
      navigator.clipboard.writeText(pre.textContent).then(() => {
        btn.textContent = 'Copied!';
        btn.classList.add('copied');
        setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('copied'); }, 2000);
      });
    });
  });

  // ── Right TOC ─────────────────────────────────────────────────────────────────
  function buildToc(sectionId) {
    const toc = document.querySelector('.toc-links');
    if (!toc) return;
    toc.innerHTML = '';
    const section = document.getElementById('sec-' + sectionId);
    if (!section) return;
    const headings = section.querySelectorAll('h2, h3');
    if (headings.length === 0) { document.querySelector('.toc').style.visibility = 'hidden'; return; }
    document.querySelector('.toc').style.visibility = 'visible';
    headings.forEach(h => {
      if (!h.id) h.id = h.textContent.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const a = document.createElement('a');
      a.className = 'toc-link' + (h.tagName === 'H3' ? ' toc-h3' : '');
      a.textContent = h.textContent;
      a.dataset.target = h.id;
      if (h.tagName === 'H3') a.style.paddingLeft = '20px';
      a.addEventListener('click', () => {
        document.getElementById(h.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      toc.appendChild(a);
    });
    setupScrollSpy(section);
  }

  function setupScrollSpy(section) {
    const wrap = document.querySelector('.content-wrap');
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          document.querySelectorAll('.toc-link').forEach(l => {
            l.classList.toggle('active', l.dataset.target === entry.target.id);
          });
        }
      });
    }, { root: wrap, rootMargin: '-10% 0px -80% 0px' });
    section.querySelectorAll('h2, h3').forEach(h => observer.observe(h));
  }

  // ── Theme toggle ─────────────────────────────────────────────────────────────
  const themeBtn = document.getElementById('theme-toggle');
  themeBtn?.addEventListener('click', () => {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const next = isDark ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('mentat-theme', next);
  });

  // Sync with OS-level preference changes
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
    if (!localStorage.getItem('mentat-theme')) {
      document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
    }
  });

  // ── Init ──────────────────────────────────────────────────────────────────────
  showSection(getHash());
})();
