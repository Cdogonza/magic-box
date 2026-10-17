# 🚀 Guía de Despliegue en VPS + Cloudflare (Modelo Multi-Cliente)

Esta guía describe la arquitectura de producción para **comercializar la Caja Mágica de Voces** para múltiples familias o clientes utilizando:
- **1 solo VPS** (Hetzner, Contabo, DigitalOcean, AWS, etc. de $4 a $6/mes).
- **1 solo Dominio** (gestionado gratuitamente en Cloudflare con SSL automático).
- **Docker** para aislamiento total entre clientes (cada familia tiene su sesión de WhatsApp, sus audios y su configuración independiente).
- **Cloudflare Tunnel (`cloudflared`)** para exponer de forma segura y cifrada los contenedores **sin abrir puertos en el router ni en el firewall del VPS**.

---

## 📐 1. Arquitectura del Sistema

```
                      INTERNET / CLIENTES
                               │
               ┌───────────────┴───────────────┐
               ▼                               ▼
     Tablet Familia García           Tablet Familia Pérez
 (https://garcia.midominio.com)  (https://perez.midominio.com)
               │                               │
               └───────────────┬───────────────┘
                               │ HTTPS / WSS Seguro (Cloudflare CDN & Edge SSL)
                               ▼
                    [ CLOUDFLARE TUNNEL ]
              (Túnel cifrado saliente - Cero puertos abiertos)
                               │
            ┌──────────────────┴──────────────────┐
            │  TU SERVIDOR VPS (Ubuntu 22.04/24.04)│
            │                                     │
            │  cloudflared (Daemon)               │
            │  ├── garcia.midominio.com ──► :3001 │
            │  ├── perez.midominio.com  ──► :3002 │
            │  └── lopez.midominio.com  ──► :3003 │
            │                                     │
            │  DOCKER ENGINE                      │
            │  ┌────────────────────────────────┐ │
            │  │ Contenedor: magic-box-garcia   │ │
            │  │ - Puerto interno: 3000 -> 3001 │ │
            │  │ - WhatsApp: Sesión García      │ │
            │  │ - FFmpeg nativo Debian         │ │
            │  └────────────────────────────────┘ │
            │  ┌────────────────────────────────┐ │
            │  │ Contenedor: magic-box-perez    │ │
            │  │ - Puerto interno: 3000 -> 3002 │ │
            │  │ - WhatsApp: Sesión Pérez       │ │
            │  │ - FFmpeg nativo Debian         │ │
            │  └────────────────────────────────┘ │
            └─────────────────────────────────────┘
```

### ¿Por qué este modelo es ideal para comercializar?
1. **Un solo dominio para todos tus clientes**: No compras un dominio por cliente. Creas subdominios ilimitados (`cliente1.tudominio.com`, `cliente2.tudominio.com`).
2. **Cero mantenimiento en la tablet**: En la casa del cliente solo se instala *Fully Kiosk Browser* apuntando a la URL HTTPS. Si la tablet se apaga o reinicia, al encender vuelve a abrir la web.
3. **Máxima estabilidad (Adiós problemas de Termux)**:
   - Los procesos no mueren por ahorro de batería de Android.
   - Utiliza **FFmpeg nativo de Debian/Ubuntu** compilado con todas las optimizaciones, eliminando cortes o cuelgues al convertir audios de WhatsApp.
4. **Soporte y actualización centralizada**: Si mejoras el código o actualizas la interfaz Pixar, actualizas la imagen Docker en tu VPS y todos tus clientes reciben la mejora al instante.
5. **Aislamiento y privacidad**: Cada cliente tiene su propia carpeta de datos (`clients/<nombre>/auth` y `data/`), garantizando que ninguna familia acceda a los audios o mensajes de otra.

---

## 🛠️ 2. Requisitos Previos

1. **Un servidor VPS**:
   - Recomendado: Ubuntu 22.04 LTS o 24.04 LTS.
   - Recursos mínimos: 2 vCPU, 2 GB a 4 GB RAM, 40 GB SSD (puede albergar cómodamente de 15 a 30 clientes simultáneos).
2. **Un Dominio propio**:
   - Ejemplo: `cajamagicadevoces.com` o cualquier dominio económico (`.com`, `.net`, `.online`, etc.).
   - Los DNS del dominio deben apuntar a **Cloudflare** (plan gratuito).
3. **Acceso SSH al VPS** como usuario `root` o con privilegios `sudo`.

---

## 📦 3. Preparación Inicial del VPS

Conéctate a tu VPS por SSH:
```bash
ssh root@IP_DE_TU_VPS
```

### 3.1. Actualizar el sistema e instalar Docker
Ejecuta los siguientes comandos para instalar Docker y Git:
```bash
# Actualizar repositorios
apt update && apt upgrade -y

# Instalar dependencias necesarias
apt install -y curl wget git ca-certificates gnupg lsb-release

# Instalar Docker oficial
curl -fsSL https://get.docker.com | sh

# Verificar instalación
docker --version
```

### 3.2. Descargar el proyecto
Clona el repositorio en la carpeta deseada (por ejemplo `/opt/magic-box`):
```bash
mkdir -p /opt
cd /opt
git clone https://github.com/Cdogonza/magic-box.git
cd magic-box

# Cambiar a la rama de producción para VPS
git checkout version_vps

# Asegurar permisos de ejecución para el script administrador
chmod +x manage-boxes.sh
```

---

## ☁️ 4. Configuración de Cloudflare Tunnel

Cloudflare Tunnel (`cloudflared`) permite que tu VPS reciba tráfico seguro HTTPS sin necesidad de abrir puertos (80, 443 o 3000) en el firewall ni configurar certificados SSL manuales.

### 4.1. Instalar `cloudflared` en el VPS
```bash
# Añadir repositorio de Cloudflare
mkdir -p --mode=0755 /etc/apt/keyrings
curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | tee /etc/apt/keyrings/cloudflare-main.gpg >/dev/null
echo "deb [signed-by=/etc/apt/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared $(lsb_release -cs) main" | tee /etc/apt/sources.list.d/cloudflared.list

# Instalar
apt update && apt install -y cloudflared
```

### 4.2. Autenticar Cloudflare
Ejecuta:
```bash
cloudflared tunnel login
```
Te mostrará una URL en la terminal. Cópiala y ábrela en tu navegador para autorizar tu dominio en Cloudflare. Una vez autorizado, generará un archivo `cert.pem` en `~/.cloudflared/`.

### 4.3. Crear el Túnel
Crea un túnel llamado `magic-boxes`:
```bash
cloudflared tunnel create magic-boxes
```
Guarda el **UUID del túnel** que aparecerá en pantalla (es una cadena alfanumérica larga como `a1b2c3d4-e5f6-7890-abcd-1234567890ab`).

### 4.4. Crear el registro DNS Wildcard en Cloudflare
Para que cualquier subdominio nuevo (`*.tudominio.com`) apunte automáticamente a tu túnel sin tener que crear registros DNS cada vez que sumas un cliente:
```bash
cloudflared tunnel route dns magic-boxes "*.tudominio.com"
```
*(Reemplaza `tudominio.com` por tu dominio real).*

### 4.5. Configurar el archivo de enrutamiento Ingress
Crea el archivo `/etc/cloudflared/config.yml`:
```bash
mkdir -p /etc/cloudflared
nano /etc/cloudflared/config.yml
```

Pega la siguiente estructura (reemplaza `TU_TUNNEL_UUID` y `tudominio.com`):
```yaml
tunnel: TU_TUNNEL_UUID
credentials-file: /root/.cloudflared/TU_TUNNEL_UUID.json

ingress:
  # Ejemplo de cliente: Familia García
  - hostname: garcia.tudominio.com
    service: http://localhost:3001

  # Ejemplo de cliente: Familia Pérez
  - hostname: perez.tudominio.com
    service: http://localhost:3002

  # Regla final obligatoria (catch-all para cualquier otra petición)
  - service: http_status:404
```

### 4.6. Iniciar `cloudflared` como servicio del sistema
```bash
# Instalar el servicio
cloudflared service install

# Iniciar y habilitar en el arranque del VPS
systemctl enable cloudflared
systemctl start cloudflared

# Verificar estado
systemctl status cloudflared
```

---

## 🎩 5. Gestión de Clientes con `manage-boxes.sh`

El script [manage-boxes.sh](file:///Users/gonzalopaz/Desktop/magic-Box/manage-boxes.sh) automatiza por completo el alta, control, respaldos y monitoreo de las cajas de tus clientes.

### 5.1. Construir la imagen base (una sola vez o al actualizar)
En la carpeta `/opt/magic-box`:
```bash
./manage-boxes.sh build
```
Esto creará la imagen Docker optimizada `magic-box:latest` con Debian Bookworm, Node.js 20 y FFmpeg nativo.

---

### 5.2. Dar de alta a un nuevo cliente en 30 segundos
Supongamos que vendiste el servicio a la **Familia García**:

1. **Ejecuta el comando `add`**:
   ```bash
   ./manage-boxes.sh add garcia 3001
   ```
   *El script creará automáticamente las carpetas aisladas en `clients/garcia/`, generará su `config.json` y levantará su contenedor Docker en el puerto 3001.*

2. **Añadir el subdominio al Ingress de Cloudflare**:
   Edita `/etc/cloudflared/config.yml` y añade las dos líneas antes de la regla `http_status:404`:
   ```yaml
     - hostname: garcia.tudominio.com
       service: http://localhost:3001
   ```
   Aplica los cambios reiniciando cloudflared:
   ```bash
   systemctl restart cloudflared
   ```

3. **Vincular el WhatsApp del cliente**:
   Para ver el código QR de WhatsApp en vivo:
   ```bash
   ./manage-boxes.sh logs garcia
   ```
   - Abre WhatsApp en el móvil que se vinculará a la caja (el de la familia).
   - Ve a **Dispositivos vinculados > Vincular un dispositivo**.
   - Escanea el código QR que se dibuja en tu terminal SSH.
   - Presiona `Ctrl + C` para salir de los logs una vez conectado.

¡Listo! La caja de la Familia García ya está 100% activa en `https://garcia.tudominio.com`.

---

### 5.3. Tabla de Comandos del Administrador

| Comando | Descripción | Ejemplo |
| :--- | :--- | :--- |
| `./manage-boxes.sh build` | Compila o actualiza la imagen Docker | `./manage-boxes.sh build` |
| `./manage-boxes.sh add <cliente> <puerto>` | Despliega una nueva caja aislada | `./manage-boxes.sh add perez 3002` |
| `./manage-boxes.sh list` | Muestra todas las cajas activas, estados y puertos | `./manage-boxes.sh list` |
| `./manage-boxes.sh logs <cliente>` | Muestra logs en vivo y QR de WhatsApp | `./manage-boxes.sh logs perez` |
| `./manage-boxes.sh restart <cliente>` | Reinicia la caja de un cliente | `./manage-boxes.sh restart garcia` |
| `./manage-boxes.sh stop <cliente>` | Pausa la caja (por ej. falta de pago) | `./manage-boxes.sh stop garcia` |
| `./manage-boxes.sh start <cliente>` | Reanuda una caja pausada | `./manage-boxes.sh start garcia` |
| `./manage-boxes.sh backup <cliente>` | Genera un archivo `.tar.gz` con la sesión y audios | `./manage-boxes.sh backup garcia` |
| `./manage-boxes.sh remove <cliente>` | Elimina el contenedor Docker del cliente | `./manage-boxes.sh remove demo` |

---

## 📱 6. Configuración de la Tablet en el Hogar del Cliente

En la casa del cliente ya **no necesitas Termux, ni Git, ni compilar nada**.

### Paso a Paso en la Tablet:
1. Conecta la tablet al Wi-Fi de la casa.
2. Instala **Fully Kiosk Browser** desde Google Play Store o su APK oficial.
3. Abre Fully Kiosk Browser y pulsa en **Settings** (deslizando desde la izquierda):
   - **Start URL**: Introduce la dirección del cliente (ej. `https://garcia.tudominio.com`).
   - **Web Zoom and Scaling**: Ajusta para que la cara ocupe toda la pantalla en formato apaisado (Landscape).
   - **Screen Off/On**: Configura para mantener la pantalla siempre encendida o que despierte al tocarla.
   - **Kiosk Mode**: Actívalo para bloquear el acceso a otras aplicaciones si deseas que el niño solo use la Caja Mágica.
   - **Permissions**: Concede permisos de **Micrófono** y **Reproducción automática de Audio/Video** cuando el navegador lo solicite.

> [!TIP]
> **Autogestión de Canales y Grupos**:
> Si necesitas cambiar nombres o fotos de los grupos de la familia García, puedes hacerlo editando `/opt/magic-box/clients/garcia/config.json` en tu VPS y luego ejecutando `./manage-boxes.sh restart garcia`. La tablet se actualizará en tiempo real sin que tengas que desplazarte físicamente.

---

## 🔒 7. Copias de Seguridad y Mantenimiento

### Respaldos automáticos
Para hacer una copia de seguridad de un cliente:
```bash
./manage-boxes.sh backup garcia
```
Esto genera un archivo con fecha y hora: `backup_garcia_YYYYMMDD_HHMMSS.tar.gz` que incluye:
- Sus credenciales y llaves criptográficas de WhatsApp (`auth/`).
- Todos sus mensajes de voz recibidos y enviados (`data/`).
- Sus fotos y canales personalizados (`config.json`).

### Automatización con Cron (Opcional)
Para respaldar todos los clientes diariamente a las 3:00 AM, puedes añadir una línea a `crontab -e`:
```bash
0 3 * * * tar -czf /root/backups_magic_boxes_$(date +\%F).tar.gz /opt/magic-box/clients/
```

---

## 💡 Preguntas Frecuentes de Comercialización

### ¿Cuántos clientes soporta un solo VPS?
Un contenedor en reposo consume entre **40 MB y 70 MB de memoria RAM**. Durante la conversión de audio con FFmpeg tiene picos breves de 120 MB.
- Un VPS de **4 GB de RAM** puede alojar tranquilamente entre **30 y 45 familias activas simultáneas**.
- Si tu base de clientes crece a 100 familias, simplemente amplías el VPS a 8 GB o 16 GB de RAM con un clic en tu proveedor de hosting.

### ¿Qué pasa si un cliente no paga su suscripción mensual?
Puedes suspender su servicio inmediatamente sin borrar sus datos ejecutando:
```bash
./manage-boxes.sh stop nombre_cliente
```
Cuando regularice su pago:
```bash
./manage-boxes.sh start nombre_cliente
```

### ¿Qué pasa si se reinicia el VPS por mantenimiento?
Todos los contenedores tienen la directiva `--restart unless-stopped` y `cloudflared` está configurado con `systemd`. El servidor arrancará automáticamente todas las cajas y túneles en menos de 20 segundos sin intervención manual.
