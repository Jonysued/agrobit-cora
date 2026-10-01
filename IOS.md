# Lucient para iPhone y iPad

Proyecto nativo Capacitor 8.5.2, identificador `com.lucient.app`, versión 1.0.2.
El proyecto usa Swift Package Manager y requiere Xcode 26 o posterior.

## Preparar y compilar

1. `npm ci`
2. Configurar `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` en `.env.local` (solo URL pública y clave publishable/anon).
3. `npm run typecheck && npm run lint && npm test`
4. `npm run ios:sync`
5. `node scripts/verify-ios-bundle.mjs`
6. `npm run ios:open` o usar el workflow **Lucient iOS build** en GitHub Actions.

El workflow usa las variables de repositorio `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`. Compila para simulador y archiva para dispositivo sin firma. El archivo `Lucient-iOS-unsigned` sirve para verificar compilación; todavía no es instalable mediante TestFlight.

## Funcionamiento

Las pantallas, lector QR y recursos propios se incluyen dentro de la aplicación. No se utiliza `server.url` ni un sitio remoto para el arranque. El primer inicio de sesión necesita conexión; las siguientes aperturas pueden usar la sesión y el perfil previamente guardados. La app nativa usa email y contraseña; los enlaces de confirmación y recuperación apuntan al sitio público de Lucient. OAuth Google permanece disponible en la web.

El botón de escanear abre directamente la cámara tras el permiso inicial de iOS. El permiso explica que se usa para los QR de pozos y válvulas; el lector pide video y no micrófono. Al salir de la app se detiene la cámara y se puede abrir de nuevo desde el botón.

IndexedDB conserva datos por usuario y una cola de cambios. La confirmación local espera a que la transacción termine con durabilidad estricta. Se mantiene el ID de cada solicitud, la hora original del teléfono y el orden; el servidor revalida permisos y evita duplicados. Los errores quedan pendientes para revisión.

El plugin nativo de red detecta la reconexión aunque `navigator.onLine` del WebView quede desactualizado. La app reintenta sincronizar al recuperar conexión, al volver al primer plano y cada 15 segundos mientras está abierta. iOS puede suspenderla: no se promete sincronización con la app cerrada. No desinstalar ni borrar datos mientras haya pendientes.

Clima y sondas muestran la última descarga; nuevas consultas necesitan internet. El mapa satelital necesita conexión en la app nativa. Los puntos de pozos usan sus coordenadas guardadas y los perímetros conservan sus colores actuales. El perfil regador mantiene acceso solo a escaneo y cambios de estado.

## Firma y distribución pendientes

Antes de generar un IPA instalable hay que registrar `com.lucient.app` en Apple Developer, crear Lucient en App Store Connect y configurar un perfil App Store propio de Lucient y un certificado de distribución válido. Un perfil de otra app (por ejemplo Rimonim) no sirve para Lucient.

El certificado privado, su contraseña, el perfil y la clave App Store Connect se guardan como secretos de CI, nunca en este repositorio. Después se archiva con firma, se exporta el IPA y se sube a App Store Connect para TestFlight. Completar la declaración de privacidad y verificar en un iPhone real el permiso de cámara, el cierre/reapertura sin señal y la sincronización de registros antes de distribuir ampliamente.
