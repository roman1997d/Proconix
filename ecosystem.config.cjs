/**
 * PM2 ecosystem – Proconix
 * Pornire: pm2 start ecosystem.config.cjs
 * Restart cu limită memorie: previne memory leak să blocheze serverul.
 */
module.exports = {
  apps: [
    {
      name: 'proconix',
      script: 'index.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '500M',
      env: { NODE_ENV: 'development' },
      env_production: { NODE_ENV: 'production' },
      watch: false,
      error_file: './logs/err.log',
      out_file: './logs/out.log',
      merge_logs: true,
    },
  ],
};
