// Geometría del simulador de pared (components/WallSimulator.jsx).
// Todo en centímetros. Sin dependencias: se puede correr con node para verificar.

export const round = (n, step = 0.25) => Math.round(n / step) * step;

const overlap = (a1, a2, b1, b2) => Math.min(a2, b2) - Math.max(a1, b1);

// ¿a y b son vecinos sobre el eje A (x = lado a lado, y = uno encima del otro)?
// Lo son si se solapan en el eje perpendicular y no se solapan en el eje propio.
function neighbourOnAxis(a, b, A) {
  const S = A === 'x' ? 'w' : 'h';
  const P = A === 'x' ? 'y' : 'x';
  const PS = A === 'x' ? 'h' : 'w';
  const perp = overlap(a[P], a[P] + a[PS], b[P], b[P] + b[PS]);
  if (perp <= Math.min(a[PS], b[PS]) * 0.2) return null;
  const first = a[A] <= b[A] ? a : b;
  const second = a[A] <= b[A] ? b : a;
  const gap = second[A] - (first[A] + first[S]);
  return { first, second, gap, perp };
}

// Pesos del solver. La separación manda; la alineación acompaña; el ancla evita que el
// conjunto se deforme cuando las restricciones se contradicen (composiciones escalonadas).
const W_GAP = 1;
const W_ALIGN = 0.06;
const W_ANCHOR = 0.01;

// Arma las restricciones de un eje: separación entre vecinos + bordes/centros casi alineados.
function buildConstraints(frames, A, gap, tol) {
  const S = A === 'x' ? 'w' : 'h';
  const cons = [];
  const gapPairs = new Set();
  for (let i = 0; i < frames.length; i++) {
    for (let j = i + 1; j < frames.length; j++) {
      const n = neighbourOnAxis(frames[i], frames[j], A);
      if (!n || n.gap <= 0 || n.gap > gap * 2.5 + 4) continue;
      const fi = frames.indexOf(n.first);
      const si = frames.indexOf(n.second);
      // second.pos - first.pos debe valer first.size + gap
      cons.push({ i: fi, j: si, target: n.first[S] + gap, w: W_GAP });
      gapPairs.add(`${i}-${j}`);
    }
  }
  for (let i = 0; i < frames.length; i++) {
    for (let j = i + 1; j < frames.length; j++) {
      if (gapPairs.has(`${i}-${j}`)) continue; // ya tienen restricción de separación en este eje
      const a = frames[i];
      const b = frames[j];
      const opts = [
        { d: b[A] - a[A], target: 0 }, // bordes iniciales
        { d: b[A] + b[S] - (a[A] + a[S]), target: a[S] - b[S] }, // bordes finales
        { d: b[A] + b[S] / 2 - (a[A] + a[S] / 2), target: (a[S] - b[S]) / 2 }, // centros
      ];
      // Solo la alineación más cercana del par, para no sumar tirones contradictorios.
      const best = opts.reduce((m, o) => (Math.abs(o.d) < Math.abs(m.d) ? o : m));
      if (Math.abs(best.d) < tol) cons.push({ i, j, target: best.target, w: W_ALIGN });
    }
  }
  return cons;
}

// Jacobi ponderado sobre las restricciones del eje (mínimos cuadrados): cuando el sistema
// es incompatible converge al mejor compromiso en vez de oscilar.
function solveAxis(frames, A, gap, tol, iterations, step = 0.7) {
  const cons = buildConstraints(frames, A, gap, tol);
  const pos = frames.map((f) => f[A]);
  const anchor = pos.slice();
  for (let k = 0; k < iterations; k++) {
    const num = new Array(pos.length).fill(0);
    const den = new Array(pos.length).fill(0);
    cons.forEach((c) => {
      const r = pos[c.j] - pos[c.i] - c.target; // residuo
      num[c.i] += c.w * (r / 2);
      num[c.j] += c.w * (-r / 2);
      den[c.i] += c.w;
      den[c.j] += c.w;
    });
    for (let i = 0; i < pos.length; i++) {
      num[i] += W_ANCHOR * (anchor[i] - pos[i]);
      den[i] += W_ANCHOR;
      if (den[i] > 0) pos[i] += step * (num[i] / den[i]);
    }
  }
  return frames.map((f, i) => ({ ...f, [A]: pos[i] }));
}

export function bounds(frames) {
  if (!frames.length) return null;
  const x1 = Math.min(...frames.map((f) => f.x));
  const y1 = Math.min(...frames.map((f) => f.y));
  const x2 = Math.max(...frames.map((f) => f.x + f.w));
  const y2 = Math.max(...frames.map((f) => f.y + f.h));
  return { x1, y1, x2, y2, w: x2 - x1, h: y2 - y1, cx: (x1 + x2) / 2, cy: (y1 + y2) / 2 };
}

// Empareja separaciones y alineaciones manteniendo la composición, y recentra el conjunto
// sobre la pared conservando su centro vertical.
export function tidyLayout(frames, gap, wallW, wallH, iterations = 400) {
  if (!frames.length) return frames;
  const before = bounds(frames);
  let f = frames.map((o) => ({ ...o }));
  // Dos vueltas: la segunda recalcula vecinos y alineaciones sobre las posiciones ya corregidas.
  for (let pass = 0; pass < 2; pass++) {
    f = solveAxis(f, 'x', gap, 2, iterations);
    f = solveAxis(f, 'y', gap, 2, iterations);
  }
  const after = bounds(f);
  const dx = wallW / 2 - after.cx;
  const dy = Math.min(Math.max(before.cy, after.h / 2 + 2), wallH - after.h / 2 - 10) - after.cy;
  return f.map((o) => ({ ...o, x: round(o.x + dx), y: round(o.y + dy) }));
}

// Diagnóstico: separaciones entre vecinos, para verificar que quedaron iguales.
export function gapReport(frames) {
  const out = [];
  ['x', 'y'].forEach((A) => {
    for (let i = 0; i < frames.length; i++) {
      for (let j = i + 1; j < frames.length; j++) {
        const n = neighbourOnAxis(frames[i], frames[j], A);
        if (n && n.gap > 0 && n.gap < 20) out.push({ axis: A, a: n.first.id, b: n.second.id, gap: Math.round(n.gap * 100) / 100 });
      }
    }
  });
  return out;
}

// Imán durante el arrastre: alineación con bordes/centros + separación exacta con los vecinos.
// Devuelve { value, line, type } o null. `type` = 'gap' | 'align'.
export function snapAxis({ pos, size, axis, moving, others, gap, wallCenter, tol = 1.4 }) {
  const A = axis;
  const S = A === 'x' ? 'w' : 'h';
  const P = A === 'x' ? 'y' : 'x';
  const PS = A === 'x' ? 'h' : 'w';
  let best = null;
  const consider = (value, line, type) => {
    const diff = Math.abs(pos - value);
    if (diff > tol) return;
    // La separación uniforme gana ante un empate con la alineación.
    const score = diff * (type === 'gap' ? 0.7 : 1);
    if (!best || score < best.score) best = { score, diff, value, line, type };
  };

  others.forEach((o) => {
    [o[A], o[A] + o[S] / 2, o[A] + o[S]].forEach((v) => {
      consider(v, v, 'align');
      consider(v - size, v, 'align');
      consider(v - size / 2, v, 'align');
    });
    const perp = overlap(moving[P], moving[P] + moving[PS], o[P], o[P] + o[PS]);
    if (perp > Math.min(moving[PS], o[PS]) * 0.15) {
      consider(o[A] + o[S] + gap, o[A] + o[S], 'gap');
      consider(o[A] - size - gap, o[A], 'gap');
    }
  });
  consider(wallCenter - size / 2, wallCenter, 'align');
  return best;
}

// Imán al redimensionar: el borde que se arrastra busca alineación o separación exacta.
export function snapEdge({ edge, axis, moving, others, gap, tol = 1.4 }) {
  const A = axis;
  const S = A === 'x' ? 'w' : 'h';
  const P = A === 'x' ? 'y' : 'x';
  const PS = A === 'x' ? 'h' : 'w';
  let best = null;
  const consider = (value, type) => {
    const diff = Math.abs(edge - value);
    if (diff > tol) return;
    const score = diff * (type === 'gap' ? 0.7 : 1);
    if (!best || score < best.score) best = { score, value, line: value, type };
  };
  others.forEach((o) => {
    consider(o[A] + o[S], 'align');
    consider(o[A], 'align');
    const perp = overlap(moving[P], moving[P] + moving[PS], o[P], o[P] + o[PS]);
    if (perp > Math.min(moving[PS], o[PS]) * 0.15) consider(o[A] - gap, 'gap');
  });
  return best;
}
