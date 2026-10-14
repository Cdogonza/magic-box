#!/data/data/com.termux/files/usr/bin/bash
# ========================================================
# Script de Configuración de Auto-Arranque (Termux:Boot + PM2)
# Caja Mágica de Voces 🎙️✨
# ========================================================

set -e

echo "🚀 Configurando inicio autónomo 24/7 para la Caja Mágica..."

# 1. Verificar directorio de trabajo
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
echo "📁 Directorio de la aplicación: $APP_DIR"

# 2. Instalar PM2 globalmente si no está instalado
if ! command -v pm2 &> /dev/null; then
  echo "📦 Instalando PM2 (supervisor de procesos)..."
  npm install -g pm2
else
  echo "✅ PM2 ya está instalado."
fi

# 3. Crear directorio de Termux:Boot
BOOT_DIR="$HOME/.termux/boot"
mkdir -p "$BOOT_DIR"

# 4. Crear el script que corre al reiniciar el teléfono
START_SCRIPT="$BOOT_DIR/start-caja.sh"
cat << 'EOF' > "$START_SCRIPT"
#!/data/data/com.termux/files/usr/bin/bash
# Mantener CPU activa
termux-wake-lock
sleep 4

export PATH=$PATH:/data/data/com.termux/files/usr/bin

# Buscar ruta de la caja
if [ -d "$HOME/magic-Box" ]; then
  cd "$HOME/magic-Box"
elif [ -d "$HOME/magic-box" ]; then
  cd "$HOME/magic-box"
fi

# Iniciar servidor con PM2
pm2 resurrect || pm2 start ecosystem.config.cjs

# Esperar a que el servidor web esté listo
sleep 3

# Abrir el navegador en la interfaz de la cara mágica
am start -a android.intent.action.VIEW -d "http://localhost:3000"
EOF

chmod +x "$START_SCRIPT"
echo "✅ Script de arranque creado en: $START_SCRIPT"

# 5. Iniciar y guardar estado en PM2
cd "$APP_DIR"
pm2 start ecosystem.config.cjs || pm2 restart ecosystem.config.cjs
pm2 save

echo ""
echo "======================================================"
echo "🎉 ¡CONFIGURACIÓN COMPLETADA CON ÉXITO!"
echo "======================================================"
echo "1. La Caja Mágica ahora corre bajo PM2 (si se cae, revive en 2 segundos)."
echo "2. Al reiniciar el celular, Termux:Boot iniciará el servidor automáticamente."
echo "3. Para ver el estado del servidor en cualquier momento: pm2 status"
echo "4. Para ver los registros de actividad: pm2 logs magic-box"
echo "======================================================"
