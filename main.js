(() => {
  'use strict';
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const root = document.documentElement;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;

  /* Número de WhatsApp del club (formato internacional, sin + ni espacios) */
  const WHATSAPP = '5490000000000';
  /* URL de la app web de Google Apps Script (ver Code.gs). Vacío = vista de demostración */
  const API = '';

  /* ---------- Imágenes: data-img="carpeta/nombre" → img/carpeta/nombre.(webp|jpg|png…) ----------
     Ejemplos: data-img="padel/hero"      → img/padel/hero.webp
               data-img="principal/hero"  → img/principal/hero.webp
     Si usás un solo formato, dejá solo ese en EXTS y evitás pedidos de más. */
  const IMG_DIR = 'img/';
  const EXTS = ['webp', 'jpg', 'png', 'jpeg', 'avif'];

  function loadImg(img) {
    const n = img.dataset.img, fig = img.closest('.ph');
    const tries = EXTS.map(e => `${IMG_DIR}${n}.${e}`);
    let i = 0;
    img.onload = () => fig && fig.classList.remove('missing');
    img.onerror = () => {
      i++;
      if (i < tries.length) { img.src = tries[i]; return; }
      if (fig) { fig.classList.add('missing'); fig.dataset.path = `${IMG_DIR}${n}.${EXTS[0]}`; }
      console.warn(`[GPadel] No se encontró la imagen "${n}". Probé:`, tries);
    };
    img.src = tries[0];
  }
  $$('img[data-img]').forEach(loadImg);

  /* ---------- Titular: revelado palabra por palabra ---------- */
  $$('[data-split]').forEach(el => {
    let i = 0;
    const frag = document.createDocumentFragment();
    el.childNodes.forEach(node => {
      if (node.nodeType === 3) {
        node.textContent.split(/(\s+)/).forEach(part => {
          if (!part.trim()) { part && frag.append(' '); return; }
          const w = document.createElement('span'); w.className = 'w';
          const s = document.createElement('span'); s.style.setProperty('--i', i++); s.textContent = part;
          w.append(s); frag.append(w);
        });
      } else frag.append(node.cloneNode(true));
    });
    el.setAttribute('aria-label', el.textContent);
    el.replaceChildren(frag);
  });

  /* ---------- Revelado al hacer scroll + contadores ---------- */
  function countUp(el) {
    const target = +el.dataset.count, dur = reduce ? 1 : 1200, t0 = performance.now();
    (function tick(now) {
      const p = Math.min((now - t0) / dur, 1);
      el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(tick);
    })(t0);
  }
  const io = new IntersectionObserver((entries, obs) => {
    entries.forEach(en => {
      if (!en.isIntersecting) return;
      en.target.classList.add('in');
      if (en.target.dataset.count) countUp(en.target);
      obs.unobserve(en.target);
    });
  }, { threshold: .15, rootMargin: '0px 0px -6% 0px' });
  $$('[data-reveal], [data-count], .draw:not(.hero__g)').forEach(el => io.observe(el));

  /* ---------- Horarios del club (hora de Córdoba) ---------- */
  const TZ = 'America/Argentina/Cordoba';
  const HOURS = { week: [8, 23], weekend: [9, 22] };   // [apertura, cierre]
  const DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const clubNow = () => new Date(new Date().toLocaleString('en-US', { timeZone: TZ }));
  const hoursOf = d => (d.getDay() === 0 || d.getDay() === 6) ? HOURS.weekend : HOURS.week;
  const hh = h => `${h}:00`;

  function openStatus() {
    const n = clubNow(), [o, c] = hoursOf(n), h = n.getHours() + n.getMinutes() / 60;
    if (h >= o && h < c) return { open: true, text: `Abierto ahora · hasta las ${hh(c)}` };
    if (h < o) return { open: false, text: `Cerrado · abre hoy a las ${hh(o)}` };
    const t = new Date(n); t.setDate(n.getDate() + 1);
    return { open: false, text: `Cerrado · abre mañana a las ${hh(hoursOf(t)[0])}` };
  }
  function paintOpen() {
    const s = openStatus();
    $$('.js-open').forEach(el => { el.textContent = s.text; el.classList.toggle('is-closed', !s.open); });
  }
  paintOpen(); setInterval(paintOpen, 60000);

  /* ---------- Reservas con disponibilidad en vivo ---------- */
  const daysEl = $('#days'), slotsEl = $('#slots');
  if (daysEl) {
    const COURTS = { 'Pádel': 4, 'Pickleball': 2 };
    const pad = n => String(n).padStart(2, '0');
    const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const go = $('#bookGo'), sum = $('#bookSum'), msg = $('#bookMsg'), form = $('#bookForm'),
      steps = $('#bookSteps'), ok = $('#bookOk'), nameEl = $('#bName'), phoneEl = $('#bPhone');
    const st = { sport: 'Pádel', day: 0, hour: null, busy: null, err: false, sending: false };
    const base = clubNow(); base.setHours(0, 0, 0, 0);
    const days = [...Array(7)].map((_, i) => { const d = new Date(base); d.setDate(base.getDate() + i); return d; });
    const dayWord = i => i === 0 ? 'hoy' : i === 1 ? 'mañana' : `el ${DAYS[days[i].getDay()]} ${days[i].getDate()}`;
    const press = (box, btn) => $$('.chip', box).forEach(c => c.setAttribute('aria-pressed', c === btn));
    const waLink = t => `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(t)}`;

    /* --- Fuente de datos: Google Sheets (real) o demostración local --- */
    const real = {
      async availability() {
        const r = await fetch(`${API}?action=availability&from=${iso(days[0])}&days=${days.length}`);
        const j = await r.json(); if (!j.ok) throw 0; return j.busy;
      },
      async book(b) {
        const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(b) });
        return r.json();
      }
    };
    const DEMO_KEY = 'gpadel-demo';
    const mine = () => { try { return JSON.parse(localStorage.getItem(DEMO_KEY) || '[]'); } catch (e) { return []; } };
    const demo = {
      async availability() {
        const out = {};
        days.forEach(d => {
          const k = iso(d); out[k] = {};
          Object.keys(COURTS).forEach((s, si) => {
            out[k][s] = {};
            for (let h = 8; h < 23; h++) {
              const v = (d.getDate() * 31 + h * 17 + si * 5) % 11;
              out[k][s][h] = v > 8 ? COURTS[s] : v > 6 ? COURTS[s] - 1 : 0;
            }
          });
        });
        mine().forEach(b => { const o = out[b.date] && out[b.date][b.sport]; if (o) o[b.hour] = (o[b.hour] || 0) + 1; });
        return out;
      },
      async book(b) {
        const free = COURTS[b.sport] - (((st.busy[b.date] || {})[b.sport] || {})[b.hour] || 0);
        if (free <= 0) return { ok: false, reason: 'full' };
        try { localStorage.setItem(DEMO_KEY, JSON.stringify([...mine(), b])); } catch (e) {}
        return { ok: true, code: 'GP-' + (1000 + Math.floor(Math.random() * 9000)), court: COURTS[b.sport] - free + 1 };
      }
    };
    const backend = API ? real : demo;
    $('#bookDemo').hidden = !!API;

    /* --- Disponibilidad --- */
    const free = (i, h) => COURTS[st.sport] - ((((st.busy || {})[iso(days[i])] || {})[st.sport] || {})[h] || 0);
    const slotsFor = i => {
      const [o, c] = hoursOf(days[i]), now = clubNow(), out = [];
      for (let h = o; h < c; h++) if (i > 0 || h > now.getHours()) out.push(h);
      return out;
    };

    function renderSlots() {
      slotsEl.replaceChildren();
      if (st.err) {
        slotsEl.innerHTML = `<p class="slots__empty">No pudimos cargar la disponibilidad. <a class="link" href="${waLink('Hola! Quiero reservar una cancha.')}" target="_blank" rel="noopener">Reservá por WhatsApp</a></p>`;
        return;
      }
      if (!st.busy) { for (let i = 0; i < 8; i++) { const s = document.createElement('span'); s.className = 'chip skel'; slotsEl.append(s); } return; }
      const list = slotsFor(st.day);
      if (!list.length) { slotsEl.innerHTML = '<p class="slots__empty">No quedan turnos para este día. Probá con otro.</p>'; return; }
      if (st.hour && free(st.day, st.hour) <= 0) st.hour = null;      // se ocupó mientras mirabas
      list.forEach(h => {
        const f = free(st.day, h), b = document.createElement('button');
        b.type = 'button'; b.className = 'chip' + (f === 1 ? ' is-last' : '');
        b.innerHTML = `<span>${hh(h)}</span><small>${f <= 0 ? 'Ocupado' : f === 1 ? 'Última' : f + ' libres'}</small>`;
        b.disabled = f <= 0;
        b.setAttribute('aria-pressed', String(st.hour === h));
        b.setAttribute('aria-label', `${hh(h)}, ${f <= 0 ? 'ocupado' : f + (f === 1 ? ' cancha libre' : ' canchas libres')}`);
        b.addEventListener('click', () => { st.hour = h; press(slotsEl, b); update(); });
        slotsEl.append(b);
      });
    }

    function valid() {
      return st.hour && nameEl.value.trim().length >= 2 && phoneEl.value.replace(/\D/g, '').length >= 8;
    }
    function update() {
      if (!st.hour) sum.textContent = 'Elegí un horario para continuar.';
      else sum.innerHTML = `<b>${st.sport}</b> · ${dayWord(st.day)} · ${hh(st.hour)} · 1 hora`;
      go.setAttribute('aria-disabled', String(!valid() || st.sending));
    }
    const render = () => { renderSlots(); update(); };
    async function refresh() {
      try { st.busy = await backend.availability(); st.err = false; } catch (e) { if (!st.busy) st.err = true; }
      render();
    }

    /* --- Controles --- */
    days.forEach((d, i) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'chip'; b.setAttribute('aria-pressed', 'false');
      b.innerHTML = `<small>${i === 0 ? 'Hoy' : DAYS[d.getDay()]}</small><strong>${d.getDate()}</strong>`;
      b.addEventListener('click', () => { st.day = i; st.hour = null; press(daysEl, b); render(); });
      daysEl.append(b);
    });
    $$('#sports .chip').forEach(b => b.addEventListener('click', () => {
      st.sport = b.dataset.sport; st.hour = null; press($('#sports'), b); render();
    }));
    [nameEl, phoneEl].forEach(el => el.addEventListener('input', () => { msg.textContent = ''; update(); }));

    const showErr = t => { msg.className = 'book__msg is-error'; msg.textContent = t; };
    form.addEventListener('submit', async e => {
      e.preventDefault();
      if (st.sending) return;
      if (!valid()) {
        showErr(!st.hour ? 'Elegí un horario disponible.' : 'Completá tu nombre y WhatsApp para confirmar.');
        (!st.hour ? slotsEl : nameEl.value.trim().length < 2 ? nameEl : phoneEl).scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
        return;
      }
      const b = { sport: st.sport, date: iso(days[st.day]), hour: st.hour, name: nameEl.value.trim(), phone: phoneEl.value.trim(), website: $('#bWeb').value };
      st.sending = true; go.firstElementChild.textContent = 'Reservando…'; update(); msg.textContent = '';
      let res;
      try { res = await backend.book(b); } catch (err) { res = { ok: false, reason: 'error' }; }
      st.sending = false; go.firstElementChild.textContent = 'Confirmar reserva';
      if (res.ok) {
        const when = dayWord(st.day), info = `${b.sport} · ${when} · ${hh(b.hour)}${res.court ? ' · Cancha ' + res.court : ''}`;
        $('#okInfo').textContent = info; $('#okCode').textContent = res.code;
        $('#okWa').href = waLink(`Hola! Reservé online: ${info}. Código ${res.code}. A nombre de ${b.name}.`);
        steps.hidden = form.hidden = true; ok.hidden = false; ok.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
        st.hour = null; refresh();
        return;
      }
      const T = { full: 'Ese horario se acaba de ocupar. Elegí otro, te mostramos los que quedan.', limit: 'Ya tenés 2 reservas ese día. Escribinos por WhatsApp si necesitás más.', invalid: 'Revisá los datos e intentá de nuevo.' };
      showErr(T[res.reason] || 'No pudimos confirmar la reserva. Probá de nuevo o escribinos por WhatsApp.');
      st.hour = null; refresh();
    });
    $('#okAgain').addEventListener('click', () => {
      ok.hidden = true; steps.hidden = form.hidden = false; form.reset(); msg.textContent = ''; render();
    });

    /* Día inicial: hoy, o el siguiente si ya no quedan horarios */
    st.day = Math.max(0, days.findIndex((_, i) => slotsFor(i).length));
    press(daysEl, $$('.chip', daysEl)[st.day]);
    render(); refresh();
    /* Disponibilidad siempre fresca */
    setInterval(() => { if (!document.hidden && !st.sending) refresh(); }, 45000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  }

  /* ---------- Galerías (varias por página): visor, cinta, mosaico, pelota ---------- */
  function initGalleries() {
    const galleries = $$('.gal');
    if (!galleries.length) return;
    const EASE = 'cubic-bezier(.22,.8,.2,1)';
    const flip = (a, z) => `translate(${a.left - z.left}px,${a.top - z.top}px) scale(${a.width / z.width},${a.height / z.height})`;

    /* Visor compartido: crece desde la foto, swipe, teclado */
    const lb = $('#lb');
    let list = [], cur = 0, show = () => {}, openFrom = () => {};
    if (lb) {
      const box = $('.lb__ph', lb), img = $('img', lb), cap = $('#lbCap'), count = $('#lbCount');
      img.onload = () => box.classList.remove('missing');
      img.onerror = () => box.classList.add('missing');
      show = (i, dir) => {
        cur = (i + list.length) % list.length;
        const t = $('img', list[cur]);
        box.classList.toggle('missing', $('.ph', list[cur]).classList.contains('missing'));
        img.src = t.currentSrc || t.src; img.alt = t.alt;
        cap.textContent = t.alt; count.textContent = `${cur + 1} / ${list.length}`;
        if (dir && !reduce) box.animate([{ opacity: 0, transform: `translateX(${dir * 40}px)` }, { opacity: 1, transform: 'none' }], { duration: 400, easing: EASE });
      };
      $('.lb__prev', lb).addEventListener('click', () => show(cur - 1, -1));
      $('.lb__next', lb).addEventListener('click', () => show(cur + 1, 1));
      $('.lb__x', lb).addEventListener('click', () => lb.close());
      lb.addEventListener('click', e => { if (e.target === lb || e.target.classList.contains('lb__stage')) lb.close(); });
      lb.addEventListener('keydown', e => {
        if (e.key === 'ArrowRight') show(cur + 1, 1);
        if (e.key === 'ArrowLeft') show(cur - 1, -1);
      });
      let x0 = null;
      box.addEventListener('pointerdown', e => { x0 = e.clientX; });
      box.addEventListener('pointerup', e => {
        if (x0 === null) return;
        const dx = e.clientX - x0; x0 = null;
        if (Math.abs(dx) > 50) show(cur + (dx < 0 ? 1 : -1), dx < 0 ? 1 : -1);
      });
      openFrom = (g, it) => {
        list = $$('.gal__item', g).filter(i => !i.hidden);
        lb.showModal(); show(list.indexOf(it));
        if (!reduce) box.animate([{ transform: flip($('.ph', it).getBoundingClientRect(), box.getBoundingClientRect()) }, { transform: 'none' }], { duration: 650, easing: EASE });
      };
    }

    galleries.forEach(g => {
      g.addEventListener('click', e => {
        const it = e.target.closest('.gal__item');
        if (it && lb) openFrom(g, it);
      });

      /* ----- Cinta: arrastre con mouse + foco al centro ----- */
      const track = $('.gal__track', g);
      if (track) {
        const line = $('.gal__line i', g);
        const focus = () => {
          const r = track.getBoundingClientRect(), c = r.left + r.width / 2;
          $$('.gal__item', track).forEach(it => {
            const b = it.getBoundingClientRect();
            it.style.setProperty('--k', (1 - Math.min(Math.abs(b.left + b.width / 2 - c) / (r.width * .6), 1)).toFixed(3));
          });
          const m = track.scrollWidth - track.clientWidth;
          if (line) line.style.transform = `scaleX(${m > 0 ? track.scrollLeft / m : 0})`;
        };
        track.addEventListener('scroll', () => requestAnimationFrame(focus), { passive: true });
        addEventListener('resize', focus);
        focus();
        let down = false, sx = 0, sl = 0, moved = 0;
        track.addEventListener('pointerdown', e => {
          if (e.pointerType !== 'mouse') return;
          down = true; sx = e.clientX; sl = track.scrollLeft; moved = 0;
        });
        addEventListener('pointermove', e => {
          if (!down) return;
          const dx = e.clientX - sx; moved = Math.max(moved, Math.abs(dx));
          if (moved > 6) track.classList.add('is-drag');
          track.scrollLeft = sl - dx;
        });
        addEventListener('pointerup', () => { down = false; track.classList.remove('is-drag'); });
        track.addEventListener('click', e => { if (moved > 6) { e.stopPropagation(); e.preventDefault(); moved = 0; } }, true);
      }

      /* ----- Mosaico: revelado + filtros animados ----- */
      const grid = $('.gal__grid', g);
      if (grid) {
        const gio = new IntersectionObserver((es, o) => es.forEach(en => {
          if (en.isIntersecting) { en.target.classList.add('in'); o.unobserve(en.target); }
        }), { threshold: .12 });
        $$('.gal__item', grid).forEach((it, i) => { it.style.setProperty('--d', (i * .08) + 's'); gio.observe(it); });
        const bar = $('.gal__filters', g);
        bar && bar.addEventListener('click', e => {
          const b = e.target.closest('.chip');
          if (!b) return;
          $$('.chip', bar).forEach(c => c.setAttribute('aria-pressed', c === b));
          const f = b.dataset.f, all = $$('.gal__item', grid);
          const first = new Map(all.map(i => [i, i.getBoundingClientRect()]));
          all.forEach(i => { i.hidden = !(f === 'all' || i.dataset.cat === f); i.classList.add('in'); });
          grid.classList.toggle('is-filtered', f !== 'all');
          if (reduce) return;
          all.forEach(i => {
            if (i.hidden) return;
            const a = first.get(i), z = i.getBoundingClientRect();
            i.animate(a.width
              ? [{ transform: flip(a, z) }, { transform: 'none' }]
              : [{ opacity: 0, transform: 'scale(.9)' }, { opacity: 1, transform: 'none' }],
            { duration: 550, easing: EASE });
          });
        });
      }

      /* ----- Pelota que sigue al cursor (solo mouse) ----- */
      const ball = $('.gal__ball', g);
      if (ball && finePointer && !reduce) {
        let x = 0, y = 0, tx = 0, ty = 0, on = false;
        const loop = () => {
          if (!on) return;
          x += (tx - x) * .16; y += (ty - y) * .16;
          ball.style.transform = `translate(${x}px,${y}px)`;
          requestAnimationFrame(loop);
        };
        g.addEventListener('pointermove', e => {
          if (e.pointerType !== 'mouse') return;
          const r = g.getBoundingClientRect(); tx = e.clientX - r.left; ty = e.clientY - r.top;
          if (!on) { x = tx; y = ty; on = true; ball.classList.add('on'); loop(); }
          g.classList.toggle('is-hov', !!e.target.closest('.gal__item'));
        });
        g.addEventListener('pointerleave', () => { on = false; ball.classList.remove('on'); g.classList.remove('is-hov'); });
      }
    });
  }
  initGalleries();

  /* ---------- Botón flotante de WhatsApp ---------- */
  const fab = $('#fab'), hide = new Set();
  let pastHero = false;
  const fabUpdate = y => {
    if (y !== undefined) pastHero = y > 520;
    fab && fab.classList.toggle('show', pastHero && hide.size === 0);
  };
  if (fab) {
    const fio = new IntersectionObserver(es => {
      es.forEach(e => e.isIntersecting ? hide.add(e.target) : hide.delete(e.target));
      fabUpdate();
    });
    $$('#reservar, .cta, .footer').forEach(el => fio.observe(el));
  }

  /* ---------- Header, progreso y parallax (un solo handler con rAF) ---------- */
  const header = $('.site-header'), progress = $('.progress');
  const parallax = $$('.hero__media img, .space__img img, .where__img img, .cta__img img');
  let ticking = false;
  function onScroll() {
    const y = scrollY, max = root.scrollHeight - innerHeight;
    progress.style.transform = `scaleX(${max > 0 ? y / max : 0})`;
    header.classList.toggle('is-scrolled', y > 20);
    fabUpdate(y);
    if (!reduce) parallax.forEach(img => {
      const r = img.parentElement.getBoundingClientRect();
      if (r.bottom < 0 || r.top > innerHeight) return;
      const p = (r.top + r.height / 2 - innerHeight / 2) / innerHeight;
      img.style.translate = `0 ${(-p * 22).toFixed(1)}px`;
    });
    ticking = false;
  }
  addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
  onScroll();

  /* ---------- Navegación activa ---------- */
  const links = $$('.nav a');
  const spy = new IntersectionObserver(entries => {
    entries.forEach(en => {
      if (!en.isIntersecting) return;
      links.forEach(a => a.classList.toggle('is-active', a.getAttribute('href') === '#' + en.target.id));
    });
  }, { rootMargin: '-45% 0px -50% 0px' });
  $$('section[id]').forEach(s => spy.observe(s));

  /* ---------- Menú móvil ---------- */
  const burger = $('#burger');
  const menu = open => {
    document.body.classList.toggle('menu-open', open);
    burger.setAttribute('aria-expanded', open);
    burger.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
  };
  burger.addEventListener('click', () => menu(!document.body.classList.contains('menu-open')));
  links.forEach(a => a.addEventListener('click', () => menu(false)));
  document.addEventListener('pointerdown', e => {
    if (document.body.classList.contains('menu-open') && !e.target.closest('.nav, .burger')) menu(false);
  });
  addEventListener('keydown', e => { if (e.key === 'Escape') menu(false); });

  /* ---------- Ondas al tocar botones ---------- */
  document.addEventListener('pointerdown', e => {
    const b = e.target.closest('.btn');
    if (!b || reduce) return;
    const r = b.getBoundingClientRect(), size = Math.max(r.width, r.height) * 2;
    const s = document.createElement('span');
    s.className = 'ripple';
    s.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - r.left - size / 2}px;top:${e.clientY - r.top - size / 2}px`;
    b.append(s);
    s.addEventListener('animationend', () => s.remove());
  });

  /* ---------- Botones magnéticos (solo con mouse) ---------- */
  if (finePointer && !reduce) {
    $$('[data-magnetic]').forEach(b => {
      b.addEventListener('pointermove', e => {
        const r = b.getBoundingClientRect();
        b.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * .16}px, ${(e.clientY - r.top - r.height / 2) * .26}px)`;
      });
      b.addEventListener('pointerleave', () => { b.style.transform = ''; });
    });
  }

  /* ---------- Enlaces de WhatsApp con mensaje armado ---------- */
  $$('[data-wa]').forEach(a => {
    a.href = `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(a.dataset.wa)}`;
  });

  $('#year').textContent = new Date().getFullYear();
})();
