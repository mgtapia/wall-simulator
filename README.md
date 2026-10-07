# Pared

Simulador de pared de cuadros: acomoda marcos y fotos sobre una pared a escala antes de imprimir y colgar.

## Qué hace

- Pared con medidas configurables (cm) y varios colores.
- Marcos en medidas estándar (10×15, 13×18, 15×21, 18×24, 21×30), verticales u horizontales, en blanco, negro, roble o nogal, con borde y paspartú ajustables.
- Imán y alineado entre cuadros; **Emparejar** lleva todas las separaciones al valor configurado.
- Carga de fotos en cada marco, con zoom y encuadre.
- Control de stock: cuántos marcos tienes de cada medida y cuántos usas.
- Bloqueo del diseño, deshacer, zoom, pantalla completa y exportación a PNG.
- Plano de colgado con las posiciones.
- Respaldo: copias rotativas automáticas y descarga/carga de respaldo manual.

**Atajos:** `Alt` mueve sin imán · flechas mueven 0,5 cm · `Ctrl` + rueda hace zoom.

## Uso

```
npm install
npm run dev     # http://localhost:3000
```

Otros scripts: `npm run build` y `npm start`.

## Tus datos

Todo se guarda en el `localStorage` del navegador (no hay servidor ni base de datos), con las claves `pared:v2:layout`, `pared:v2:photos` y `pared:v2:copias`. El navegador guarda eso **por origen** (dirección y puerto): para ver lo que ya tenías, abre el proyecto en el mismo puerto donde lo usabas. Otro puerto empieza vacío. Usa **Descargar respaldo** para no depender del navegador.

## Estructura

- `components/WallSimulator.jsx`: el simulador.
- `lib/wallGeometry.mjs`: la geometría (alineado, huecos, límites).
- `components/ConfirmDialog.jsx`: diálogo de confirmación.
- `public/temp/`: fotos de ejemplo.
- Estilos: Tailwind 3 (`tailwind.config.js`).

## Stack

Next.js 16, React 19 y Tailwind CSS 3.

---

Proyecto personal, sacado de `bison-social` el 2026-10-07 (no tiene relación con Bison).
