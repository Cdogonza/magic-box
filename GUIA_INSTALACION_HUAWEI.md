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

Abre **Termux** y escribe estos comandos uno por uno (presiona Enter):

```bash
pkg update -y
pkg install -y nodejs-lts ffmpeg termux-api git
```

Concede los permisos de almacenamiento y micrófono a Termux:
```bash
termux-setup-storage
```
*(Acepta la ventana emergente en la pantalla del celular).*

---

## 4. Copiar y Ejecutar el Proyecto en el Celular

### Opción A: Descargar directamente desde tu computadora
Puedes comprimir la carpeta `magic-Box` en un archivo `.zip`, pasarla al celular por cable o Bluetooth, y descomprimirla. O clonar tu repositorio si lo subes a GitHub:

```bash
git clone <URL_DE_TU_REPOSITORIO> magic-Box
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

## 7. Automatizar el Inicio (Opcional)

Si quieres que cada vez que el celular Huawei se encienda o reinicie la Caja Mágica empiece a funcionar sola:
1. Instala **Termux:Boot** desde F-Droid.
2. En Termux:
   ```bash
   mkdir -p ~/.termux/boot
   echo "cd ~/magic-Box && node server.js" > ~/.termux/boot/start-magicbox.sh
   chmod +x ~/.termux/boot/start-magicbox.sh
   ```
Ahora la caja es 100% autónoma: la enchufas a la pared y arranca sola.
