/**
 * Captures this Node process stdout/stderr into a ring buffer for the platform admin UI.
 * Must call install() once at process startup (before most other requires) so logs are not lost.
 */

const MAX_LINES = 2000;

function createProcessLogBuffer() {
  const lines = [];
  const subscribers = new Set();

  function pushLine(line) {
    const normalized = String(line).replace(/\r$/, '');
    if (!normalized) return;
    if (lines.length >= MAX_LINES) lines.shift();
    lines.push(normalized);
    subscribers.forEach((fn) => {
      try {
        fn(normalized);
      } catch (_) {
        /* ignore subscriber errors */
      }
    });
  }

  return {
    pushLine,
    getAllLines() {
      return lines.slice();
    },
    subscribe(fn) {
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    },
  };
}

const buffer = createProcessLogBuffer();

function hookStream(stream, label) {
  const orig = stream.write.bind(stream);
  let pending = '';
  stream.write = function writeHook(chunk, encoding, cb) {
    let s = '';
    if (typeof chunk === 'string') {
      s = chunk;
    } else if (Buffer.isBuffer(chunk)) {
      s = chunk.toString(encoding && encoding !== 'buffer' ? encoding : 'utf8');
    } else {
      s = String(chunk);
    }
    pending += s;
    const parts = pending.split(/\r?\n/);
    pending = parts.pop() || '';
    parts.forEach((line) => {
      buffer.pushLine(`[${label}] ${line}`);
    });
    return orig(chunk, encoding, cb);
  };
}

function install() {
  if (install._done) return;
  install._done = true;

  hookStream(process.stdout, 'out');
  hookStream(process.stderr, 'err');

  process.on('uncaughtException', (err) => {
    buffer.pushLine(`[process] uncaughtException: ${err.stack || err.message}`);
  });
  process.on('unhandledRejection', (reason) => {
    const msg =
      reason && typeof reason === 'object' && reason.stack
        ? reason.stack
        : String(reason);
    buffer.pushLine(`[process] unhandledRejection: ${msg}`);
  });
}

module.exports = {
  install,
  buffer,
};
