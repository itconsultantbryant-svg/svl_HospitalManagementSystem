/**
 * Minimal Fetch Request/Response ↔ Node IncomingMessage/ServerResponse adapter
 * for Neon Functions (Node.js 24). Avoids ESM-only fetch-to-node so esbuild can
 * fully bundle the Express app as CommonJS.
 */
const { Readable, Writable } = require('node:stream');
const { Buffer } = require('node:buffer');

function toReqRes(request) {
  const url = new URL(request.url);
  const req = new Readable({
    read() {},
  });
  req.url = url.pathname + url.search;
  req.method = request.method;
  req.headers = {};
  request.headers.forEach((value, key) => {
    req.headers[key.toLowerCase()] = value;
  });
  req.httpVersion = '1.1';
  req.socket = null;

  if (request.body) {
    const reader = request.body.getReader();
    (async () => {
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) {
            req.push(null);
            break;
          }
          req.push(Buffer.from(value));
        }
      } catch (err) {
        req.destroy(err);
      }
    })();
  } else {
    req.push(null);
  }

  const chunks = [];
  let statusCode = 200;
  const responseHeaders = {};
  let finished = false;

  const res = new Writable({
    write(chunk, encoding, callback) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding));
      callback();
    },
  });

  res.statusCode = 200;
  res.headersSent = false;
  res.socket = null;

  res.setHeader = (name, value) => {
    responseHeaders[String(name).toLowerCase()] = value;
  };
  res.getHeader = (name) => responseHeaders[String(name).toLowerCase()];
  res.removeHeader = (name) => {
    delete responseHeaders[String(name).toLowerCase()];
  };
  res.getHeaders = () => ({ ...responseHeaders });
  res.writeHead = (code, headers) => {
    statusCode = code;
    res.statusCode = code;
    if (headers) {
      for (const [k, v] of Object.entries(headers)) {
        res.setHeader(k, v);
      }
    }
    res.headersSent = true;
    return res;
  };
  res.end = (chunk, encoding, cb) => {
    if (chunk) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding || 'utf8'));
    }
    finished = true;
    statusCode = res.statusCode || statusCode;
    res.headersSent = true;
    res.emit('finish');
    if (typeof encoding === 'function') encoding();
    else if (typeof cb === 'function') cb();
    return res;
  };

  Object.defineProperty(res, '_chunks', { get: () => chunks });
  Object.defineProperty(res, '_status', { get: () => statusCode });
  Object.defineProperty(res, '_headerMap', { get: () => responseHeaders });
  Object.defineProperty(res, '_finished', { get: () => finished });

  return { req, res };
}

function toFetchResponse(res) {
  return new Promise((resolve, reject) => {
    const finish = () => {
      const headers = new Headers();
      for (const [k, v] of Object.entries(res._headerMap || {})) {
        if (v == null) continue;
        if (Array.isArray(v)) v.forEach((item) => headers.append(k, String(item)));
        else headers.set(k, String(v));
      }
      const body = Buffer.concat(res._chunks || []);
      resolve(new Response(body, { status: res._status || res.statusCode || 200, headers }));
    };

    if (res._finished) finish();
    else {
      res.once('finish', finish);
      res.once('error', reject);
    }
  });
}

module.exports = { toReqRes, toFetchResponse };
