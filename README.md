# 📦✨ Caja Mágica de Voces

> **Walkie-Talkie Familiar para Niños (5 y 7 años)**  
> Conecta a los chicos al grupo de WhatsApp familiar mediante audios, **sin necesidad de pantallas**, usando un celular Huawei / Android viejo con **Termux** y dos botones físicos gigantes.

---

## 🎯 ¿Cómo Funciona la Caja?

1. **Botón Verde (ESCUCHAR) 👂**:
   - Al tocarlo, reproduce el último audio de la familia.
   - Si no hay mensajes nuevos, dice que el buzón está vacío con un sonido suave.
2. **Botón Rojo (HABLAR) 🎙️**:
   - Los chicos lo mantienen presionado (o tocan una vez para empezar): suena un *«Bip»* y hablan.
   - Al soltarlo: suena un sonido de cohete/envío (*«Fiuuu-Pop»*) y el audio se manda automáticamente al grupo de WhatsApp como una **nota de voz nativa** (con el micrófono verde).
3. **Campana Mágica 🔔**:
   - Cuando un familiar manda un audio al grupo, la caja hace sonar una campanita (*«Ding-dong»*) avisándole a los chicos que tienen un mensaje nuevo.

---

## 🛠️ Estructura del Proyecto

```
magic-Box/
├── server.js                  # Servidor central (Express, WebSockets y terminal)
├── config.json                # Configuración del grupo familiar y modos
├── generate_sounds.js         # Generador de sonidos WAV (campana, bip, cohete)
├── lib/
│   ├── whatsapp.js            # Conexión WhatsApp Web (Baileys, sin navegador)
│   └── audio.js               # Gestor de reproducción, grabación y micrófono
├── public/                    # Panel web companion y pantalla para la caja
│   ├── index.html
│   ├── app.js
│   └── style.css
├── sounds/                    # Efectos de sonido generados
├── GUIA_INSTALACION_HUAWEI.md # Guía paso a paso para configurar tu celular Huawei
└── README.md
```

---

## 🚀 Inicio Rápido en PC / Mac (Para probarlo ya mismo)

Para probarlo y ver cómo funciona antes de pasarlo al celular:

1. **Instalar dependencias**:
   ```bash
   npm install
   ```

2. **Generar los efectos de sonido**:
   ```bash
   node generate_sounds.js
   ```

3. **Iniciar el servidor**:
   ```bash
   node server.js
   ```

4. **Vincular WhatsApp**:
   - Verás un código QR en la consola (y también en `http://localhost:3000`).
   - Abre WhatsApp en tu celular > **Dispositivos vinculados** > **Vincular un dispositivo** y escanea el código.

5. **Probar los botones con el teclado**:
   - Presiona **`E`** en la terminal o navegador para simular el botón **ESCUCHAR**.
   - Presiona **`G`** (o Espacio) para simular el botón **HABLAR**.

---

## 📱 Instalación en el Celular Huawei con Termux

Para dejar la solución definitiva corriendo adentro de la caja con el celular Huawei, consulta la guía dedicada:

👉 **[GUIA_INSTALACION_HUAWEI.md](file:///Users/gonzalopaz/Desktop/magic-Box/GUIA_INSTALACION_HUAWEI.md)**

---

## 🔌 Cómo Conectar los 2 Botones Físicos al Celular

Tienes 3 alternativas de costo mínimo:

1. **Mouse USB viejo + Adaptador OTG (Costo: $0 a $1)**:
   - Desarmas un mouse viejo y sueldas cables desde los microswitches izquierdo y derecho a los botones gigantes de la caja.
   - Enchufas el mouse al celular con el cable OTG.
   - Click Izquierdo = Hablar, Click Derecho = Escuchar.
2. **Control Remoto Selfie Bluetooth (Costo: ~$1 a $2)**:
   - Un control selfie barato tiene 2 botones físicos y se enlaza por Bluetooth al Huawei.
   - Se pueden soldar cables a los pulsadores de la plaquita hacia los botones grandes.
3. **Pantalla en Modo Kiosko adentro de la caja**:
   - Dejas el celular adentro de la caja con la pantalla asomando o con una ventana transparente donde los chicos tocan los 2 botones gigantes en la pantalla táctil.
