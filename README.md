# Lucient

Plataforma de monitoreo y decisión para riego y energía agrícola.

## Arquitectura

- React + Vite para la aplicación web.
- Supabase Auth para usuarios y sesiones.
- Supabase Postgres con RLS para datos.
- Supabase Storage para documentos.
- Supabase Edge Functions para Davis WeatherLink y Sentek IrriMAX Live.
- Vercel para publicar el frontend.

## Configuración local

1. Instalá dependencias:

   ```bash
   npm install
   ```

2. Copiá `.env.example` como `.env.local` y completá:

   ```text
   VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
   VITE_SUPABASE_ANON_KEY=YOUR_PUBLISHABLE_OR_ANON_KEY
   ```

3. Ejecutá:

   ```bash
   npm run dev
   ```

## Preparar Supabase

Aplicá la migración:

```bash
supabase db push
```

Desplegá las funciones:

```bash
supabase functions deploy fetch-weather-station-data
supabase functions deploy test-weather-station
supabase functions deploy fetch-sentek-probe-data
supabase functions deploy test-sentek-probe
supabase functions deploy sync-all-sentek-probes
```

Secrets de las integraciones:

```bash
supabase secrets set WEATHER_DAVIS_API_KEY=...
supabase secrets set WEATHER_DAVIS_API_SECRET=...
supabase secrets set SENTEK_IRRIMAX_API_TOKEN=...
```

La primera cuenta creada después de aplicar la migración recibe rol `admin`.
Las siguientes reciben rol `user`.

## Verificación

```bash
npm run typecheck
npm run lint
npm run build
```

## Vercel

Configurá `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` para Production,
Preview y Development. Los cambios enviados a `main` generan un deployment
automático.

## Instalar y trabajar sin conexión

Android: abrir la app en Chrome y elegir **Instalar Lucient** o **Agregar a pantalla principal**. iPhone/iPad: abrir en Safari, Compartir → **Agregar a pantalla de inicio**.

Después de instalar, abrir e iniciar sesión con conexión. Esperar que la app se prepare y descargar las secciones que se usarán en campo. Los datos descargados y los cambios quedan en IndexedDB, separados por usuario y perfil. Los registros agrícolas y los cambios de estado de válvulas/pozos se pueden cargar sin conexión; se sincronizan automáticamente con la app abierta cuando vuelve internet o al volver a abrirla. El primer inicio de sesión, las integraciones, la administración de usuarios/equipos y las correcciones de auditoría requieren conexión.

El clima y las sondas muestran la última descarga; no se crean lecturas nuevas sin conexión. El satélite conserva hasta 256 imágenes de zonas visitadas. Las acciones de riego offline conservan la hora del teléfono, identificada como tal; el servidor registra además la hora de recepción y recalcula el estado por orden temporal. Mantener la fecha/hora automática del teléfono.

Una cola duradera y solicitudes idempotentes evitan duplicados al reintentar. Los conflictos quedan pendientes y visibles; **Revisar pendientes** permite decidir explícitamente qué versión aplicar. Los permisos se validan nuevamente en el servidor al sincronizar. No desinstalar ni borrar los datos del navegador mientras haya cambios pendientes. En iOS, la sincronización con la app cerrada no está garantizada: continúa automáticamente al abrirla.

El build genera `/sw.js` con todos los archivos compilados, incluso las pantallas y el lector QR cargados de forma diferida. Una actualización se activa cuando se cierran las ventanas anteriores para evitar mezclar versiones. La migración `20260930215315_offline_sync.sql` habilita la sincronización y sus protecciones. Ejecutar `npm test` además de los controles habituales.
