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
