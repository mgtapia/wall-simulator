'use client';
// TEMPORAL — proyecto personal (simulador de pared de cuadros). No es parte del hub de marketing.
// Marcos reales JYSK VALTER blancos: la medida nominal es el hueco de la foto y el borde mide 1 cm,
// así que el exterior = nominal + 2 cm. Todo se guarda en localStorage: layout + fotos.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useConfirm } from '@/components/ConfirmDialog';
import { tidyLayout, snapAxis, bounds as boundsOf, gapReport, round } from '@/lib/wallGeometry.mjs';

const LS_LAYOUT = 'pared:v2:layout';
const LS_PHOTOS = 'pared:v2:photos';
const LS_BAK = 'pared:v2:copias'; // copias rotativas del layout, por si algo se pisa

// Medidas compradas (hueco de la foto, cm). El exterior sale de sumar el borde.
const SIZES = {
  '10x15': { pw: 10, ph: 15, label: '10×15' },
  '13x18': { pw: 13, ph: 18, label: '13×18' },
  '15x21': { pw: 15, ph: 21, label: '15×21' },
  '18x24': { pw: 18, ph: 24, label: '18×24' },
  '21x30': { pw: 21, ph: 30, label: '21×30' },
};
const SIZE_KEYS = Object.keys(SIZES);

const FRAME_STYLES = {
  white: { name: 'Blanco', face: '#faf9f7', edge: '#d6d4cf', bevel: '#ffffff' },
  black: { name: 'Negro', face: '#1c1c1e', edge: '#000000', bevel: '#3a3a3d' },
  oak: { name: 'Roble', face: '#cba97c', edge: '#a07f52', bevel: '#e0c49b' },
  walnut: { name: 'Nogal', face: '#6d4728', edge: '#43290f', bevel: '#8a6039' },
};

const MAT_COLORS = { ninguno: null, blanco: '#fbfaf7', crema: '#f2ece0', gris: '#e2e1dd' };

const WALL_COLORS = [
  { id: 'Blanco', v: '#f1efeb' },
  { id: 'Hueso', v: '#e7e0d5' },
  { id: 'Gris', v: '#d9d9d7' },
  { id: 'Salvia', v: '#ccd5c9' },
  { id: 'Arena', v: '#e2d5c2' },
  { id: 'Azul', v: '#c8d4de' },
];

// Composición inicial con los 12 marcos comprados: 2× 18×24 al centro, 4× 13×18 arriba y abajo,
// y dos columnas laterales de 10×15 + 13×18. Todas las separaciones son de 5 cm exactos.
const REFERENCE = {
  wallW: 160,
  wallH: 120,
  wall: '#f1efeb',
  moulding: 1,
  mat: 0,
  matColor: 'ninguno',
  frameStyle: 'white',
  gap: 5,
  stock: { '10x15': 4, '13x18': 6, '15x21': 0, '18x24': 2, '21x30': 0 },
  frames: [
    // columna izquierda (alineada a derecha contra el centro)
    { id: 'l1', size: '10x15', vertical: false, x: 35.5, y: 33 },
    { id: 'l2', size: '13x18', vertical: true, x: 37.5, y: 50 },
    { id: 'l3', size: '10x15', vertical: false, x: 35.5, y: 75 },
    // bloque central
    { id: 'c1', size: '13x18', vertical: false, x: 57.5, y: 27 },
    { id: 'c2', size: '13x18', vertical: false, x: 82.5, y: 27 },
    { id: 'c3', size: '18x24', vertical: true, x: 57.5, y: 47 },
    { id: 'c4', size: '18x24', vertical: true, x: 82.5, y: 47 },
    { id: 'c5', size: '13x18', vertical: false, x: 57.5, y: 78 },
    { id: 'c6', size: '13x18', vertical: false, x: 82.5, y: 78 },
    // columna derecha (alineada a izquierda contra el centro)
    { id: 'r1', size: '10x15', vertical: false, x: 107.5, y: 33 },
    { id: 'r2', size: '13x18', vertical: true, x: 107.5, y: 50 },
    { id: 'r3', size: '10x15', vertical: false, x: 107.5, y: 75 },
  ],
};

const clone = (o) => JSON.parse(JSON.stringify(o));
const fmt = (n) => (Math.round(n * 10) / 10).toString().replace('.', ',');

// Medida exterior de un marco = hueco + borde a cada lado.
function outer(frame, moulding) {
  const s = SIZES[frame.size];
  const pw = frame.vertical ? s.pw : s.ph;
  const ph = frame.vertical ? s.ph : s.pw;
  return { w: pw + moulding * 2, h: ph + moulding * 2 };
}

function fileToDataUrl(file, maxSide = 1400) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const k = Math.min(1, maxSide / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * k);
        c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        resolve({ src: c.toDataURL('image/jpeg', 0.85), ratio: img.width / img.height, name: file.name });
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

export default function WallSimulator() {
  const { confirm, dialog } = useConfirm();
  const [layout, setLayout] = useState(() => clone(REFERENCE));
  const [photos, setPhotos] = useState({});
  const [selected, setSelected] = useState(null);
  const [panMode, setPanMode] = useState(false);
  const [showSizes, setShowSizes] = useState(false);
  const [showList, setShowList] = useState(false);
  const [wide, setWide] = useState(false); // oculta el panel para ver la pared a todo lo ancho
  const [isFull, setIsFull] = useState(false);
  const [guides, setGuides] = useState([]);
  const [dropOver, setDropOver] = useState(null);
  const [warn, setWarn] = useState('');
  const [vp, setVp] = useState({ w: 0, h: 0 }); // tamaño útil del visor en px
  const [shellH, setShellH] = useState(null); // alto exacto de la app para que la página no scrollee
  const [zoom, setZoom] = useState(1);
  const [loaded, setLoaded] = useState(false);
  const [canSave, setCanSave] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [baks, setBaks] = useState([]);
  const [history, setHistory] = useState([]);

  // Diseño bloqueado: no se mueve ni se cambia nada, pero se siguen cargando y encuadrando fotos.
  const locked = !!layout.locked;
  const toggleLock = () => setLayout((L) => ({ ...L, locked: !L.locked }));

  const wallRef = useRef(null);
  const boxRef = useRef(null);
  const rootRef = useRef(null);
  const viewportRef = useRef(null);
  const fileRef = useRef(null);
  const pendingRef = useRef(null);
  const bakRef = useRef(null);
  const dragRef = useRef(null);

  // --- persistencia ---
  // Regla: si la lectura falla NO se autoguarda, para no pisar lo guardado con la composición
  // inicial. Además cada guardado deja una copia rotativa del estado anterior.
  useEffect(() => {
    try {
      const l = localStorage.getItem(LS_LAYOUT);
      const p = localStorage.getItem(LS_PHOTOS);
      if (l) setLayout({ ...clone(REFERENCE), ...JSON.parse(l) });
      if (p) setPhotos(JSON.parse(p));
      setBaks(JSON.parse(localStorage.getItem(LS_BAK) || '[]'));
      setCanSave(true);
      setSavedAt(l ? Date.now() : null);
    } catch (err) {
      setCanSave(false);
      setWarn('No pude leer lo guardado, así que desactivé el autoguardado para no pisarlo. Mirá "Guardado" en el panel.');
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded || !canSave) return;
    const t = setTimeout(() => {
      try {
        const prev = localStorage.getItem(LS_LAYOUT);
        localStorage.setItem(LS_LAYOUT, JSON.stringify(layout));
        setSavedAt(Date.now());
        if (prev && prev !== JSON.stringify(layout)) {
          const list = JSON.parse(localStorage.getItem(LS_BAK) || '[]');
          // una copia cada 2 minutos como máximo: alcanza para volver atrás sin llenar el storage
          if (!list[0] || Date.now() - list[0].t > 120000) {
            const next = [{ t: Date.now(), layout: JSON.parse(prev) }, ...list].slice(0, 8);
            localStorage.setItem(LS_BAK, JSON.stringify(next));
            setBaks(next);
          }
        }
      } catch {
        setWarn('No pude guardar el layout en este navegador. Descargá un respaldo desde el panel.');
      }
    }, 500);
    return () => clearTimeout(t);
  }, [layout, loaded, canSave]);

  useEffect(() => {
    if (!loaded || !canSave) return;
    try {
      localStorage.setItem(LS_PHOTOS, JSON.stringify(photos));
      setWarn((w) => (w.startsWith('No entran') ? '' : w));
    } catch {
      setWarn('No entran más fotos en el almacenamiento del navegador. Sacá alguna o cargá fotos más chicas.');
    }
  }, [photos, loaded, canSave]);

  // Medidas del visor. La escala se calcula en el render a partir de esto.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setVp({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Pantalla completa sobre la columna de la pared: el visor se agranda y el ResizeObserver
  // recalcula la escala solo, así que la pared sigue llenando todo sin scroll.
  useEffect(() => {
    const onFs = () => setIsFull(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else if (boxRef.current?.requestFullscreen) {
      boxRef.current.requestFullscreen().catch(() => setWarn('El navegador no permitió pantalla completa.'));
    } else {
      setWarn('Este navegador no soporta pantalla completa.');
    }
  }

  // Alto exacto de la app = ventana menos lo que haya arriba (topbar). Así la página no scrollea.
  useEffect(() => {
    function measure() {
      const el = rootRef.current;
      if (!el) return;
      setShellH(window.innerWidth >= 1024 ? Math.max(420, window.innerHeight - el.getBoundingClientRect().top) : null);
    }
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  // Zoom con ctrl/⌘ + rueda, manteniendo quieto el punto bajo el cursor.
  const zoomBy = useCallback((factor, clientX, clientY) => {
    const vp = viewportRef.current;
    if (!vp) return;
    const r = vp.getBoundingClientRect();
    const cx = clientX ?? r.left + r.width / 2;
    const cy = clientY ?? r.top + r.height / 2;
    const px = cx - r.left + vp.scrollLeft;
    const py = cy - r.top + vp.scrollTop;
    setZoom((z) => {
      const nz = Math.max(0.5, Math.min(6, z * factor));
      const k = nz / z;
      requestAnimationFrame(() => {
        vp.scrollLeft = px * k - (cx - r.left);
        vp.scrollTop = py * k - (cy - r.top);
      });
      return nz;
    });
  }, []);

  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const onWheel = (e) => {
      if (!(e.ctrlKey || e.metaKey)) return; // rueda sola = scroll normal
      e.preventDefault();
      zoomBy(Math.exp(-e.deltaY * 0.0025), e.clientX, e.clientY);
    };
    vp.addEventListener('wheel', onWheel, { passive: false });
    return () => vp.removeEventListener('wheel', onWheel);
  }, [zoomBy]);

  // --- geometría derivada (x, y, w, h en cm) ---
  const geo = useMemo(
    () => layout.frames.map((f) => ({ ...f, ...outer(f, layout.moulding) })),
    [layout.frames, layout.moulding],
  );
  const geoById = useMemo(() => Object.fromEntries(geo.map((f) => [f.id, f])), [geo]);
  const sel = selected ? geoById[selected] : null;
  const bounds = useMemo(() => boundsOf(geo), [geo]);

  // La pared toma la proporción del visor: así llena todo el ancho y entra entera, sin scroll.
  // Con "alto automático" apagado se respetan los cm reales de la pared (y sobra a los costados).
  const PAD = 0; // la pared va a ras del borde del visor, sin margen
  const autoH = layout.autoHeight !== false;
  const wallH = useMemo(() => {
    if (!autoH || !vp.w || !vp.h) return layout.wallH;
    const derived = round(layout.wallW * ((vp.h - PAD) / (vp.w - PAD)), 0.5);
    return Math.max(derived, (bounds?.h || 0) + 8); // nunca más bajo que la composición
  }, [autoH, vp.w, vp.h, layout.wallW, layout.wallH, bounds?.h]);

  const fit = vp.w ? Math.max(0.5, Math.min((vp.w - PAD) / layout.wallW, (vp.h - PAD) / wallH)) : 4;
  const scale = fit * zoom;

  // El lienzo nunca es más chico que el visor: al alejar se ve más superficie de pared en vez
  // de fondo negro. El excedente se reparte a los dos lados (offset solo de dibujo; los cm
  // guardados de cada cuadro no cambian).
  const wallPxW = Math.max(vp.w - PAD, layout.wallW * scale);
  const wallPxH = Math.max(vp.h - PAD, wallH * scale);
  const offX = (wallPxW - layout.wallW * scale) / 2;
  const offY = (wallPxH - wallH * scale) / 2;

  const gaps = useMemo(() => gapReport(geo).map((g) => g.gap), [geo]);
  const gapSpread = gaps.length ? { min: Math.min(...gaps), max: Math.max(...gaps) } : null;

  const used = useMemo(() => {
    const u = Object.fromEntries(SIZE_KEYS.map((k) => [k, 0]));
    layout.frames.forEach((f) => { u[f.size] = (u[f.size] || 0) + 1; });
    return u;
  }, [layout.frames]);

  // Con alto automático la altura de la pared la manda la pantalla, así que la composición
  // se mantiene centrada en vertical en vez de quedar colgando arriba o abajo.
  useEffect(() => {
    if (!loaded || !autoH || !bounds || !vp.w) return;
    const dy = wallH / 2 - bounds.cy;
    if (Math.abs(dy) < 0.5) return;
    const t = setTimeout(() => {
      setLayout((L) => ({ ...L, frames: L.frames.map((f) => ({ ...f, y: round(f.y + dy) })) }));
    }, 120);
    return () => clearTimeout(t);
  }, [loaded, autoH, wallH, bounds, vp.w]);

  const pushHistory = useCallback(() => {
    setHistory((h) => [...h.slice(-29), clone(layout)]);
  }, [layout]);

  const setFrame = useCallback((id, patch) => {
    setLayout((L) => ({ ...L, frames: L.frames.map((f) => (f.id === id ? { ...f, ...patch } : f)) }));
  }, []);

  const setPhoto = useCallback((id, patch) => {
    setPhotos((P) => (P[id] ? { ...P, [id]: { ...P[id], ...patch } } : P));
  }, []);

  // --- fotos ---
  const emptyFrames = useMemo(
    () => geo.filter((f) => !photos[f.id]).sort((a, b) => a.y - b.y || a.x - b.x),
    [geo, photos],
  );

  async function ingest(files, targetId) {
    const list = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (!list.length) return;
    const targets = targetId ? [targetId] : emptyFrames.map((f) => f.id);
    const next = {};
    for (let i = 0; i < list.length; i++) {
      const id = targets[i];
      if (!id) break;
      try {
        const data = await fileToDataUrl(list[i]);
        next[id] = { ...data, zoom: 1, ox: 0, oy: 0, fit: 'cover' };
      } catch {
        setWarn(`No pude leer "${list[i].name}".`);
      }
    }
    if (Object.keys(next).length) setPhotos((P) => ({ ...P, ...next }));
    if (!targetId && list.length > targets.length) setWarn(`Cargué ${targets.length} foto(s): no había más cuadros vacíos.`);
  }

  function pickFor(id) {
    pendingRef.current = id;
    fileRef.current.value = '';
    fileRef.current.multiple = !id;
    fileRef.current.click();
  }

  // --- arrastre con imán de alineación + separación fija ---
  const toCm = useCallback(
    (e) => {
      const r = wallRef.current.getBoundingClientRect();
      return { x: (e.clientX - r.left - offX) / scale, y: (e.clientY - r.top - offY) / scale };
    },
    [scale, offX, offY],
  );

  function startDrag(e, id, mode) {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    setSelected(id);
    if (locked && mode !== 'pan') return;
    pushHistory();
    dragRef.current = { id, mode, start: toCm(e), orig: { ...geoById[id] }, photo: photos[id] ? { ...photos[id] } : null, moved: false };
  }

  useEffect(() => {
    if (!loaded) return;
    function onMove(e) {
      const d = dragRef.current;
      if (!d) return;
      const p = toCm(e);
      const dx = p.x - d.start.x;
      const dy = p.y - d.start.y;
      if (Math.abs(dx) > 0.2 || Math.abs(dy) > 0.2) d.moved = true;

      if (d.mode === 'pan') {
        if (!d.photo) return;
        setPhoto(d.id, {
          ox: Math.max(-50, Math.min(50, d.photo.ox + (dx / d.orig.w) * 100)),
          oy: Math.max(-50, Math.min(50, d.photo.oy + (dy / d.orig.h) * 100)),
        });
        return;
      }

      const others = geo.filter((f) => f.id !== d.id);
      const g = [];
      let x = d.orig.x + dx;
      let y = d.orig.y + dy;
      if (!e.altKey) {
        const moving = { x, y, w: d.orig.w, h: d.orig.h };
        const sx = snapAxis({ pos: x, size: d.orig.w, axis: 'x', moving, others, gap: layout.gap, wallCenter: layout.wallW / 2 });
        if (sx) { x = sx.value; g.push({ dir: 'v', at: sx.line, type: sx.type }); }
        const sy = snapAxis({ pos: y, size: d.orig.h, axis: 'y', moving: { ...moving, x }, others, gap: layout.gap, wallCenter: wallH / 2 });
        if (sy) { y = sy.value; g.push({ dir: 'h', at: sy.line, type: sy.type }); }
      }
      setGuides(g);
      setFrame(d.id, { x: round(x), y: round(y) });
    }
    function onUp() {
      if (dragRef.current) {
        dragRef.current = null;
        setGuides([]);
      }
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [loaded, geo, layout.gap, layout.wallW, wallH, setFrame, setPhoto, toCm]);

  // --- teclado ---
  useEffect(() => {
    function onKey(e) {
      if (!selected) return;
      const t = e.target;
      if (t && ['INPUT', 'SELECT', 'TEXTAREA'].includes(t.tagName)) return;
      if (e.key === 'Escape') return setSelected(null);
      if (locked) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        return pedirBorrarMarco(selected);
      }
      const step = e.shiftKey ? 5 : 0.5;
      const map = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      if (map[e.key]) {
        e.preventDefault();
        const f = geoById[selected];
        setFrame(selected, { x: round(f.x + map[e.key][0]), y: round(f.y + map[e.key][1]) });
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected, geoById, setFrame, locked]);

  // --- acciones ---
  function addFrame(sizeKey, vertical) {
    if (locked) return;
    pushHistory();
    const id = `n${Date.now().toString(36)}`;
    const dims = outer({ size: sizeKey, vertical }, layout.moulding);
    const y = bounds ? Math.min(wallH - dims.h - 5, bounds.y2 + layout.gap) : wallH / 2;
    setLayout((L) => ({ ...L, frames: [...L.frames, { id, size: sizeKey, vertical, x: round(L.wallW / 2 - dims.w / 2), y: round(y) }] }));
    setSelected(id);
  }

  // Todo lo que borra algo pide confirmación: el botón «Borrar» y la tecla Suprimir pasan por aquí.
  async function pedirBorrarMarco(id) {
    if (locked) return;
    if (await confirm({ title: 'Borrar el marco', message: 'Se borra el marco seleccionado y su foto de la composición.', confirmLabel: 'Borrar', danger: true })) removeFrame(id);
  }
  async function pedirQuitarFoto(id) {
    if (await confirm({ title: 'Quitar la foto', message: 'Se quita la foto de este marco; el marco se mantiene.', confirmLabel: 'Quitar', danger: true })) {
      setPhotos((P) => { const { [id]: _, ...r } = P; return r; });
    }
  }

  function removeFrame(id) {
    if (locked) return;
    pushHistory();
    setLayout((L) => ({ ...L, frames: L.frames.filter((f) => f.id !== id) }));
    setPhotos((P) => {
      const { [id]: _, ...rest } = P;
      return rest;
    });
    setSelected(null);
  }

  function tidy() {
    if (locked) return;
    pushHistory();
    setLayout((L) => {
      const g = L.frames.map((f) => ({ ...f, ...outer(f, L.moulding) }));
      const fixed = tidyLayout(g, L.gap, L.wallW, wallH);
      const byId = Object.fromEntries(fixed.map((f) => [f.id, f]));
      return { ...L, frames: L.frames.map((f) => ({ ...f, x: byId[f.id].x, y: byId[f.id].y })) };
    });
  }

  function undo() {
    setHistory((h) => {
      if (!h.length) return h;
      setLayout(h[h.length - 1]);
      return h.slice(0, -1);
    });
  }

  async function resetLayout() {
    if (!(await confirm({ title: 'Volver a la composición inicial', message: 'Vuelve a los 12 marcos comprados. Las fotos se mantienen.', confirmLabel: 'Volver' }))) return;
    pushHistory();
    setLayout(clone(REFERENCE));
    setSelected(null);
  }

  // Respaldo completo (layout + fotos) a un archivo: sobrevive a cambiar de navegador,
  // de puerto del dev server o a que se borre el storage.
  function downloadBackup() {
    const blob = new Blob([JSON.stringify({ v: 2, savedAt: Date.now(), layout, photos })], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    const d = new Date();
    a.download = `pared-respaldo-${d.toISOString().slice(0, 16).replace(/[T:]/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function importBackup(file) {
    try {
      const data = JSON.parse(await file.text());
      if (!data.layout?.frames) throw new Error('sin frames');
      pushHistory();
      setLayout({ ...clone(REFERENCE), ...data.layout });
      if (data.photos) setPhotos(data.photos);
      setCanSave(true);
      setWarn('');
    } catch {
      setWarn('Ese archivo no es un respaldo válido.');
    }
  }

  function restoreBak(b) {
    pushHistory();
    setLayout({ ...clone(REFERENCE), ...b.layout });
    setSelected(null);
  }

  function exportLayout() {
    const rows = [...geo].sort((a, b) => a.y - b.y || a.x - b.x)
      .map((f, i) => `${i + 1};${SIZES[f.size].label};${f.vertical ? 'vertical' : 'horizontal'};${fmt(f.x)};${fmt(f.y)};${fmt(f.w)};${fmt(f.h)};${photos[f.id]?.name || ''}`);
    const csv = ['n;marco;orientacion;x_cm;y_cm;ancho_cm;alto_cm;foto', ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'pared-cuadros.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // Captura de la pared a PNG. Se redibuja en un canvas en vez de fotografiar el DOM: así sale
  // a resolución alta y sin el zoom ni los bordes de selección de la pantalla.
  async function exportPng() {
    const S = Math.max(6, Math.min(24, 2400 / layout.wallW)); // px por cm
    const W = Math.round(layout.wallW * S);
    const H = Math.round(wallH * S);
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const ctx = c.getContext('2d');

    ctx.fillStyle = layout.wall;
    ctx.fillRect(0, 0, W, H);
    const g = ctx.createRadialGradient(W / 2, 0, 0, W / 2, 0, Math.max(W, H) * 1.15);
    g.addColorStop(0, 'rgba(255,255,255,0.45)');
    g.addColorStop(0.75, 'rgba(0,0,0,0.05)');
    g.addColorStop(1, 'rgba(0,0,0,0.05)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    const imgs = {};
    await Promise.all(
      Object.entries(photos).map(([id, p]) => new Promise((res) => {
        const im = new Image();
        im.onload = () => { imgs[id] = im; res(); };
        im.onerror = res;
        im.src = p.src;
      })),
    );

    const mould = layout.moulding * S;
    const matPx = matColor ? layout.mat * S : 0;
    for (const f of geo) {
      const x = f.x * S;
      const y = f.y * S;
      const w = f.w * S;
      const h = f.h * S;

      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.28)';
      ctx.shadowBlur = S * 1.8;
      ctx.shadowOffsetY = S * 0.7;
      ctx.fillStyle = style.face;
      ctx.fillRect(x, y, w, h);
      ctx.restore();
      ctx.strokeStyle = style.edge;
      ctx.lineWidth = Math.max(1, S * 0.12);
      ctx.strokeRect(x, y, w, h);

      if (matPx > 0) {
        ctx.fillStyle = matColor;
        ctx.fillRect(x + mould, y + mould, w - mould * 2, h - mould * 2);
      }

      // hueco de la foto
      const ix = x + mould + matPx;
      const iy = y + mould + matPx;
      const iw = w - (mould + matPx) * 2;
      const ih = h - (mould + matPx) * 2;
      const ph = photos[f.id];
      const im = imgs[f.id];
      if (ph && im) {
        const k = ph.fit === 'contain'
          ? Math.min(iw / im.width, ih / im.height)
          : Math.max(iw / im.width, ih / im.height);
        const z = ph.zoom || 1;
        const dw = im.width * k * z;
        const dh = im.height * k * z;
        // mismo orden que el CSS: scale(z) translate(ox%, oy%) con origen en el centro
        const cx = ix + iw / 2 + z * ((ph.ox || 0) / 100) * iw;
        const cy = iy + ih / 2 + z * ((ph.oy || 0) / 100) * ih;
        ctx.save();
        ctx.beginPath();
        ctx.rect(ix, iy, iw, ih);
        ctx.clip();
        if (ph.fit === 'contain') { ctx.fillStyle = '#0f1012'; ctx.fillRect(ix, iy, iw, ih); }
        ctx.drawImage(im, cx - dw / 2, cy - dh / 2, dw, dh);
        ctx.restore();
      } else {
        ctx.fillStyle = '#efece6';
        ctx.fillRect(ix, iy, iw, ih);
        ctx.fillStyle = '#9b968c';
        ctx.font = `${Math.round(S * 1.4)}px ui-monospace, monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(SIZES[f.size].label, ix + iw / 2, iy + ih / 2);
      }
    }

    c.toBlob((blob) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `pared-${layout.frames.length}-cuadros.png`;
      a.click();
      URL.revokeObjectURL(a.href);
    }, 'image/png');
  }

  const matColor = MAT_COLORS[layout.matColor];
  const style = FRAME_STYLES[layout.frameStyle] || FRAME_STYLES.white;
  const innerOf = (f) => {
    const pad = layout.moulding + (matColor ? layout.mat : 0);
    return { w: Math.max(1, f.w - pad * 2), h: Math.max(1, f.h - pad * 2) };
  };

  return (
    // Alto medido = ventana menos el topbar: la página no scrollea, solo el panel de opciones.
    <div ref={rootRef} className="libre flex w-full flex-col gap-2 overflow-hidden px-3 py-2" style={{ height: shellH ?? undefined }}>
      {dialog}
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { ingest(e.target.files, pendingRef.current); pendingRef.current = null; }} />

      {/* Título y acciones en una sola fila para no comerle alto al visor. */}
      <header className="flex shrink-0 items-center gap-3">
        <h1 className="hidden shrink-0 text-base tracking-tightish md:block">Simulador de pared</h1>
        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em]">
          <button onClick={toggleLock} title={locked ? 'El diseño está bloqueado: se pueden cargar fotos pero no mover cuadros' : 'Bloquear posiciones y medidas'} className={`rounded border px-2.5 py-1 transition-colors ${locked ? 'border-warning/50 bg-warning/10 text-warning' : 'border-line text-sub hover:text-white'}`}>
            {locked ? 'Bloqueado' : 'Bloquear'}
          </button>
          <button onClick={() => pickFor(null)} className="rounded border border-primary/40 bg-primary/10 px-2.5 py-1 text-glow transition-colors hover:bg-primary/20">Cargar fotos</button>
          <button onClick={tidy} disabled={locked} title="Lleva todas las separaciones al valor configurado" className="rounded border border-primary/40 bg-primary/10 px-2.5 py-1 text-glow transition-colors hover:bg-primary/20 disabled:opacity-40">Emparejar</button>
          <button onClick={undo} disabled={!history.length || locked} className="rounded border border-line px-2.5 py-1 text-sub transition-colors hover:text-white disabled:opacity-40">Deshacer</button>
          <button onClick={() => setShowSizes((v) => !v)} className={`rounded border px-2.5 py-1 transition-colors ${showSizes ? 'border-primary/40 bg-primary/10 text-glow' : 'border-line text-sub hover:text-white'}`}>Medidas</button>
          <button onClick={() => setShowList((v) => !v)} className={`rounded border px-2.5 py-1 transition-colors ${showList ? 'border-primary/40 bg-primary/10 text-glow' : 'border-line text-sub hover:text-white'}`}>Plano</button>
          <button onClick={() => setWide((v) => !v)} className={`rounded border px-2.5 py-1 transition-colors ${wide ? 'border-primary/40 bg-primary/10 text-glow' : 'border-line text-sub hover:text-white'}`}>
            {wide ? 'Ver panel' : 'Solo pared'}
          </button>
          <button onClick={toggleFullscreen} title="Pantalla completa (Esc para salir)" className={`rounded border px-2.5 py-1 transition-colors ${isFull ? 'border-primary/40 bg-primary/10 text-glow' : 'border-line text-sub hover:text-white'}`}>
            {isFull ? 'Salir' : 'Pantalla completa'}
          </button>
          <button onClick={exportPng} title="Descargar la pared como imagen PNG" className="rounded border border-line px-2.5 py-1 text-sub transition-colors hover:text-white">PNG</button>
          <button onClick={exportLayout} className="rounded border border-line px-2.5 py-1 text-sub transition-colors hover:text-white">CSV</button>
          <button onClick={resetLayout} className="rounded border border-line px-2.5 py-1 text-sub transition-colors hover:text-white">Reset</button>

          <span className="mx-1 h-5 w-px bg-line" />
          <button onClick={() => zoomBy(1 / 1.25)} className="rounded border border-line px-2.5 py-1 text-sub hover:text-white" title="Alejar">−</button>
          <span className="w-9 text-center tabular-nums text-white/80">{Math.round(zoom * 100)}%</span>
          <button onClick={() => zoomBy(1.25)} className="rounded border border-line px-2.5 py-1 text-sub hover:text-white" title="Acercar">+</button>
          <button
            onClick={() => { setZoom(1); const el = viewportRef.current; if (el) { el.scrollLeft = 0; el.scrollTop = 0; } }}
            className={`rounded border px-2.5 py-1 ${zoom === 1 ? 'border-primary/40 bg-primary/10 text-glow' : 'border-line text-sub hover:text-white'}`}
            title="Volver al 100%"
          >
            Ajustar
          </button>
        </div>
      </header>

      {warn && (
        <div className="mb-3 flex items-center justify-between rounded border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
          <span>{warn}</span>
          <button onClick={() => setWarn('')} className="font-mono text-[10px] uppercase tracking-[0.14em]">Cerrar</button>
        </div>
      )}

      <div className={`grid min-h-0 flex-1 gap-4 ${wide ? '' : 'lg:grid-cols-[1fr_300px]'}`}>
        <div ref={boxRef} className={`flex min-h-0 min-w-0 flex-col ${isFull ? 'bg-bg' : ''}`}>
          <div
            ref={viewportRef}
            className={`scroll-x relative h-[65vh] min-h-[320px] bg-black/30 lg:h-auto lg:flex-1 ${zoom <= 1 ? 'overflow-hidden' : 'overflow-auto'} ${isFull ? '' : 'rounded border border-line'}`}
          >
            <div className="flex items-center justify-center" style={{ width: 'max-content', height: 'max-content', minWidth: '100%', minHeight: '100%' }}>
          <div
            ref={wallRef}
            onPointerDown={() => setSelected(null)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); setDropOver(null); ingest(e.dataTransfer.files, null); }}
            className="relative shrink-0 select-none overflow-hidden rounded-sm shadow-[0_30px_80px_-40px_rgba(0,0,0,0.9)]"
            style={{
              width: wallPxW,
              height: wallPxH,
              background: `radial-gradient(120% 90% at 50% 0%, rgba(255,255,255,0.5), rgba(0,0,0,0.06) 75%), ${layout.wall}`,
            }}
          >
            {/* al alejar se ve pared de más: este recuadro marca dónde termina la pared real */}
            {(offX > 1 || offY > 1) && (
              <div
                className="pointer-events-none absolute"
                style={{ left: offX, top: offY, width: layout.wallW * scale, height: wallH * scale, outline: '1px dashed rgba(0,0,0,0.28)' }}
              />
            )}

            {showSizes && bounds && (
              <div className="pointer-events-none absolute inset-x-0" style={{ top: offY + bounds.cy * scale }}>
                <div className="h-px w-full" style={{ backgroundImage: 'repeating-linear-gradient(90deg,rgba(0,0,0,.35) 0 6px,transparent 6px 12px)' }} />
                <span className="absolute left-1 -top-4 font-mono text-[9px] uppercase tracking-[0.14em] text-black/50">centro del conjunto</span>
              </div>
            )}

            {guides.map((g, i) => {
              const color = g.type === 'gap' ? '#009f8b' : '#0b57d0';
              return g.dir === 'v' ? (
                <div key={i} className="pointer-events-none absolute top-0 h-full w-px" style={{ left: offX + g.at * scale, background: color }} />
              ) : (
                <div key={i} className="pointer-events-none absolute left-0 h-px w-full" style={{ top: offY + g.at * scale, background: color }} />
              );
            })}

            {geo.map((f) => {
              const ph = photos[f.id];
              const isSel = selected === f.id;
              const inn = innerOf(f);
              return (
                <div
                  key={f.id}
                  onPointerDown={(e) => startDrag(e, f.id, panMode && isSel && ph ? 'pan' : 'move')}
                  onDoubleClick={() => pickFor(f.id)}
                  onDragOver={(e) => { e.preventDefault(); setDropOver(f.id); }}
                  onDragLeave={() => setDropOver((d) => (d === f.id ? null : d))}
                  onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setDropOver(null); ingest(e.dataTransfer.files, f.id); }}
                  className={`absolute ${locked ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing'}`}
                  style={{
                    left: offX + f.x * scale,
                    top: offY + f.y * scale,
                    width: f.w * scale,
                    height: f.h * scale,
                    background: style.face,
                    border: `${Math.max(1, scale * 0.12)}px solid ${style.edge}`,
                    boxShadow: `0 ${Math.max(2, scale * 0.7)}px ${Math.max(4, scale * 1.8)}px rgba(0,0,0,0.26), inset 0 0 0 1px ${style.bevel}`,
                    outline: isSel ? '2px solid #0b57d0' : dropOver === f.id ? '2px dashed #009f8b' : 'none',
                    outlineOffset: 2,
                    zIndex: isSel ? 30 : 10,
                  }}
                >
                  <div className="absolute overflow-hidden" style={{ inset: layout.moulding * scale, background: matColor || '#111', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.18)' }}>
                    <div className="absolute overflow-hidden bg-[#0f1012]" style={{ inset: matColor ? layout.mat * scale : 0 }}>
                      {ph ? (
                        <img
                          src={ph.src}
                          alt=""
                          draggable={false}
                          className="h-full w-full"
                          style={{ objectFit: ph.fit || 'cover', transform: `scale(${ph.zoom || 1}) translate(${ph.ox || 0}%, ${ph.oy || 0}%)`, transformOrigin: 'center' }}
                        />
                      ) : (
                        <div className="flex h-full w-full flex-col items-center justify-center gap-0.5 bg-[#efece6] text-[#9b968c] transition-colors hover:bg-[#e6e2da]">
                          <span style={{ fontSize: Math.max(10, scale * 2.6) }}>+</span>
                          <span className="font-mono uppercase tracking-[0.08em]" style={{ fontSize: Math.max(6, scale * 1.1) }}>{SIZES[f.size].label}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {showSizes && (
                    <span
                      className="pointer-events-none absolute left-0 top-0 bg-white/85 px-1 font-mono uppercase tracking-[0.08em] text-black/70"
                      style={{ fontSize: Math.max(7, scale * 1.4) }}
                    >
                      {SIZES[f.size].label}{f.vertical ? 'V' : 'H'} · {fmt(f.w)}×{fmt(f.h)}
                    </span>
                  )}
                </div>
              );
            })}
              </div>
            </div>
          </div>

          {/* Una sola línea siempre: unidades una vez, atajos solo si sobra ancho. */}
          <p
            className={`mt-1 shrink-0 truncate whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.12em] text-sub ${isFull ? 'hidden' : ''}`}
            title="Alt = mover sin imán · flechas = 0,5 cm · ctrl + rueda = zoom"
          >
            Pared {fmt(layout.wallW)}×{fmt(wallH)}{autoH ? ' auto' : ''} · {layout.frames.length} marcos ·{' '}
            {bounds ? `conjunto ${fmt(bounds.w)}×${fmt(bounds.h)}` : '—'} ·{' '}
            <span className={gapSpread && gapSpread.min === gapSpread.max ? 'text-glow' : 'text-warning'}>
              sep. {gapSpread ? (gapSpread.min === gapSpread.max ? `${fmt(gapSpread.min)} pareja` : `${fmt(gapSpread.min)}–${fmt(gapSpread.max)} dispareja`) : '—'}
            </span>{' '}
            · cm
            <span className="hidden 2xl:inline"> · alt = sin imán · flechas = 0,5 · ctrl+rueda = zoom</span>
          </p>
        </div>

        <aside className={`flex min-h-0 flex-col gap-2 overflow-y-auto pr-1 text-sm lg:pb-2 ${wide ? 'lg:hidden' : ''}`}>
          <section className="rounded border border-line bg-panel p-2.5">
            <h2 className="mb-1.5 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.18em] text-sub">
              <span>Guardado</span>
              <span className={canSave ? 'text-glow' : 'text-error'}>{canSave ? (savedAt ? 'automático' : 'listo') : 'desactivado'}</span>
            </h2>
            <div className="flex flex-wrap gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em]">
              <button onClick={downloadBackup} className="rounded border border-primary/40 bg-primary/10 px-2 py-1 text-glow hover:bg-primary/20">Descargar respaldo</button>
              <button onClick={() => bakRef.current.click()} className="rounded border border-line px-2 py-1 text-sub hover:text-white">Cargar respaldo</button>
            </div>
            <input ref={bakRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => { if (e.target.files[0]) importBackup(e.target.files[0]); e.target.value = ''; }} />
            {baks.length > 0 && (
              <details className="mt-1.5 border-t border-line pt-1.5">
                <summary className="cursor-pointer select-none font-mono text-[10px] uppercase tracking-[0.14em] text-sub marker:text-sub hover:text-white">
                  Copias automáticas ({baks.length})
                </summary>
                <div className="mt-1 space-y-1">
                  {baks.map((b) => (
                    <div key={b.t} className="flex items-center justify-between gap-2 font-mono text-[10px]">
                      <span className="text-sub">{new Date(b.t).toLocaleString('es', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} · {b.layout.frames?.length ?? '?'} marcos</span>
                      <button onClick={() => restoreBak(b)} className="rounded border border-line px-2 py-0.5 text-sub hover:text-white">Restaurar</button>
                    </div>
                  ))}
                </div>
                <p className="mt-1.5 text-[11px] leading-tight text-sub">
                  Guardado por navegador y por dirección: otro puerto = otro guardado. El respaldo en archivo no.
                </p>
              </details>
            )}
          </section>

          <section className="rounded border border-line bg-panel p-2.5">
            <h2 className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-sub">Separación</h2>
            <label className="block">
              <span className="flex justify-between text-[11px] text-sub"><span>Entre cuadros</span><span className="font-mono text-glow">{fmt(layout.gap)} cm</span></span>
              <input type="range" min={2} max={12} step={0.5} value={layout.gap} onChange={(e) => setLayout({ ...layout, gap: Number(e.target.value) })} className="mt-1 w-full accent-[#009f8b]" />
            </label>
            <button onClick={tidy} disabled={locked} className="mt-1.5 w-full rounded border border-primary/40 bg-primary/10 px-2 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-glow hover:bg-primary/20">
              Emparejar todo a {fmt(layout.gap)} cm
            </button>
            <p className="mt-1.5 text-[11px] leading-tight text-sub">
              El imán ya usa esta distancia; el botón corrige los que quedaron desparejos.
            </p>
          </section>

          <section className="rounded border border-line bg-panel p-2.5">
            <h2 className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-sub">Marcos comprados</h2>
            <table className="w-full font-mono text-[10px]">
              <thead className="text-sub">
                <tr className="border-b border-line text-left"><th className="py-1">Medida</th><th>Exterior</th><th className="text-right">Tengo</th><th className="text-right">Uso</th></tr>
              </thead>
              <tbody>
                {SIZE_KEYS.map((k) => {
                  const s = SIZES[k];
                  const over = used[k] > (layout.stock[k] || 0);
                  return (
                    <tr key={k} className="border-b border-line/50">
                      <td className="py-1">{s.label}</td>
                      <td className="text-sub">{fmt(s.pw + layout.moulding * 2)}×{fmt(s.ph + layout.moulding * 2)}</td>
                      <td className="text-right">
                        <input
                          type="number"
                          min={0}
                          value={layout.stock[k] ?? 0}
                          onChange={(e) => setLayout({ ...layout, stock: { ...layout.stock, [k]: Math.max(0, Number(e.target.value) || 0) } })}
                          className="w-10 rounded border border-line bg-panel2 px-1 py-0.5 text-right font-mono text-[10px]"
                        />
                      </td>
                      <td className={`text-right ${over ? 'text-error' : used[k] ? 'text-glow' : 'text-sub'}`}>{used[k]}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="mt-1.5 text-[11px] leading-tight text-sub">
              En rojo = usás más marcos de los que tenés.
            </p>
          </section>

          <section className="rounded border border-line bg-panel p-2.5">
            <h2 className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-sub">Agregar cuadro</h2>
            <div className="space-y-1">
              {SIZE_KEYS.map((k) => {
                const left = (layout.stock[k] || 0) - used[k];
                return (
                  <div key={k} className="flex items-center gap-2">
                    <span className="w-14 font-mono text-[11px]">{SIZES[k].label}</span>
                    <button onClick={() => addFrame(k, true)} disabled={locked} title="Vertical" className="flex-1 rounded border border-line py-1 text-[11px] text-sub hover:bg-primary/10 hover:text-glow disabled:opacity-40">▯</button>
                    <button onClick={() => addFrame(k, false)} disabled={locked} title="Horizontal" className="flex-1 rounded border border-line py-1 text-[11px] text-sub hover:bg-primary/10 hover:text-glow disabled:opacity-40">▭</button>
                    <span className={`w-14 text-right font-mono text-[10px] ${left < 0 ? 'text-error' : 'text-sub'}`}>{left} libre{Math.abs(left) === 1 ? '' : 's'}</span>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="rounded border border-line bg-panel p-2.5">
            <h2 className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-sub">{sel ? 'Cuadro seleccionado' : 'Seleccioná un cuadro'}</h2>
            {!sel && <p className="text-xs text-sub">Doble clic en un cuadro carga o cambia la foto. Arrastrá para moverlo.</p>}
            {sel && (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-1">
                  {SIZE_KEYS.map((k) => (
                    <button key={k} disabled={locked} onClick={() => { pushHistory(); setFrame(sel.id, { size: k }); }} className={`rounded border px-2 py-1 font-mono text-[10px] ${sel.size === k ? 'border-primary/50 bg-primary/10 text-glow' : 'border-line text-sub hover:text-white'}`}>
                      {SIZES[k].label}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className="text-[11px] text-sub">X (cm)</span>
                    <input type="number" step={0.5} value={sel.x} disabled={locked} onChange={(e) => setFrame(sel.id, { x: Number(e.target.value) })} className="mt-1 w-full rounded border border-line bg-panel2 px-2 py-1 font-mono text-xs disabled:opacity-50" />
                  </label>
                  <label className="block">
                    <span className="text-[11px] text-sub">Y (cm)</span>
                    <input type="number" step={0.5} value={sel.y} disabled={locked} onChange={(e) => setFrame(sel.id, { y: Number(e.target.value) })} className="mt-1 w-full rounded border border-line bg-panel2 px-2 py-1 font-mono text-xs disabled:opacity-50" />
                  </label>
                </div>
                <div className="flex flex-wrap gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em]">
                  <button onClick={() => { pushHistory(); setFrame(sel.id, { vertical: !sel.vertical }); }} disabled={locked} className="rounded border border-line px-2 py-1 text-sub hover:text-white disabled:opacity-40">Girar</button>
                  <button onClick={() => pickFor(sel.id)} className="rounded border border-line px-2 py-1 text-sub hover:text-white">Foto</button>
                  <button onClick={() => pedirBorrarMarco(sel.id)} disabled={locked} className="rounded border border-error/40 px-2 py-1 text-error hover:bg-error/10 disabled:opacity-40">Borrar</button>
                </div>
                <div className="rounded border border-line bg-panel2 px-2 py-1.5 font-mono text-[10px] text-sub">
                  Exterior {fmt(sel.w)}×{fmt(sel.h)} cm · foto a imprimir {fmt(innerOf(sel).w)}×{fmt(innerOf(sel).h)} cm
                </div>

                {photos[sel.id] && (
                  <div className="space-y-1.5 border-t border-line pt-2">
                    <div className="flex flex-wrap gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em]">
                      <button onClick={() => setPanMode((v) => !v)} className={`rounded border px-2 py-1 ${panMode ? 'border-primary/50 bg-primary/10 text-glow' : 'border-line text-sub hover:text-white'}`}>
                        {panMode ? 'Moviendo foto' : 'Reencuadrar'}
                      </button>
                      <button onClick={() => setPhoto(sel.id, { fit: photos[sel.id].fit === 'cover' ? 'contain' : 'cover' })} className="rounded border border-line px-2 py-1 text-sub hover:text-white">
                        {photos[sel.id].fit === 'contain' ? 'Completa' : 'Recortada'}
                      </button>
                      <button onClick={() => pedirQuitarFoto(sel.id)} className="rounded border border-line px-2 py-1 text-sub hover:text-white">Quitar</button>
                    </div>
                    <label className="block">
                      <span className="flex justify-between text-[11px] text-sub"><span>Zoom</span><span className="font-mono">{(photos[sel.id].zoom || 1).toFixed(2)}×</span></span>
                      <input type="range" min={1} max={3} step={0.01} value={photos[sel.id].zoom || 1} onChange={(e) => setPhoto(sel.id, { zoom: Number(e.target.value) })} className="mt-1 w-full accent-[#009f8b]" />
                    </label>
                    <button onClick={() => setPhoto(sel.id, { zoom: 1, ox: 0, oy: 0 })} className="font-mono text-[10px] uppercase tracking-[0.12em] text-sub hover:text-white">Centrar</button>
                    {photos[sel.id].ratio && (
                      <p className="font-mono text-[10px] text-sub">
                        Foto {photos[sel.id].ratio.toFixed(2)} vs marco {(innerOf(sel).w / innerOf(sel).h).toFixed(2)}
                        {Math.abs(photos[sel.id].ratio - innerOf(sel).w / innerOf(sel).h) > 0.15 ? ' — recorte importante' : ' — encaja bien'}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </section>

          <section className="rounded border border-line bg-panel p-2.5">
            <h2 className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-sub">Pared y marcos</h2>
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="text-[11px] text-sub">Ancho (cm)</span>
                <input type="number" value={layout.wallW} min={60} onChange={(e) => setLayout({ ...layout, wallW: Number(e.target.value) || 60 })} className="mt-1 w-full rounded border border-line bg-panel2 px-2 py-1 font-mono text-xs" />
              </label>
              <label className="block">
                <span className="text-[11px] text-sub">Alto (cm)</span>
                <input
                  type="number"
                  value={autoH ? wallH : layout.wallH}
                  min={60}
                  disabled={autoH}
                  onChange={(e) => setLayout({ ...layout, wallH: Number(e.target.value) || 60 })}
                  className="mt-1 w-full rounded border border-line bg-panel2 px-2 py-1 font-mono text-xs disabled:opacity-50"
                />
              </label>
            </div>
            <label className="mt-2 flex items-center gap-2 text-[11px] text-sub">
              <input type="checkbox" checked={autoH} onChange={(e) => setLayout({ ...layout, autoHeight: e.target.checked, wallH: e.target.checked ? layout.wallH : wallH })} className="accent-[#009f8b]" />
              Alto automático (la pared llena la pantalla)
            </label>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {WALL_COLORS.map((c) => (
                <button key={c.id} title={c.id} onClick={() => setLayout({ ...layout, wall: c.v })} className={`h-6 w-6 rounded-full border ${layout.wall === c.v ? 'border-glow ring-2 ring-primary/50' : 'border-white/20'}`} style={{ background: c.v }} />
              ))}
            </div>
            <label className="mt-2 block">
              <span className="flex justify-between text-[11px] text-sub"><span>Borde del marco</span><span className="font-mono">{fmt(layout.moulding)} cm</span></span>
              <input type="range" min={0.4} max={3} step={0.1} value={layout.moulding} onChange={(e) => setLayout({ ...layout, moulding: Number(e.target.value) })} className="mt-1 w-full accent-[#009f8b]" />
            </label>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {Object.entries(FRAME_STYLES).map(([k, v]) => (
                <button key={k} onClick={() => setLayout({ ...layout, frameStyle: k })} className={`rounded border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em] ${layout.frameStyle === k ? 'border-primary/50 bg-primary/10 text-glow' : 'border-line text-sub hover:text-white'}`}>
                  {v.name}
                </button>
              ))}
            </div>
            <label className="mt-2 block">
              <span className="flex justify-between text-[11px] text-sub"><span>Passepartout (borde blanco impreso)</span><span className="font-mono">{matColor ? `${fmt(layout.mat)} cm` : 'sin'}</span></span>
              <input type="range" min={0} max={5} step={0.2} value={layout.mat} onChange={(e) => setLayout({ ...layout, mat: Number(e.target.value) })} className="mt-1 w-full accent-[#009f8b]" disabled={!matColor} />
            </label>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {Object.keys(MAT_COLORS).map((k) => (
                <button key={k} onClick={() => setLayout({ ...layout, matColor: k })} className={`rounded border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em] ${layout.matColor === k ? 'border-primary/50 bg-primary/10 text-glow' : 'border-line text-sub hover:text-white'}`}>
                  {k}
                </button>
              ))}
            </div>
          </section>

          {showList && (
            <section className="rounded border border-line bg-panel p-2.5">
              <h2 className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-sub">Plano de colgado</h2>
              <table className="w-full font-mono text-[10px]">
                <thead className="text-sub">
                  <tr className="border-b border-line text-left"><th className="py-1">#</th><th>Marco</th><th>X</th><th>Y</th><th>Foto</th></tr>
                </thead>
                <tbody>
                  {[...geo].sort((a, b) => a.y - b.y || a.x - b.x).map((f, i) => (
                    <tr key={f.id} onClick={() => setSelected(f.id)} className={`cursor-pointer border-b border-line/50 ${selected === f.id ? 'text-glow' : ''}`}>
                      <td className="py-1">{i + 1}</td>
                      <td>{SIZES[f.size].label}{f.vertical ? ' V' : ' H'}</td>
                      <td>{fmt(f.x)}</td>
                      <td>{fmt(f.y)}</td>
                      <td>{photos[f.id] ? '✓' : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {bounds && (
                <p className="mt-2 text-[10px] leading-snug text-sub">
                  Conjunto {fmt(bounds.w)}×{fmt(bounds.h)} cm. X/Y = esquina superior izquierda de cada marco medida desde
                  la esquina superior izquierda de la pared ({fmt(layout.wallW)}×{fmt(wallH)} cm).
                </p>
              )}
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
