# ========================================================
# Dockerfile: Caja Mágica de Voces 🎙️✨
# Entorno de Producción Optimizado con FFmpeg Nativo
# ========================================================

FROM node:20-bookworm-slim

# Instalar FFmpeg completo y herramientas del sistema
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Instalar dependencias
COPY package*.json ./
RUN npm ci --omit=dev

# Copiar código fuente
COPY . .

# Generar sonidos interactivos si no existen
RUN node generate_sounds.js

# Asegurar directorios de datos persistentes
RUN mkdir -p /app/auth_info_baileys /app/data/received /app/data/recordings /app/data/avatars

# Puerto por defecto
EXPOSE 3000

# Verificación de salud periódica
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

# Iniciar servidor
CMD ["npm", "start"]
