# 📱 Guía Maestra de Instalación y Puesta en Funcionamiento según el Teléfono
### Manual de Configuración Autónoma para la Caja Mágica en Celulares Android
*(Samsung, Xiaomi / Redmi, Huawei / Honor, Motorola y otros)*

Esta guía explica paso a paso cómo convertir cualquier celular **Android usado (Android 7.0 a 14)** en el cerebro autónomo de la **Caja Mágica**, configurado para operar 24/7 dentro de una caja sellada con botones físicos.

---

## 🧭 ¿Qué teléfono vas a instalar? (Elige tu marca)

- 🟦 **[1. Ruta SAMSUNG GALAXY (One UI)](#-ruta-1-samsung-galaxy-one-ui)**
- 🟧 **[2. Ruta XIAOMI / REDMI / POCO (MIUI / HyperOS)](#-ruta-2-xiaomi--redmi--poco-miui--hyperos)**
- 🔴 **[3. Ruta HUAWEI / HONOR (EMUI / HarmonyOS)](#-ruta-3-huawei--honor-emui--harmonyos)**
- 🟢 **[4. Ruta MOTOROLA / PIXEL / ANDROID PURO](#-ruta-4-motorola--pixel--nokia-android-stock)**
- ⚙️ **[5. Vinculación de WhatsApp y Configuración de Grupos (Común)](#-fase-común-vinculación-de-whatsapp-y-configuración-de-canales)**
- 📺 **[6. Configuración de Pantalla Kiosk (Horizontal)](#-pantalla-siempre-encendida-modo-kiosk-horizontal)**
- 📦 **[7. Checklist Final de 60 Segundos antes de Sellar la Caja](#-checklist-de-producción-antes-de-sellar-la-caja)**
- 💡 **[8. Mejoras y Extensiones: Botones Físicos con Mouse USB Hack](#-mejoras-y-extensiones-botones-físicos-con-mouse-usb-hack)**

---

## 🟦 RUTA 1: SAMSUNG GALAXY (One UI)
*Modelos compatibles: Galaxy J4/J5/J7, Galaxy A10/A20/A30/A50, Galaxy S7/S8/S9/S10/S20, Galaxy A12/A13/A14, etc.*

### Paso 1: Preparar el teléfono
1. Conecta el celular a la red **Wi-Fi** de la casa.
2. Ve a **Ajustes** > **Pantalla de bloqueo** > **Tipo de bloqueo de pantalla** y selecciona **"Deslizar"** o **"Ninguno"** (elimina cualquier PIN, patrón o huella para que, si el teléfono se reinicia, arranque directo al escritorio sin esperar una contraseña).
3. Sube el **Volumen Multimedia al 100%**.
4. Ve a **Ajustes** > **Sonidos y vibración** > activa **"No molestar"** (para evitar que llamadas o SMS de spam interrumpan a los chicos).

### Paso 2: Descargar e Instalar las Aplicaciones
> ⚠️ **NO uses Google Play Store para Termux** (esa versión fue descontinuada y no permite instalar Node ni Git).
1. Abre **Chrome** o **Samsung Internet** en el teléfono e ingresa a estos enlaces para descargar los APKs oficiales de F-Droid:
   - **Termux:** [f-droid.org/packages/com.termux/](https://f-droid.org/packages/com.termux/) (toca *"Download APK"*).
   - **Termux:Boot:** [f-droid.org/packages/com.termux.boot/](https://f-droid.org/packages/com.termux.boot/)
   - **Termux:API:** [f-droid.org/packages/com.termux.api/](https://f-droid.org/packages/com.termux.api/)
2. Descarga el navegador Kiosk para pantalla completa:
   - **Fully Kiosk Browser:** [fully-kiosk.com](https://www.fully-kiosk.com/) (descarga el APK para Android).
3. Instala los 4 archivos APK aceptando el permiso de *"Instalar aplicaciones desconocidas"*.
4. Abre la app **Termux:Boot** una vez y ciérrala (esto registra el servicio en el sistema).

### Paso 3: Blindar Termux contra el ahorro de batería de Samsung
Samsung tiene un sistema agresivo que duerme aplicaciones tras unas horas sin tocarlas:
1. Ve a **Ajustes** > **Cuidado del dispositivo** (o *Batería y cuidado del dispositivo*).
2. Toca en **Batería** > **Límites de uso en segundo plano**.
3. **Desactiva** la casilla: ❌ *"Suspender aplicaciones sin usar"*.
4. Entra a **"Aplicaciones que nunca se suspenden"** > pulsa el botón **`+`** en la esquina superior y agrega **Termux**.
5. Ve a **Ajustes** > **Aplicaciones** > busca **Termux** > **Batería** > selecciona **"No restringido"** (Unrestricted).

### Paso 4: Instalar la Caja Mágica en Termux
1. Abre la aplicación **Termux** y escribe:
   ```bash
   termux-wake-lock
   ```
   *(Verás una notificación fija en la barra superior indicando que el procesador no dormirá).*
2. Actualiza e instala las herramientas base (copia y pega todo de una vez):
   ```bash
   pkg update -y && pkg upgrade -y && pkg install -y nodejs-lts ffmpeg mpv termux-api git
   ```
   *(Si el instalador se detiene preguntando por configuraciones, presiona **Enter** para dejar el valor por defecto).*
3. Concede permisos de almacenamiento:
   ```bash
   termux-setup-storage
   ```
   *(Toca "Permitir" en el cartel emergente).*
4. Descarga el código y arranca la producción autónoma:
   ```bash
   git clone https://github.com/Cdogonza/magic-box.git magic-Box
   cd magic-Box
   npm install
   node generate_sounds.js
   bash setup-autostart.sh
   ```
   *El script `setup-autostart.sh` dejará el servidor configurado con **PM2** y con inicio automático ante reinicios.*

### Paso 5: Particularidad de Alimentación en Samsung
* Los teléfonos Samsung utilizan el protocolo cerrado *Odin / Download Mode* (no disponen de Fastboot estándar para auto-encendido por comando).
* **Recomendación para Samsung:** Dejar la caja conectada de forma permanente con un **cargador de 5V @ 2A continuo**. La batería del teléfono amortigua cortes de luz breves (hasta 12-24 horas), y al no apagarse nunca, el sistema corre ininterrumpido.

---

## 🟧 RUTA 2: XIAOMI / REDMI / POCO (MIUI / HyperOS)
*Modelos compatibles: Redmi Note 5/6/7/8/9/10/11, Redmi 7A/8A/9A/10C, POCO M3/X3, Xiaomi Mi 8/9/10/A2, etc.*

### Paso 1: Preparar el teléfono
1. Conecta el celular a **Wi-Fi**.
2. Ve a **Ajustes** > **Contraseñas y seguridad** > **Bloqueo de pantalla** y selecciona **"Desactivar bloqueo de pantalla"**.
3. Sube el **Volumen Multimedia al 100%**.
4. Activa el modo **"No molestar"** en la barra de control superior.

### Paso 2: Descargar e Instalar las Aplicaciones
1. Abre el navegador en el teléfono e instala los APKs oficiales de F-Droid:
   - **Termux:** [f-droid.org/packages/com.termux/](https://f-droid.org/packages/com.termux/)
   - **Termux:Boot:** [f-droid.org/packages/com.termux.boot/](https://f-droid.org/packages/com.termux.boot/)
   - **Termux:API:** [f-droid.org/packages/com.termux.api/](https://f-droid.org/packages/com.termux.api/)
   - **Fully Kiosk Browser:** [fully-kiosk.com](https://www.fully-kiosk.com/)
2. Abre la app **Termux:Boot** una sola vez.

### Paso 3: Configuración Vital de MIUI / HyperOS
MIUI es el sistema más agresivo cerrando procesos en segundo plano. **Sigue estrictamente estos 3 ajustes:**
1. **Inicio Automático (Autostart):**
   - Ve a **Ajustes** > **Aplicaciones** > **Permisos** > **Inicio automático**.
   - Activa el interruptor en **Termux** y en **Termux:Boot**.
2. **Ahorro de Batería sin restricciones:**
   - Ve a **Ajustes** > **Aplicaciones** > **Administrar aplicaciones** > busca **Termux**.
   - Entra a **Ahorro de batería** y selecciona **"Sin restricciones"**.
   - *(Haz lo mismo para la app Termux:Boot).*
3. **Poner el Candado en Memoria RAM 🔒:**
   - Abre Termux.
   - Ve a la vista de aplicaciones recientes (deslizando desde abajo o tocando el botón cuadrado de navegación).
   - Mantén presionado el recuadro de Termux durante 2 segundos.
   - Toca el ícono del **Candado 🔒** para que quede bloqueado (esto impide que el limpiador de memoria de MIUI cierre el servidor).

### Paso 4: Instalar la Caja Mágica en Termux
1. En **Termux**:
   ```bash
   termux-wake-lock
   ```
2. Instalar dependencias del sistema:
   ```bash
   pkg update -y && pkg upgrade -y && pkg install -y nodejs-lts ffmpeg mpv termux-api git
   ```
3. Permisos de disco:
   ```bash
   termux-setup-storage
   ```
4. Descarga y arranque:
   ```bash
   git clone https://github.com/Cdogonza/magic-box.git magic-Box
   cd magic-Box
   npm install
   node generate_sounds.js
   bash setup-autostart.sh
   ```

### Paso 5: Auto-Encendido en Xiaomi al Enchufar a la Pared
Casi todos los Xiaomi/Redmi (con procesador Snapdragon o MediaTek) admiten auto-arranque:
1. Apaga el teléfono.
2. Mantén presionados **Volumen Abajo + Botón Encendido** hasta que aparezca la pantalla naranja de **FASTBOOT**.
3. Conéctalo por cable USB a una computadora y desde la terminal de la PC corre:
   ```bash
   fastboot oem off-mode-charge 0
   fastboot reboot
   ```
*(A partir de ahora, si el teléfono se apaga por falta de batería, en cuanto reciba corriente del cargador arrancará solo).*

---

## 🔴 RUTA 3: HUAWEI / HONOR (EMUI / HarmonyOS)
*Modelos compatibles: Huawei P8/P9/P10/P20 Lite, Y6/Y7/Y9, Mate 9/10/20 Lite, Honor 8X/9X, etc.*

### Paso 1: Preparar el teléfono
1. Conéctalo a la red **Wi-Fi**.
2. Ve a **Ajustes** > **Seguridad y privacidad** > **Bloqueo de pantalla y claves** > **Desactivar clave de pantalla**.
3. Sube el **Volumen Multimedia al 100%**.
4. Activa el modo **"No molestar"**.

### Paso 2: Descargar e Instalar las Aplicaciones
1. Descarga desde el navegador los APKs:
   - **Termux:** [f-droid.org/packages/com.termux/](https://f-droid.org/packages/com.termux/)
   - **Termux:Boot:** [f-droid.org/packages/com.termux.boot/](https://f-droid.org/packages/com.termux.boot/)
   - **Termux:API:** [f-droid.org/packages/com.termux.api/](https://f-droid.org/packages/com.termux.api/)
   - **Fully Kiosk Browser:** [fully-kiosk.com](https://www.fully-kiosk.com/)
2. Abre la app **Termux:Boot** una vez.

### Paso 3: Configuración de Batería en EMUI (PowerGenie)
1. Ve a **Ajustes** > **Batería** > **Inicio de aplicaciones** (o *App Launch*).
2. Busca **Termux** en la lista.
3. Desactiva el interruptor *"Gestionar automáticamente"* para pasar a **"Gestionar manualmente"**.
4. Marca activas las **3 casillas**:
   - ✅ **Inicio automático**
   - ✅ **Inicio secundario**
   - ✅ **Ejecutar en segundo plano**
5. *(Opcional en EMUI 9/10):* Ve a **Ajustes** > **Aplicaciones** > **Acceso especial** > **Optimización de batería** > selecciona "Todas las aplicaciones", busca **Termux** y elige **"No permitir"**.

### Paso 4: Instalar la Caja Mágica en Termux
1. En **Termux**:
   ```bash
   termux-wake-lock
   pkg update -y && pkg upgrade -y && pkg install -y nodejs-lts ffmpeg mpv termux-api git
   termux-setup-storage
   ```
2. Clonar y configurar producción:
   ```bash
   git clone https://github.com/Cdogonza/magic-Box.git magic-Box
   cd magic-Box
   npm install
   node generate_sounds.js
   bash setup-autostart.sh
   ```

### Paso 5: Auto-Encendido en Huawei al Enchufar
En los Huawei con procesador Kirin o Qualcomm:
1. Conecta el celular apagado a la PC manteniendo presionado **Volumen Abajo** para entrar en modo Fastboot (pantalla blanca de rescate).
2. En la terminal de la computadora ejecuta:
   ```bash
   fastboot oem off-mode-charge 0
   fastboot reboot
   ```

---

## 🟢 RUTA 4: MOTOROLA / PIXEL / NOKIA (Android Stock)
*Modelos compatibles: Moto G4/G5/G6/G7/G8/G9/G20/G30/G50, Moto E series, Nokia 3/5/6, Google Pixel, etc.*

### Paso 1: Preparar el teléfono
1. Conéctalo a la red **Wi-Fi**.
2. Ve a **Ajustes** > **Seguridad** > **Bloqueo de pantalla** > **Ninguno**.
3. Sube el **Volumen Multimedia al 100%**.

### Paso 2: Descargar e Instalar las Aplicaciones
1. Descarga desde F-Droid los 3 APKs:
   - **Termux:** [f-droid.org/packages/com.termux/](https://f-droid.org/packages/com.termux/)
   - **Termux:Boot:** [f-droid.org/packages/com.termux.boot/](https://f-droid.org/packages/com.termux.boot/)
   - **Termux:API:** [f-droid.org/packages/com.termux.api/](https://f-droid.org/packages/com.termux.api/)
   - **Fully Kiosk Browser:** [fully-kiosk.com](https://www.fully-kiosk.com/)
2. Abre la app **Termux:Boot** una vez.

### Paso 3: Configuración de Batería en Android Stock
1. Ve a **Ajustes** > **Aplicaciones** > busca **Termux**.
2. Entra a **Batería** (o *Uso de batería de la app*).
3. Selecciona la opción **"Sin restricciones"** (o desactiva la opción *"Optimización de batería"*).

### Paso 4: Instalar la Caja Mágica en Termux
1. Abre **Termux**:
   ```bash
   termux-wake-lock
   pkg update -y && pkg upgrade -y && pkg install -y nodejs-lts ffmpeg mpv termux-api git
   termux-setup-storage
   ```
2. Clonar y poner en marcha:
   ```bash
   git clone https://github.com/Cdogonza/magic-box.git magic-Box
   cd magic-Box
   npm install
   node generate_sounds.js
   bash setup-autostart.sh
   ```

### Paso 5: Auto-Encendido en Motorola
Los Motorola son los dispositivos con mayor compatibilidad con Fastboot:
1. Con el teléfono apagado, mantén presionado **Volumen Abajo + Encendido** hasta ver el robot de Android de Fastboot.
2. Conecta el cable a la PC y ejecuta:
   ```bash
   fastboot oem off-mode-charge 0
   fastboot reboot
   ```

---

## ⚙️ FASE COMÚN: Vinculación de WhatsApp y Configuración de Canales

Una vez que Termux y PM2 están corriendo en cualquier teléfono:

### 1. Vincular el WhatsApp de la Caja
1. Abre el navegador del celular (Chrome o Fully Kiosk) e ingresa a:
   ```
   http://localhost:3000
   ```
   *(También puedes ingresar desde tu PC o laptop conectada al mismo Wi-Fi poniendo `http://IP_DEL_CELULAR:3000`)*.
2. En la pantalla aparecerá el **Código QR de WhatsApp**.
3. Desde el teléfono que tendrá la línea de la Caja (chip secundario o prepago):
   - Abre WhatsApp > toca el menú de 3 puntos (o Ajustes) > **Dispositivos vinculados**.
   - Toca **Vincular un dispositivo** y escanea el código QR que se ve en la pantalla.
4. ¡Listo! La sesión queda guardada localmente de por vida en la carpeta `auth_info_baileys/`.

### 2. Configurar los 3 Canales Familiares y Fotos
1. En la pantalla web (`http://localhost:3000`), toca el ícono discreto de **engranaje ⚙️** en la esquina superior derecha.
2. Verás los 3 canales disponibles:
   - **Canal 1 (ej. Papá y Mamá):** Escribe el nombre, selecciona su grupo de WhatsApp en la lista desplegable y pulsa **📷 Cambiar** para subir una foto desde la galería.
   - **Canal 2 (ej. Abuelos):** Selecciona el grupo de los abuelos y sube su foto.
   - **Canal 3 (ej. Tíos / Primos):** Selecciona el grupo y sube su foto.
3. Pulsa **Guardar Cambios**.
4. Cierra el panel de configuración: verás la cara mágica con los 3 retratos perfectamente enmarcados dentro de la boca roja.

---

## 📺 PANTALLA SIEMPRE ENCENDIDA: Modo Kiosk Horizontal

Dado que el celular estará colocado dentro de una caja sellada con agujeros para los botones físicos:

1. **Abrir la app Fully Kiosk Browser en el celular**.
2. Toca en el menú lateral izquierdo > **Settings**:
   - **Start URL:** Escribe `http://localhost:3000`
   - **Display** > **Screen Orientation:** Elige **Landscape** (Horizontal fijo).
   - **Device Management** > **Keep Screen On:** Actívalo ✅ (para que la pantalla nunca se apague mientras esté enchufada).
   - **Kiosk Mode** > **Enable Kiosk Mode:** Actívalo ✅ (oculta barras de navegación, reloj y notificaciones).
   - **Other Settings** > **Run as Home App / Autostart on Boot:** Actívalo ✅ (para que al encenderse el celular, Fully Kiosk se abra automáticamente).

---

## 🆘 GESTO DE RESCATE FÍSICO (Sin abrir la caja)

Si en algún momento un niño presiona botones frenéticamente y la interfaz visual llegara a congelarse:

> 👃 **Toca la NARIZ 5 veces seguidas rápidamente (en menos de 2 segundos).**

El sistema emitirá un sonido de reinicio y **forzará la recarga limpia de toda la pantalla** (`window.location.reload`), vaciando la memoria y restableciendo el sistema sin necesidad de desarmar ni abrir la caja de madera.

---

## 📦 CHECKLIST DE PRODUCCIÓN ANTES DE SELLAR LA CAJA

Antes de cerrar la tapa y atornillar:

- [ ] **Volumen multimedia al 100%** comprobado con un audio real.
- [ ] **Modo "No molestar" activo** para evitar timbres de llamadas spam.
- [ ] **Bloqueo de pantalla desactivado** (al tocar el botón de encendido entra directo).
- [ ] **Prueba de audios bidireccional:**
  - Mandar un audio desde WhatsApp familiar: ¿Suena la campana 🔔 y se enciende la campanita dorada?
  - Tocar el botón verde 👂: ¿Se reproduce el audio nítidamente?
  - Mantener presionado el botón rojo 🎙️: ¿Suena el bip, graba y manda el audio al grupo?
  - Tocar la nariz 👃: ¿Cambia de canal familiar y conmuta la foto activa?
- [ ] **Prueba de reinicio:** Reinicia el celular desde el menú de apagado. Espera 45 segundos: el teléfono debe arrancar, iniciar Termux en segundo plano, abrir Fully Kiosk y quedar en la cara mágica lista para usar.
- [ ] **Cargador firme:** Asegurar el cable USB con una gota de silicona o precinto para que no se desenchufe con los movimientos de la caja.

---

## 🛠️ Comandos de Mantenimiento en Termux

Si en el futuro te conectas al celular (por pantalla o por SSH):

| Comando | Acción |
| :--- | :--- |
| `pm2 status` | Ver si el servidor Node.js está corriendo y cuánta memoria usa |
| `pm2 logs magic-box` | Ver en vivo los mensajes y audios que entran y salen |
| `pm2 restart magic-box` | Reiniciar el servidor de WhatsApp |
| `pm2 stop magic-box` | Detener el servidor |

---

## 💡 MEJORAS Y EXTENSIONES: Botones Físicos con Mouse USB Hack

Para llevar la Caja Mágica a un nivel aún más resistente o prescindir por completo del tacto directo sobre la pantalla, se pueden conectar **botones físicos de arcade o industriales** usando la placa de un mouse USB reciclado (**"Mouse Hack"**).

### 1. ¿Cómo funciona el circuito físico?
* **Placa del mouse:** Se desarma un mouse USB común y se localizan los microswitches internos:
  - **Click Izquierdo:** Se sueldan 2 cables hacia el botón físico de **HABLAR** (Rojo).
  - **Click Derecho:** Se sueldan 2 cables hacia el botón físico de **ESCUCHAR** (Verde).
  - *(Opcional)* **Click Central (Scroll):** Se sueldan 2 cables al pulsador de la rueda para la **NARIZ / CAMBIAR GRUPO**.
* **Alimentación continua 24/7 (Cable OTG en "Y"):**  
  Se conecta el mouse al celular usando un **cable USB OTG en "Y" con entrada de energía**. Esto alimenta al celular y al mouse simultáneamente, impidiendo que la batería se descargue.
* **Inmovilizar el cursor:**  
  Pega un trozo de cinta aisladora negra directamente sobre el sensor óptico inferior de la placa del mouse. Esto congela la flechita para que no se mueva con vibraciones o golpes en la caja.

---

### 2. Comportamiento en Android y Diagnóstico Técnico

Al conectar un mouse USB estándar a un celular Android, se observa lo siguiente:
1. **La flecha se mueve y el click izquierdo solo presiona donde apunta:**
   - En Android, el click izquierdo emula un toque táctil en las coordenadas `(X, Y)` de la pantalla.
   - En la versión táctil actual, los eventos están asignados a los elementos gráficos específicos (`btnRecord`, `btnListen`), por lo que si la flecha no está sobre el botón, no se activa.
2. **El click derecho no ejecuta la acción de escuchar:**
   - **Causa 1 (Android):** Por defecto, Android tiene mapeado el botón derecho del mouse como la tecla del sistema **"ATRÁS" (Back)**.
   - **Causa 2 (Navegadores móviles):** El evento `contextmenu` en navegadores móviles (Chrome / WebView) se diseñó para la pulsación larga del dedo (long press), no para clicks secos de un periférico de hardware.

---

### 3. Pasos para Implementar la Mejora (Hoja de Ruta Futura)

Cuando se decida habilitar el control por mouse físico, se deben aplicar estos dos ajustes sencillos:

#### A. Ajuste en Android / Fully Kiosk:
* En **Ajustes de Android** > **Administración general** > **Ratón y panel táctil** > cambiar **Botón secundario** a *"Menú contextual"* o *"Sin acción"* (para que no cierre la app como "Atrás").
* En **Fully Kiosk Browser**: En *Settings* > *Webview*, habilitar la opción de permitir click derecho.

#### B. Ajuste mínimo en el código web (`public/app.js`):
Hacer que los eventos de hardware se escuchen de manera global en toda la ventana (`window`), independientemente de dónde haya quedado el cursor:
```javascript
// Captura de eventos físicos de hardware (Mouse Hack)
window.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'mouse') {
    if (e.button === 0) {
      // Click Izquierdo: Hablar
      handleRecordTrigger();
    } else if (e.button === 2) {
      // Click Derecho: Escuchar
      e.preventDefault();
      handleListenAction();
    } else if (e.button === 1) {
      // Click Central (Rueda): Cambiar Canal / Nariz
      e.preventDefault();
      switchChannel();
    }
  }
});

window.addEventListener('pointerup', (e) => {
  if (e.pointerType === 'mouse' && e.button === 0) {
    if (state.buttonMode === 'hold') stopRecording();
  }
});
```

> 🌟 **Ventaja clave:** Esta mejora es 100% retrocompatible: permite usar simultáneamente los botones físicos arcade y la pantalla táctil con los dedos sin ninguna interferencia entre ambos.

