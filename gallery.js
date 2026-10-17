/* ============ GPADEL — gallery.js (v2 · varias galerías por página) ============ */
(() => {
  'use strict';
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const EASE = 'cubic-bezier(.22,.8,.2,1)';
  const flip = (a, z) => `translate(${a.left - z.left}px,${a.top - z.top}px) scale(${a.width / z.width},${a.height / z.height})`;
  const galleries = $$('.gal');
  if (!galleries.length) return;

  /* ---------- Visor compartido: crece desde la foto, swipe, teclado ---------- */
  const lb = $('#lb');
  let list = [], cur = 0, show = () => {};
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
    var openFrom = (g, it) => {
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
      const io = new IntersectionObserver((es, o) => es.forEach(en => {
        if (en.isIntersecting) { en.target.classList.add('in'); o.unobserve(en.target); }
      }), { threshold: .12 });
      $$('.gal__item', grid).forEach((it, i) => { it.style.setProperty('--d', (i * .08) + 's'); io.observe(it); });
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
    if (ball && fine && !reduce) {
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
})();
