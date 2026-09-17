(() => {
  'use strict';

  const root = document.documentElement;
  const is3d = root.classList.contains('is-3d');
  const K = 1; // unità Z per pixel di scroll
  const sections = [...document.querySelectorAll('.ch')];
  const chapters = sections.map((el) => ({
    id: el.id,
    title: el.querySelector('h1, h2').textContent.replace(/\s+/g, ' ').trim(),
    hour: el.dataset.hour,
    z: Number(el.dataset.z),
    el,
  }));
  const navLinks = [...document.querySelectorAll('.index a, .brand')];
  const byId = (id) => chapters.find((c) => c.id === id);

  let goTo;

  if (!is3d) {
    goTo = (id, { instant = false } = {}) => {
      const ch = byId(id);
      if (!ch) return false;
      ch.el.scrollIntoView({ behavior: instant ? 'auto' : 'smooth', block: 'start' });
      return true;
    };
    expose();
    return;
  }

  /* ---------- Profondità ---------- */
  const spacer = document.querySelector('.spacer');
  const skies = [...document.querySelectorAll('.sky')];
  const clock = document.querySelector('.clock');
  const flaps = [...clock.querySelectorAll('.flap')];
  const narrowMq = matchMedia('(max-width: 760px)');
  const lastZ = chapters[chapters.length - 1].z;

  const planes = [];
  chapters.forEach((ch) => {
    ch.el.querySelectorAll('.plane').forEach((el) => {
      const d = el.dataset;
      const kind = el.classList.contains('deco') ? 'deco' : el.classList.contains('copy') ? 'copy' : 'photo';
      planes.push({
        el, kind,
        z: ch.z + Number(d.dz || 0),
        x: Number(d.x || 0), y: Number(d.y || 0),
        xm: Number(d.xm ?? d.x ?? 0), ym: Number(d.ym ?? d.y ?? 0),
        rot: d.ry ? ` rotateY(${d.ry}deg)` : '',
        far: kind === 'copy' ? 1000 : kind === 'deco' ? 900 : 1500,
        back: kind === 'deco' ? 700 : 320,
        o: -1, live: false,
      });
    });
  });

  let narrow = narrowMq.matches;
  let cam = 0;
  let target = 0;
  let current = -1;
  let raf = 0;
  let last = 0;

  function layout() {
    narrow = narrowMq.matches;
    spacer.style.height = `${lastZ / K + innerHeight}px`;
  }

  function opacityFor(p, d) {
    if (d < 0) return Math.max(0, 1 + d / p.back);
    if (d < 180) return 1;
    return Math.max(0, 1 - (d - 180) / p.far);
  }

  function render() {
    for (const p of planes) {
      const d = p.z - cam;
      const o = opacityFor(p, d);
      if (o === 0 && p.o === 0) continue;
      const dz = Math.min(Math.max(d, -p.back - 80), 4200);
      const x = narrow ? p.xm : p.x;
      const y = narrow ? p.ym : p.y;
      p.el.style.transform = `translate(-50%,-50%) translate3d(${x}vw,${y}vh,${-dz}px)${p.rot}`;
      p.el.style.opacity = o.toFixed(3);
      p.o = o;
      const live = p.kind !== 'deco' && o > 0.5 && d > -140 && d < 460;
      if (live !== p.live) {
        p.live = live;
        p.el.classList.toggle('is-live', live);
      }
    }

    // Cielo: dissolvenza tra l'ora corrente e la successiva a metà tragitto
    let i = 0;
    while (i < chapters.length - 1 && cam >= chapters[i + 1].z) i++;
    const next = chapters[i + 1];
    let t = next ? (cam - chapters[i].z) / (next.z - chapters[i].z) : 0;
    t = Math.min(Math.max((t - 0.2) / 0.6, 0), 1);
    t = t * t * (3 - 2 * t);
    skies.forEach((s, j) => {
      const v = j === i ? 1 : j === i + 1 ? t : 0;
      if (s._o !== v) { s.style.opacity = v; s._o = v; }
    });

    let near = 0;
    chapters.forEach((c, j) => { if (Math.abs(c.z - cam) < Math.abs(chapters[near].z - cam)) near = j; });
    if (near !== current) setChapter(near, current !== -1);
  }

  function setChapter(i, animate) {
    current = i;
    const ch = chapters[i];
    root.dataset.tone = ch.id;
    navLinks.forEach((a) => {
      if (a.classList.contains('brand')) return;
      if (a.getAttribute('href') === `#${ch.id}`) a.setAttribute('aria-current', 'step');
      else a.removeAttribute('aria-current');
    });
    setClock(ch.hour, animate);
  }

  function setClock(hour, animate) {
    clock.setAttribute('aria-label', `Ora del capitolo: ${hour}`);
    const digits = hour.replace(':', '').split('');
    flaps.forEach((el, k) => {
      const nv = digits[k];
      const ov = el.dataset.v;
      if (nv === ov) return;
      el.dataset.v = nv;
      const [top, bottom, flipTop, flipBottom] = el.children;
      const put = (node, v) => { node.firstElementChild.textContent = v; };
      if (!animate) {
        [top, bottom, flipTop, flipBottom].forEach((n) => put(n, nv));
        return;
      }
      put(top, nv); put(bottom, ov); put(flipTop, ov); put(flipBottom, nv);
      el.style.setProperty('--delay', `${k * 0.07}s`);
      el.classList.remove('go');
      void el.offsetWidth;
      el.classList.add('go');
      flipBottom.addEventListener('animationend', () => {
        const v = el.dataset.v;
        [top, bottom, flipTop, flipBottom].forEach((n) => put(n, v));
        el.classList.remove('go');
      }, { once: true });
    });
  }

  function tick(now) {
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    // Decadimento esponenziale: stesso movimento a 30, 60 o 120 fps
    cam += (target - cam) * (1 - Math.exp(-dt * 5.5));
    if (Math.abs(target - cam) < 0.4) cam = target;
    render();
    if (cam !== target) {
      raf = requestAnimationFrame(tick);
    } else {
      raf = 0;
      const id = chapters[current].id;
      if (Math.abs(chapters[current].z - cam) < 60 && location.hash !== `#${id}`) {
        history.replaceState(null, '', `${location.pathname}${location.search}#${id}`);
      }
    }
  }

  function wake() {
    if (raf) return;
    last = performance.now();
    raf = requestAnimationFrame(tick);
  }

  goTo = (id, { instant = false } = {}) => {
    const ch = byId(id);
    if (!ch) return false;
    target = ch.z;
    window.scrollTo({ top: ch.z / K, behavior: 'instant' });
    if (instant) {
      cam = target;
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      render();
    } else {
      wake();
    }
    return true;
  };

  addEventListener('scroll', () => {
    target = Math.min(Math.max(scrollY * K, 0), lastZ);
    wake();
  }, { passive: true });

  addEventListener('resize', () => {
    layout();
    target = Math.min(scrollY * K, lastZ);
    for (const p of planes) p.o = -1;
    render();
  });

  navLinks.forEach((a) => a.addEventListener('click', (e) => {
    const id = a.getAttribute('href').slice(1);
    if (!byId(id)) return;
    e.preventDefault();
    goTo(id);
    history.replaceState(null, '', `#${id}`);
  }));

  // Tastiera: l'elemento che riceve il focus viene portato davanti alla camera
  document.addEventListener('focusin', (e) => {
    const sec = e.target.closest && e.target.closest('.ch');
    if (!sec) return;
    const ch = byId(sec.id);
    if (ch && Math.abs(ch.z - target) > 1) goTo(ch.id);
  });

  addEventListener('hashchange', () => goTo(location.hash.slice(1)));

  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  layout();
  const start = byId(decodeURIComponent(location.hash.slice(1)));
  if (start) goTo(start.id, { instant: true });
  else { window.scrollTo(0, 0); render(); }

  expose();

  function expose() {
    window.panta = {
      chapters: chapters.map(({ id, title, hour, z }) => ({ id, title, hour, z })),
      goTo,
    };
  }
})();
