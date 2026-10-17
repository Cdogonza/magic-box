#!/usr/bin/env bash
# ========================================================
# Administrador Multi-Cliente para Caja Mágica de Voces 🎙️✨
# Despliegue en VPS + Docker + Cloudflare Tunnel
# ========================================================

set -e

BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLIENTS_DIR="$BASE_DIR/clients"
IMAGE_NAME="magic-box:latest"

mkdir -p "$CLIENTS_DIR"

function show_help() {
  echo "=========================================================="
  echo "🎙️  GESTOR DE INSTANCIAS CAJA MÁGICA (MULTI-CLIENTE)"
  echo "=========================================================="
  echo "Uso: ./manage-boxes.sh [comando] [argumentos]"
  echo ""
  echo "Comandos disponibles:"
  echo "  build                      Construir o actualizar la imagen Docker base"
  echo "  add <cliente> <puerto>     Crear e iniciar una nueva caja para un cliente"
  echo "                             Ej: ./manage-boxes.sh add garcia 3001"
  echo "  list                       Listar todas las cajas activas y sus puertos"
  echo "  logs <cliente>             Ver logs en vivo (para ver el código QR de WhatsApp)"
  echo "  restart <cliente>          Reiniciar la caja de un cliente"
  echo "  stop <cliente>             Detener temporalmente una caja"
  echo "  start <cliente>            Iniciar una caja detenida"
  echo "  backup <cliente>           Generar copia de seguridad (sesión WhatsApp + audios)"
  echo "  remove <cliente>           Eliminar contenedor de un cliente"
  echo "=========================================================="
}

function build_image() {
  echo "🔨 Construyendo imagen Docker: $IMAGE_NAME..."
  docker build -t "$IMAGE_NAME" "$BASE_DIR"
  echo "✅ Imagen construida con éxito."
}

function add_client() {
  CLIENT="$1"
  PORT="$2"

  if [ -z "$CLIENT" ] || [ -z "$PORT" ]; then
    echo "❌ Error: Faltan argumentos."
    echo "Uso: ./manage-boxes.sh add <nombre_cliente> <puerto>"
    echo "Ejemplo: ./manage-boxes.sh add familia-perez 3002"
    exit 1
  fi

  # Sanitizar nombre (solo letras, números y guiones)
  CLIENT_SAFE=$(echo "$CLIENT" | tr '[:upper:]' '[:lower:]' | tr -cd 'a-z0-9_-')
  CONTAINER_NAME="magic-box-$CLIENT_SAFE"
  CLIENT_PATH="$CLIENTS_DIR/$CLIENT_SAFE"

  # Verificar si el contenedor ya existe
  if docker ps -a --format '{{.Names}}' | grep -Eq "^${CONTAINER_NAME}\$"; then
    echo "⚠️ La caja '$CONTAINER_NAME' ya existe en Docker."
    exit 1
  fi

  echo "📁 Creando estructura de datos para: $CLIENT_SAFE..."
  mkdir -p "$CLIENT_PATH/auth"
  mkdir -p "$CLIENT_PATH/data/received"
  mkdir -p "$CLIENT_PATH/data/recordings"
  mkdir -p "$CLIENT_PATH/data/avatars"

  # Copiar config base si no existe
  if [ ! -f "$CLIENT_PATH/config.json" ]; then
    if [ -f "$BASE_DIR/config.json" ]; then
      cp "$BASE_DIR/config.json" "$CLIENT_PATH/config.json"
    else
      cat << 'EOF' > "$CLIENT_PATH/config.json"
{
  "targetGroupName": "Ranura 1",
  "targetGroupId": "",
  "buttonMode": "toggle",
  "minRecordDurationSeconds": 1.2,
  "autoPlayNewMessages": false,
  "port": 3000,
  "volume": 100,
  "channels": [
    { "id": "", "name": "Papá y Mamá", "avatar": "/avatars/family1.svg" },
    { "id": "", "name": "Abuelos Paternos", "avatar": "/avatars/family2.svg" },
    { "id": "", "name": "Abuelos Maternos", "avatar": "/avatars/family3.svg" }
  ],
  "activeChannelIndex": 0
}
EOF
    fi
  fi

  echo "🚀 Levantando contenedor '$CONTAINER_NAME' en el puerto $PORT..."
  docker run -d \
    --name "$CONTAINER_NAME" \
    --restart unless-stopped \
    -p "$PORT:3000" \
    -v "$CLIENT_PATH/auth:/app/auth_info_baileys" \
    -v "$CLIENT_PATH/data:/app/data" \
    -v "$CLIENT_PATH/config.json:/app/config.json" \
    -e PORT=3000 \
    -e NODE_ENV=production \
    "$IMAGE_NAME"

  echo ""
  echo "=========================================================="
  echo "🎉 ¡CAJA PARA '$CLIENT_SAFE' CREADA CON ÉXITO!"
  echo "=========================================================="
  echo "• Puerto local VPS: $PORT (http://localhost:$PORT)"
  echo "• Para ver el QR de WhatsApp: ./manage-boxes.sh logs $CLIENT_SAFE"
  echo ""
  echo "🌐 Añade estas 2 líneas a tu archivo 'config.yml' de Cloudflare Tunnel:"
  echo "----------------------------------------------------------"
  echo "  - hostname: ${CLIENT_SAFE}.tudominio.com"
  echo "    service: http://localhost:${PORT}"
  echo "----------------------------------------------------------"
  echo "Luego recarga cloudflared: systemctl restart cloudflared"
  echo "=========================================================="
}

function list_clients() {
  echo "📋 Cajas Mágicas desplegadas:"
  docker ps --filter "name=magic-box-" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
}

function logs_client() {
  CLIENT="$1"
  if [ -z "$CLIENT" ]; then
    echo "Uso: ./manage-boxes.sh logs <nombre_cliente>"
    exit 1
  fi
  CONTAINER_NAME="magic-box-$CLIENT"
  docker logs -f --tail 100 "$CONTAINER_NAME"
}

function restart_client() {
  CLIENT="$1"
  docker restart "magic-box-$CLIENT"
  echo "🔄 Caja '$CLIENT' reiniciada."
}

function stop_client() {
  CLIENT="$1"
  docker stop "magic-box-$CLIENT"
  echo "⏹️ Caja '$CLIENT' detenida."
}

function start_client() {
  CLIENT="$1"
  docker start "magic-box-$CLIENT"
  echo "▶️ Caja '$CLIENT' iniciada."
}

function backup_client() {
  CLIENT="$1"
  CLIENT_PATH="$CLIENTS_DIR/$CLIENT"
  if [ ! -d "$CLIENT_PATH" ]; then
    echo "❌ No existe la carpeta del cliente: $CLIENT_PATH"
    exit 1
  fi
  BACKUP_FILE="$BASE_DIR/backup_${CLIENT}_$(date +%Y%m%d_%H%M%S).tar.gz"
  tar -czf "$BACKUP_FILE" -C "$CLIENTS_DIR" "$CLIENT"
  echo "✅ Copia de seguridad creada: $BACKUP_FILE"
}

function remove_client() {
  CLIENT="$1"
  CONTAINER_NAME="magic-box-$CLIENT"
  echo "⚠️ ¿Estás seguro de que deseas eliminar el contenedor '$CONTAINER_NAME'? (Los datos en clients/$CLIENT no se borrarán)."
  read -p "Escribe 'si' para confirmar: " CONFIRM
  if [ "$CONFIRM" = "si" ]; then
    docker rm -f "$CONTAINER_NAME" || true
    echo "🗑️ Contenedor eliminado."
  else
    echo "Operación cancelada."
  fi
}

case "$1" in
  build)
    build_image
    ;;
  add)
    add_client "$2" "$3"
    ;;
  list)
    list_clients
    ;;
  logs)
    logs_client "$2"
    ;;
  restart)
    restart_client "$2"
    ;;
  stop)
    stop_client "$2"
    ;;
  start)
    start_client "$2"
    ;;
  backup)
    backup_client "$2"
    ;;
  remove)
    remove_client "$2"
    ;;
  *)
    show_help
    ;;
esac
