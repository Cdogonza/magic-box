# 📱 Guía de Instalación en Celular Huawei (Termux)

Esta guía explica paso a paso cómo convertir tu celular **Huawei viejo** en el cerebro autónomo de la **Caja Mágica**, corriendo en segundo plano sin pantallas.

---

## 1. Instalar Termux y Termux:API en el Huawei

> ⚠️ **IMPORTANTE CON HUAWEI / ANDROID:**  
> **NO instales Termux desde Google Play Store** (esa versión está abandonada y da errores de repositorios).

1. Abre el navegador en tu Huawei y entra a:
   * **Termux (APK):** [f-droid.org/packages/com.termux/](https://f-droid.org/packages/com.termux/) (baja hasta "Download APK")
   * **Termux:API (APK):** [f-droid.org/packages/com.termux.api/](https://f-droid.org/packages/com.termux.api/)
2. Instala ambos archivos APK en el celular concediendo los permisos habituales.

---

## 2. Configurar el Huawei para que NO cierre la App (Clave en EMUI)

Los teléfonos Huawei tienen un sistema de ahorro de batería muy agresivo que apaga las aplicaciones de fondo. Para que la caja funcione 24/7 incluso con la pantalla apagada:

1. Ve a **Ajustes** > **Batería** > **Inicio de aplicaciones** (o *App Launch*).
2. Busca **Termux** en la lista.
3. Cambia la opción de "Gestionar automáticamente" a **"Gestionar manualmente"**.
4. Asegúrate de activar las tres casillas:
   - ✅ **Inicio automático**
   - ✅ **Inicio secundario**
   - ✅ **Ejecutar en segundo plano**
5. Abre la aplicación **Termux** en el celular y escribe el siguiente comando para evitar que el procesador entre en suspensión profunda:
   ```bash
   termux-wake-lock
   ```

---

## 3. Instalar Paquetes Necesarios en Termux

Abre **Termux** y escribe estos comandos (es muy importante hacer `pkg upgrade` para evitar desincronización de librerías como `libplacebo` / `ffmpeg`):

```bash
pkg update -y
pkg upgrade -y
pkg install -y nodejs-lts ffmpeg mpv termux-api git
```
*(Si durante `pkg upgrade` te pregunta sobre archivos de configuración, simplemente presiona **Enter** para aceptar el valor predeterminado).*

Concede los permisos de almacenamiento y micrófono a Termux:
```bash
termux-setup-storage
```
*(Acepta la ventana emergente en la pantalla del celular).*

> 💡 **Solución si FFmpeg falla con error de `libplacebo.so` o `CANNOT LINK EXECUTABLE`:**  
> En Termux esto ocurre cuando se instala un paquete sin haber actualizado las librerías base de C++. Se soluciona ejecutando en Termux:  
> `pkg update -y && pkg upgrade -y && pkg install -y ffmpeg mpv`

---

## 4. Copiar y Ejecutar el Proyecto en el Celular

### Opción A: Descargar directamente desde tu computadora
Puedes comprimir la carpeta `magic-Box` en un archivo `.zip`, pasarla al celular por cable o Bluetooth, y descomprimirla. O clonar tu repositorio si lo subes a GitHub:

```bash
git clone https://github.com/Cdogonza/magic-box.git magic-Box
cd magic-Box
npm install
node generate_sounds.js
```

### Iniciar la Caja:
```bash
node server.js
```

---

## 5. Vincular WhatsApp

1. Al ejecutar `node server.js`, aparecerá el **Código QR** dibujado directamente en la pantalla de texto de Termux.
2. Abre WhatsApp en el celular donde esté la línea que quieras usar (un chip prepago, un número secundario o el tuyo):
   * Ve a **Ajustes / Menú de tres puntos** > **Dispositivos vinculados**.
   * Toca **Vincular un dispositivo**.
   * Escanea el código QR que se muestra en la pantalla del Huawei.
3. ¡Listo! La sesión queda guardada permanentemente en la carpeta `auth_info_baileys`. La próxima vez que inicies no tendrás que volver a escanearlo.

---

## 6. Seleccionar el Grupo Familiar

1. Desde cualquier computadora o celular conectado al mismo Wi-Fi de tu casa, abre el navegador e ingresa a:
   ```
   http://IP_DE_TU_HUAWEI:3000
   ```
   *(Para saber la IP de tu Huawei en Termux, puedes escribir `ifconfig wlan0`).*
2. Toca el botón de engranaje **⚙️** en la esquina superior derecha.
3. Elige tu **Grupo Familiar** en el desplegable y dale a **Guardar Cambios**.

---

## 7. Puesta en Producción 24/7 (Autónoma y Desatendida)

Para que el celular funcione dentro de la caja sellada sin intervención humana:

### A. Supervisor PM2 y Auto-Arranque en Boot
Ejecuta el script automatizado dentro de la carpeta del proyecto en Termux:
```bash
bash setup-autostart.sh
```
Este script:
1. Instala **PM2** (el gestor de procesos que revive `server.js` en 2 segundos si hay cualquier error o excepción).
2. Configura **Termux:Boot** para que, al encender o reiniciar el teléfono, el servidor y la interfaz web arranquen solos.
3. Puedes ver el estado de la caja en cualquier momento ejecutando: `pm2 status`

---

## 8. Mantener la Pantalla Siempre Encendida (Modo Kiosk)

Dado que el celular estará sellado en la caja y los niños no deben ver barras de navegación:

1. **Ajustes de Pantalla en Huawei:**
   * Ve a **Ajustes** > **Pantalla** > **Reposo / Suspender** y selecciona **Nunca** (o activa *Opciones de Desarrollador* > *Pantalla siempre activa al cargar*).
2. **Navegador Kiosk (Recomendado para producción):**
   * Descarga e instala **Fully Kiosk Browser** (APK gratis en [fully-kiosk.com](https://www.fully-kiosk.com/)).
   * Configura la URL inicial en: `http://localhost:3000`
   * Activa:
     - ✅ **Enable Kiosk Mode** (bloquea salir de la pantalla completa).
     - ✅ **Keep Screen On** (la pantalla nunca se apaga mientras esté enchufada).
     - ✅ **Auto-Reload on Network Error** (recarga la web automáticamente si hay desconexión).

---

## 9. Gesto Físico de Emergencia (Sin Abrir la Caja)

Si por alguna razón la pantalla o el navegador sufren un bloqueo temporal debido a que un niño saturó los botones:
* **Toca la NARIZ 5 veces seguidas rápidamente** (en menos de 2 segundos).
* El sistema reproducirá un sonido de reinicio y **forzará la recarga completa de la interfaz** (`window.location.reload`), desbloqueando cualquier proceso colgado sin necesidad de desarmar la caja.

---

## 10. Auto-Encendido al Enchufar a la Pared (Auto-Boot on Charge)

Si el celular llega a apagarse por corte de energía y quieres que al volver la corriente se encienda solo sin presionar el botón físico de encendido:

1. Conecta el Huawei a una computadora por USB en modo Fastboot (`adb reboot bootloader` o manteniendo presionado *Volumen Abajo + Encendido* al conectar el cable).
2. En la computadora ejecuta:
   ```bash
   fastboot oem off-mode-charge 0
   ```
3. A partir de ese momento, en cuanto el cargador de pared reciba energía, el celular arrancará directamente a Android, ejecutará Termux:Boot, levantará PM2 y abrirá la pantalla de la Caja Mágica.

