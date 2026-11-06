# SportsView

App de escritorio para macOS (y Windows) para ver **varios partidos en vivo a la vez**, con marcador, box score, mercados de Polymarket y alertas de jugadores al lado del stream.

Nació para no depender de Stremio desktop: junta en un solo lugar tus fuentes (addons de Stremio, listas IPTV/M3U, cuentas Xtream, YouTube) y las pone en un multiview con audio por stream, PiP y salida a la tele.

## Qué hace

### Multiview
- Arranca con un player grande. Con **+ Agregar** (`A`) sumas streams y el grid crece solo (1 → 2 → 2x2 → 3x3); al cerrar uno se compacta. También hay layouts manuales `1`, `2`, `2x2`, `1+3` y `3x3`, y puedes arrastrar un slot sobre otro para intercambiarlos.
- **Audio por stream**: mute y volumen por slot, volumen general y `solo`. Los streams nuevos entran silenciados si ya hay otro sonando.
- **Picture in Picture** nativo por slot y **mini player**, que es toda la app como ventanita flotante encima de todo.
- **Mandar a la tele** (AirPlay/HDMI como pantalla extendida): un slot (`T`) o el multiview completo (`Shift+T`).
- Si un stream se congela 20 s, se reinicia solo. Al cerrar el último stream vuelves a Inicio.

### Fuentes
- **Addons de Stremio**: pegas la URL del `manifest.json`. Usa sus catálogos, pero solo streams HTTP/HLS directos (no torrents).
- **Listas M3U/IPTV**: lee `tvg-logo`, `group-title`, `#EXTVLCOPT`, `#EXTHTTP` y headers estilo Kodi (`url|Referer=…`).
- **Cuentas Xtream Codes**: la contraseña se guarda cifrada en el Llavero (`safeStorage`) y se respeta el `max_connections` del plan.
- **YouTube**: links `watch?v=`, `youtu.be`, `/live/` o `@canal/live`, con el reproductor oficial incrustado.
- **URL directa**: `.m3u8`, `.ts`, `.flv` o `.mp4`.

### Catálogos
- Filas por catálogo en Inicio, búsqueda y "Ver todo" con scroll infinito.
- Los catálogos de deportes se **dividen por liga** usando los géneros de cada evento, con chips para filtrar.
- Solo se muestran los **juegos de hoy que no han terminado**: usa el estado de ESPN cuando lo sabe y, si no, el inicio más la duración típica del deporte. Los canales 24/7 siempre aparecen.

### Modo partido
Cuando hay un solo stream en pantalla (o uno ampliado) vinculado a un partido:
- **Debajo del stream** (nunca encima): marcador y panel con *Box score*, *Estadísticas* y *Cara a cara*.
- **Columna derecha**:
  - cara a cara de los mejores jugadores;
  - "¿Quién gana?", con el precio de Polymarket y la probabilidad de victoria de ESPN en la misma gráfica;
  - una apuesta por jugador o, en la NFL, el over/under de puntos.
- **NBA en vivo**: los 5 que están en cancha aparecen arriba con un LED; la banca va debajo, atenuada.
- **Identificación automática** del partido, en este orden:
  1. el título del stream ("Heat vs Warriors");
  2. la guía EPG de Xtream;
  3. la cadena que lo transmite, solo si no hay ambigüedad.

  Si no lo encuentra, ofrece buscarlo a mano (`G`).

### Seguir a un jugador
Eliges un jugador (con el ícono de mira en el box score, la tarjeta **Siguiendo** o la tecla `J`) y las stats que te importan. La app te avisa cada vez que cambian:

| Deporte | Stats |
| --- | --- |
| NBA | puntos, rebotes, asistencias, triples, robos, tapones |
| NFL | yardas de pase / carrera / recepción, recepciones, acarreos, TDs, intercepciones, capturas, tacleadas |
| Fútbol | goles, asistencias, tiros, tiros a puerta, atajadas, amarillas |
| NHL / MLB | goles, asistencias, tiros, atajadas / hits, jonrones, carreras impulsadas, ponches |

- La alerta aparece sobre el stream ("+1 REC · +23 YDS REC" y los totales). Si estás en otra app, llega como notificación de macOS.
- **Retraso configurable** (0–90 s, 30 por default) para que la alerta no te adelante lo que el stream, que va atrasado, todavía no muestra.

## Correr

```bash
npm install
npm run fonts        # descarga Chubbo y Supreme de Fontshare (ver "Fuentes")
npm run dev          # Vite + Electron con hot reload
npm run dev:web      # solo en el navegador: http://127.0.0.1:5173
npm start            # build de producción y abre la app
npm run install-app  # build + instala ~/Applications/SportsView.app
npm run dist         # instaladores .dmg (universal) y .exe para compartir
npm run typecheck
```

- El empaquetado se hace en `~/Library/Caches/sportsview-release`, porque iCloud (Documentos) rompe `codesign`.
- La app va firmada ad-hoc y sin notarizar. En otra Mac hay que correr `xattr -dr com.apple.quarantine /Applications/SportsView.app`.
- **Variables:**
  - `SPORTSVIEW_PORT` cambia el puerto local (47815 por default) para correr una segunda instancia de pruebas con `--user-data-dir`.
  - `SPORTSVIEW_TV_TEST=1` trata la pantalla actual como tele.

## Atajos (Multiview)

`1-9` enfocar · `A` agregar · `F` / doble clic ampliar · `Shift+F` pantalla completa · `M` mute del slot · `Shift+M` mute general · `↑/↓` volumen · `S` solo · `P` PiP · `R` recargar · `X` cerrar · `T` / `Shift+T` tele · `G` vincular partido · `I` mostrar/ocultar modo partido · `J` seguir jugador · `Esc` volver. En YouTube: `←/→` ±10 s y `Espacio` pausa.

## Cómo funciona

| Pieza | Qué hace |
| --- | --- |
| `electron/main.ts` | Sirve `dist/` y el proxy en `127.0.0.1:47815`. El puerto es fijo para que `localStorage` persista. También maneja secretos cifrados, ventanas de tele y mini player. |
| `server/proxy.ts` | Proxy local (`/proxy?url=&h=`) que agrega CORS y headers custom, y reescribe playlists HLS para que segmentos y keys también pasen por él. Solo escucha en localhost. |
| `src/components/Player.tsx` | `hls.js` para HLS y `mpegts.js` para MPEG-TS/FLV, con fallback automático entre ambos. |
| `src/lib/espn.ts` | API pública de ESPN (sin key): scoreboards, box score, probabilidad de victoria y serie. En fútbol las stats por jugador salen de los rosters. |
| `src/lib/polymarket.ts` | Gamma + CLOB, solo lectura: moneyline, props, totales e historial de precios. |
| `src/lib/identify.ts` | Vincula streams a partidos por título, EPG o cadena. |
| `src/lib/schedule.ts` | Filtra los juegos de hoy que no han terminado. |
| `src/lib/track.ts` | Seguimiento de jugadores: compara cada poll contra el anterior y encola alertas con retraso. |
| `src/lib/poll.ts` | Polling compartido: todos los componentes que piden el mismo dato reusan una sola petición. |

Las fuentes, el layout, los slots, los favoritos y los jugadores seguidos se guardan en `localStorage`. Las contraseñas no: van en `userData/secrets.json`, cifradas con el Llavero.

### Fuentes

Chubbo y Supreme son de [Fontshare](https://www.fontshare.com) y su licencia ([ITF Free Font License](https://www.fontshare.com/licenses/itf-ffl)) no permite redistribuir los archivos, así que **no vienen en el repo**: `npm run fonts` baja tu propia copia a `src/fonts/`. Sin ellas la app funciona igual con fuentes del sistema. Departure Mono (SIL OFL 1.1) sí viene incluida, e IBM Plex Mono llega por npm.

**Stack:** Electron, React 19, Vite, TypeScript, hls.js y mpegts.js. El diseño usa la paleta de [fernando-portfolio](https://github.com/fernanclok/fernando-portfolio) con las tipografías Chubbo, Supreme, IBM Plex Mono y Departure Mono.

> Proyecto personal. Las APIs de ESPN y Polymarket no son oficiales y pueden cambiar. La app no incluye contenido ni fuentes: usa las que tú agregues.
