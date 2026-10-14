module.exports = {
  apps: [{
    name: 'magic-box',
    script: 'server.js',
    watch: false,
    max_memory_restart: '180M',    // Reinicia si el teléfono viejo se satura de RAM
    restart_delay: 2000,           // Espera 2s antes de reiniciar para no saturar CPU
    exp_backoff_restart_delay: 100,// Incremento gradual si hay fallas repetidas
    max_restarts: 50,
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss'
  }]
};
