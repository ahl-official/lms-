// Simple structured logger for production readiness
// Outputs JSON lines with timestamp, level, message, and optional metadata

function base(level, message, meta) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    message,
  };
  if (meta && typeof meta === 'object') {
    entry.meta = meta;
  }
  // Ensure single-line output to keep logs easy to ingest
  try {
    console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log'](JSON.stringify(entry));
  } catch (e) {
    console.log(JSON.stringify(entry));
  }
}

module.exports = {
  info: (msg, meta) => base('info', msg, meta),
  warn: (msg, meta) => base('warn', msg, meta),
  error: (msg, meta) => base('error', msg, meta),
  debug: (msg, meta) => {
    if (process.env.DEBUG === 'true') base('debug', msg, meta);
  },
};

