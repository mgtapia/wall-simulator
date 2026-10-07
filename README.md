# Pared

Simulador de pared de cuadros: acomoda marcos y fotos sobre una pared a escala antes de imprimir. Proyecto personal, sacado de `bison-social` el 2026-10-07 (no tiene relación con Bison).

```
npm install
npm run dev     # http://localhost:3000
```

**Tus datos** (el layout, las fotos y las copias rotativas) viven en el `localStorage` del navegador, con las claves `pared:v2:layout`, `pared:v2:photos` y `pared:v2:copias`. El navegador guarda eso **por origen** (dirección y puerto): para ver lo que ya tenías, abre este proyecto en el mismo puerto donde lo usabas (`http://localhost:3000`, con el hub apagado). Otro puerto empieza vacío.

Las fotos de `public/temp/` son las que tenías ahí para armar la pared.

- `components/WallSimulator.jsx`: el simulador.
- `lib/wallGeometry.mjs`: la geometría (alineado, huecos, límites).
- `components/ConfirmDialog.jsx`: el diálogo de confirmación (copiado tal cual del hub).
- Estilos: Tailwind 3 con los mismos colores del hub (`tailwind.config.js`).
