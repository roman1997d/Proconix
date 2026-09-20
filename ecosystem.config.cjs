/**
 * PM2 ecosystem – Proconix
 * Start: pm2 start ecosystem.config.cjs --env production
 * Reload after changes: pm2 delete proconix && pm2 start ecosystem.config.cjs --env production && pm2 save
 */
module.exports = {
  apps: [
    {
      name: 'proconix',
      script: 'index.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '800M',
      min_uptime: '10s',
      max_restarts: 16,
      restart_delay: 4000,
      exp_backoff_restart_delay: 200,
      kill_timeout: 8000,
      listen_timeout: 15000,
      time: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: './logs/err.log',
      out_file: './logs/out.log',
      merge_logs: true,
      env: { NODE_ENV: 'development' },
      env_production: { NODE_ENV: 'production' },
    },
  ],
};
