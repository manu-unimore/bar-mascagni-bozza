(() => {
  'use strict';

  const root = document.documentElement;
  const is3d = root.classList.contains('is-3d');
  const calmo = root.classList.contains('calmo');
  const K = 1; // unità Z per pixel di scroll
  const sections = [...document.querySelectorAll('.ch')];
  const chapters = sections.map((el) => ({
    id: el.id,
    title: el.querySelector('h1, h2').textContent.replace(/\s+/g, ' ').trim(),
    hour: el.dataset.hour,
    z: Number(el.dataset.z),
    el,
  }));
  const navLinks = [...document.querySelectorAll('.index a, .brand, .torna a')];
  const byId = (id) => chapters.find((c) => c.id === id);

  let goTo;

  /* ---------- Foto in primo piano (anche nella versione piatta) ---------- */
  const luce = document.querySelector('#luce');
  if (luce && typeof luce.showModal === 'function') {
    const lImg = luce.querySelector('img');
    const lTesto = luce.querySelector('.luce-testo');
    let origine = null;
    document.querySelectorAll('.photo .zoom').forEach((b) => b.addEventListener('click', () => {
      const img = b.querySelector('img');
      lImg.src = img.currentSrc || img.src;
      lImg.alt = img.alt;
      lTesto.textContent = img.alt;
      origine = b;
      luce.showModal();
      luce.querySelector('.luce-chiudi').focus();
    }));
    luce.querySelector('.luce-chiudi').addEventListener('click', () => luce.close());
    luce.addEventListener('click', (e) => { if (e.target === luce) luce.close(); });
    // il focus torna alla foto, senza far muovere la camera
    luce.addEventListener('close', () => { if (origine) origine.focus({ preventScroll: true }); });
  }

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
  const PERSP = 1000; // distanza dell'osservatore in px
  const narrowMq = matchMedia('(max-width: 760px)');
  const fineMq = matchMedia('(hover: hover) and (pointer: fine)');
  const world = document.querySelector('.world');
  const velo = document.querySelector('.velo');
  const chiusura = document.querySelector('.chiusura');
  const ingresso = document.querySelector('.ingresso');
  const mappa = document.querySelector('.mappa');
  const barra = document.querySelector('.avanzamento i');
  const themeMeta = document.querySelector('meta[name="theme-color"]');
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
        // cornici sulle pareti: rotazione con la sua prospettiva, nello stesso transform
        rot: d.ry ? ` perspective(${PERSP}px) rotateY(${d.ry}deg)` : '',
        far: kind === 'copy' ? 1000 : kind === 'deco' ? 900 : 1500,
        back: kind === 'deco' ? 700 : 320,
        o: -1, live: false,
      });
    });
  });

  let narrow = narrowMq.matches;
  let cam = 0;
  let target = 0;
  let vx = 0, vy = 0, tvx = 0, tvy = 0; // punto di fuga (vw, vh) e suo obiettivo
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
      // Prospettiva calcolata a mano: scala e spostamento verso il punto di fuga
      const s = PERSP / (PERSP + dz);
      const tx = x * s + vx * (1 - s);
      const ty = y * s + vy * (1 - s);
      p.el.style.transform = `translate(-50%,-50%) translate(${tx.toFixed(3)}vw,${ty.toFixed(3)}vh) scale(${s.toFixed(4)})${p.rot}`;
      p.el.style.opacity = o.toFixed(3);
      p.o = o;
      // ordine di profondità: aggiornato solo quando cambia davvero
      const zi = 5000 - Math.round(dz / 20) * 20;
      if (p.zi !== zi) { p.zi = zi; p.el.style.zIndex = zi; }
      const live = p.kind === 'copy' ? o > 0.5 && d > -140 && d < 460
        : p.kind === 'photo' && o > 0.6 && d > -140 && d < 720;
      if (live !== p.live) {
        p.live = live;
        p.el.classList.toggle('is-live', live);
      }
    }

    // Mappa: avvicinandosi a "visita" parte ingrandita sulla via e si allarga
    if (mappa) {
      let u = (cam - (lastZ - 1100)) / 1100;
      u = Math.min(Math.max(u, 0), 1);
      const zoom = 1 + (1 - u) * (1 - u) * 3.2;
      if (mappa._z === undefined || Math.abs(mappa._z - zoom) > 0.01 || (zoom === 1 && mappa._z !== 1)) {
        mappa._z = zoom;
        mappa.style.setProperty('--zoom', zoom.toFixed(3));
      }
    }

    if (barra) {
      const v = Math.min(Math.max(cam / lastZ, 0), 1);
      if (barra._v !== v) { barra._v = v; barra.style.transform = `scaleX(${v.toFixed(4)})`; }
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

    // Vetro appannato: solo opacità, al centro del passaggio
    if (velo && velo._t !== t) {
      velo._t = t;
      const v = next ? Math.pow(Math.sin(Math.PI * t), 1.5) * 0.75 : 0;
      velo.style.opacity = v.toFixed(3);
      velo.style.visibility = v > 0.01 ? 'visible' : 'hidden';
    }

    // Chiusura: arrivati a "visita" l'insegna compare per un paio di secondi
    if (chiusura && !calmo) {
      if (cam >= lastZ - 2 && !chiusura._fatto) {
        chiusura._fatto = true;
        chiusura.classList.add('on');
        clearTimeout(chiusura._t);
        chiusura._t = setTimeout(() => chiusura.classList.remove('on'), 2000);
      } else if (cam < lastZ - 60) {
        chiusura.classList.remove('on');
        if (cam < lastZ - 400) chiusura._fatto = false;
      }
    }

    // Insegna sul vetro d'ingresso: svanisce nei primi passi
    if (ingresso) {
      const e = Math.max(0, 1 - cam / 380);
      if (ingresso._e !== e) {
        ingresso._e = e;
        ingresso.style.opacity = e.toFixed(3);
        ingresso.style.visibility = e ? 'visible' : 'hidden';
        ingresso.style.transform = `scale(${(1 + (1 - e) * 0.3).toFixed(3)})`;
      }
    }

    let near = 0;
    chapters.forEach((c, j) => { if (Math.abs(c.z - cam) < Math.abs(chapters[near].z - cam)) near = j; });
    if (near !== current) setChapter(near, current !== -1);
  }

  function setChapter(i, animate) {
    current = i;
    const ch = chapters[i];
    root.dataset.tone = ch.id;
    if (themeMeta) themeMeta.setAttribute('content', getComputedStyle(root).getPropertyValue('--sky-a').trim());
    navLinks.forEach((a) => {
      if (!a.closest('.index')) return;
      if (a.getAttribute('href') === `#${ch.id}`) a.setAttribute('aria-current', 'step');
      else a.removeAttribute('aria-current');
    });
    setClock(ch.hour, animate && !calmo);
  }

  // Orologio a palette: ogni casella passa per qualche cifra a caso prima di fermarsi
  function setClock(hour, animate) {
    clock.setAttribute('aria-label', `Ora del capitolo: ${hour}`);
    const chars = [...String(hour).replace(':', '')].slice(-flaps.length);
    const digits = [...Array(flaps.length - chars.length).fill('0'), ...chars];
    flaps.forEach((el, k) => {
      const nv = digits[k];
      const ov = el.dataset.v;
      if (nv === ov) return;
      el.dataset.v = nv;
      const nodes = [...el.children];
      const [top, bottom, flipTop, flipBottom] = nodes;
      const put = (node, v) => { node.firstElementChild.textContent = v; };
      const token = (el._token || 0) + 1;
      el._token = token;
      if (!animate) {
        nodes.forEach((n) => put(n, nv));
        el._shown = nv;
        el.classList.remove('go');
        return;
      }
      const seq = [];
      const giri = 2 + Math.floor(Math.random() * 3);
      for (let n = 0; n < giri; n++) seq.push(String(Math.floor(Math.random() * 10)));
      seq.push(nv);
      let shown = el._shown ?? ov;
      const step = (n) => {
        if (el._token !== token) return;
        const v = seq[n];
        const ultimo = n === seq.length - 1;
        put(top, v); put(bottom, shown); put(flipTop, shown); put(flipBottom, v);
        el.style.setProperty('--dur', ultimo ? '.2s' : '.07s');
        el.style.setProperty('--delay', n === 0 ? `${k * 0.06}s` : '0s');
        el.classList.remove('go');
        void el.offsetWidth;
        el.classList.add('go');
        flipBottom.addEventListener('animationend', () => {
          if (el._token !== token) return;
          shown = v;
          el._shown = v;
          nodes.forEach((m) => put(m, v));
          el.classList.remove('go');
          if (!ultimo) step(n + 1);
        }, { once: true });
      };
      step(0);
    });
  }

  function tick(now) {
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    // Decadimento esponenziale: stesso movimento a 30, 60 o 120 fps
    cam += (target - cam) * (1 - Math.exp(-dt * 5.5));
    if (Math.abs(target - cam) < 0.4) cam = target;
    const k = 1 - Math.exp(-dt * 3);
    vx += (tvx - vx) * k;
    vy += (tvy - vy) * k;
    if (Math.abs(tvx - vx) < 0.01 && Math.abs(tvy - vy) < 0.01) { vx = tvx; vy = tvy; }
    render();
    if (cam !== target || vx !== tvx || vy !== tvy) {
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

  // Luce del cursore sulle foto e prospettiva che si inclina appena (solo mouse)
  let mx = 0.5, my = 0.5, lightRaf = 0;
  addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' || !fineMq.matches || calmo) return;
    mx = e.clientX / innerWidth;
    my = e.clientY / innerHeight;
    if (!lightRaf) lightRaf = requestAnimationFrame(() => {
      lightRaf = 0;
      world.style.setProperty('--mx', mx.toFixed(3));
      world.style.setProperty('--my', my.toFixed(3));
      tvx = (mx - 0.5) * 6;
      tvy = (my - 0.5) * 4;
      wake();
    });
  }, { passive: true });

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
    if (luce && luce.open) return;
    const sec = e.target.closest && e.target.closest('.ch');
    if (!sec) return;
    const ch = byId(sec.id);
    if (ch && Math.abs(ch.z - target) > 1) goTo(ch.id);
  });

  addEventListener('hashchange', () => goTo(decodeURIComponent(location.hash.slice(1))));

  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  layout();
  const start = byId(decodeURIComponent(location.hash.slice(1)));
  // chi apre direttamente #visita non deve vedere l'insegna di chiusura
  if (chiusura && start && start.z === lastZ) chiusura._fatto = true;
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
