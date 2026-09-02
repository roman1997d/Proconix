/* DrawingViewer — custom mobile-first plan viewer (pdf.js). Pan/pinch only; pages via icons. */
(function (global) {
  'use strict';

  var MIN_SCALE = 1;
  var MAX_SCALE = 28;
  var TAP_ZOOM = 5.5;
  var TAP_ZOOM_2 = 14;
  var HIDE_MS = 3400;
  var MAX_CANVAS = 5120;
  var DETAIL_SETTLE_MS = 70;
  var DETAIL_REPAN_PX = 36;
  var TAP_MOVE = 8;
  var DOUBLE_MS = 300;
  var PAN_GAIN = 1.35;
  var RUBBER = 80;
  var FRICTION = 0.94;
  var INERTIA_MIN = 0.18;
  var MAX_V = 3.6;

  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

  function dist(a, b) {
    var dx = a.x - b.x, dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function midpoint(a, b) {
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  function DrawingViewer(root, opts) {
    this.root = root;
    this.opts = opts || {};
    this.stage = root.querySelector('[data-dv-stage]');
    this.plane = root.querySelector('[data-dv-plane]');
    this.canvas = root.querySelector('[data-dv-canvas]');
    this.detail = root.querySelector('[data-dv-detail]');
    this.status = root.querySelector('[data-dv-status]');
    this.pageEl = root.querySelector('[data-dv-page]');
    this.prevBtn = root.querySelector('[data-dv-prev]');
    this.nextBtn = root.querySelector('[data-dv-next]');

    this.pdf = null;
    this.page = null;
    this.pageNum = 1;
    this.pageCount = 1;
    this.pageCssW = 1;
    this.pageCssH = 1;
    this.scale = 1;
    this.tx = 0;
    this.ty = 0;
    this.pointers = {};
    this.gesture = null;
    this.pan = null;
    this.renderTask = null;
    this.renderToken = 0;
    this.hideTimer = null;
    this.lastTap = 0;
    this.lastTapX = 0;
    this.lastTapY = 0;
    this.moved = false;
    this.qualityTimer = null;
    this.detailTimer = null;
    this.detailToken = 0;
    this.detailTask = null;
    this.detailAtTx = 0;
    this.detailAtTy = 0;
    this.detailAtScale = 1;
    this.basePaintKey = '';
    this.resizeTimer = null;
    this.active = false;
    this.drawing = null;
    this.vx = 0;
    this.vy = 0;
    this.lastPanX = 0;
    this.lastPanY = 0;
    this.lastPanT = 0;
    this.inertiaId = 0;
    this.transformRaf = 0;
    this.softPan = false;

    this._onPtrDown = this.onPtrDown.bind(this);
    this._onPtrMove = this.onPtrMove.bind(this);
    this._onPtrUp = this.onPtrUp.bind(this);
    this._onTouchStart = this.onTouchStart.bind(this);
    this._onTouchMove = this.onTouchMove.bind(this);
    this._onTouchEnd = this.onTouchEnd.bind(this);
    this._onWheel = this.onWheel.bind(this);
    this._onResize = this.onResize.bind(this);

    this.bind();
  }

  DrawingViewer.prototype.bind = function () {
    var stage = this.stage;
    var self = this;
    stage.addEventListener('pointerdown', this._onPtrDown);
    stage.addEventListener('pointermove', this._onPtrMove, { passive: false });
    stage.addEventListener('pointerup', this._onPtrUp);
    stage.addEventListener('pointercancel', this._onPtrUp);
    stage.addEventListener('touchstart', this._onTouchStart, { passive: false });
    stage.addEventListener('touchmove', this._onTouchMove, { passive: false });
    stage.addEventListener('touchend', this._onTouchEnd, { passive: false });
    stage.addEventListener('touchcancel', this._onTouchEnd, { passive: false });
    stage.addEventListener('wheel', this._onWheel, { passive: false });
    stage.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    stage.addEventListener('gesturestart', function (e) { e.preventDefault(); });
    stage.addEventListener('gesturechange', function (e) { e.preventDefault(); });
    window.addEventListener('resize', this._onResize);
    window.addEventListener('orientationchange', this._onResize);

    var root = this.root;
    root.querySelector('[data-dv-zoom-in]').addEventListener('click', function () {
      self.bumpScale(1.4); self.pokeChrome();
    });
    root.querySelector('[data-dv-zoom-out]').addEventListener('click', function () {
      self.bumpScale(1 / 1.4); self.pokeChrome();
    });
    root.querySelector('[data-dv-fit]').addEventListener('click', function () {
      self.fit(); self.pokeChrome();
    });
    root.querySelector('[data-dv-fs]').addEventListener('click', function () {
      self.toggleFullscreen(); self.pokeChrome();
    });
    this.prevBtn.addEventListener('click', function () { self.goPage(self.pageNum - 1); self.pokeChrome(); });
    this.nextBtn.addEventListener('click', function () { self.goPage(self.pageNum + 1); self.pokeChrome(); });
  };

  DrawingViewer.prototype.setStatus = function (msg) {
    if (!this.status) return;
    this.status.textContent = msg || '';
    this.status.hidden = !msg;
  };

  DrawingViewer.prototype.open = async function (blob, drawing) {
    this.active = true;
    this.drawing = drawing || {};
    this.scale = 1;
    this.tx = 0;
    this.ty = 0;
    this.pageNum = 1;
    this.vx = 0;
    this.vy = 0;
    this.stopInertia();
    this.setStatus('Opening drawing…');
    this.plane.style.visibility = 'hidden';
    this.pokeChrome();

    var lib = window.pdfjsLib;
    if (!lib) throw new Error('PDF engine missing.');
    lib.GlobalWorkerOptions.workerSrc = lib.GlobalWorkerOptions.workerSrc || '/mydrawings/lib/pdf.worker.min.js';

    if (this.pdf && this.pdf.destroy) {
      try { this.pdf.destroy(); } catch (e) {}
    }
    var buf = await blob.arrayBuffer();
    this.pdf = await lib.getDocument({
      data: new Uint8Array(buf),
      disableStream: true,
      disableRange: true,
      disableAutoFetch: true,
      isEvalSupported: false,
      useSystemFonts: false
    }).promise;

    this.pageCount = this.pdf.numPages || 1;
    await new Promise(function (r) { requestAnimationFrame(r); });
    await this.showPage(1, true);
    this.pokeChrome();
  };

  DrawingViewer.prototype.close = function () {
    this.active = false;
    this.clearHide();
    this.stopInertia();
    if (this.qualityTimer) clearTimeout(this.qualityTimer);
    if (this.detailTimer) clearTimeout(this.detailTimer);
    if (this.detailTask && this.detailTask.cancel) {
      try { this.detailTask.cancel(); } catch (e) {}
    }
    this.detailTask = null;
    this.hideDetail();
    if (this.renderTask && this.renderTask.cancel) {
      try { this.renderTask.cancel(); } catch (e) {}
    }
    this.renderTask = null;
    if (this.pdf && this.pdf.destroy) {
      try { this.pdf.destroy(); } catch (e) {}
    }
    this.pdf = null;
    this.page = null;
    this.pointers = {};
    this.gesture = null;
    this.pan = null;
    this.root.classList.remove('is-fs', 'is-chrome-hidden');
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(function () {});
    }
    this.setStatus('');
  };

  DrawingViewer.prototype.fitSize = function (page) {
    var pad = 8;
    var sw = Math.max(200, this.stage.clientWidth - pad * 2);
    var sh = Math.max(200, this.stage.clientHeight - pad * 2);
    var vp = page.getViewport({ scale: 1 });
    var s = Math.min(sw / vp.width, sh / vp.height);
    return { cssW: vp.width * s, cssH: vp.height * s, pdfW: vp.width, pdfH: vp.height };
  };

  DrawingViewer.prototype.maxBaseScale = function (cssW, cssH, pdfW) {
    var dpr = Math.min(3, window.devicePixelRatio || 1);
    var pdfH = pdfW * (cssH / cssW);
    /* Sharper base so light zoom stays crisp without waiting for HQ crop. */
    var want = (cssW / pdfW) * dpr * 2.75;
    var maxByCanvas = MAX_CANVAS / Math.max(pdfW, pdfH);
    return clamp(want, 0.5, maxByCanvas);
  };

  DrawingViewer.prototype.showPage = async function (num, fit) {
    if (!this.pdf || !this.active) return;
    this.pageNum = clamp(num, 1, this.pageCount);
    this.updatePager();
    this.setStatus('Opening drawing…');
    this.hideDetail();
    this.page = await this.pdf.getPage(this.pageNum);
    if (fit) this.fit(true);
    else this.applyTransform(true);
    await this.paintBase(true);
    this.setStatus('');
    this.plane.style.visibility = 'visible';
  };

  DrawingViewer.prototype.goPage = function (num) {
    if (num < 1 || num > this.pageCount || num === this.pageNum) return;
    this.showPage(num, true);
  };

  DrawingViewer.prototype.updatePager = function () {
    if (this.pageEl) this.pageEl.textContent = this.pageNum + ' / ' + this.pageCount;
    if (this.prevBtn) this.prevBtn.disabled = this.pageNum <= 1;
    if (this.nextBtn) this.nextBtn.disabled = this.pageNum >= this.pageCount;
  };

  DrawingViewer.prototype.fit = function (skipPaint) {
    if (!this.page) return;
    var size = this.fitSize(this.page);
    this.pageCssW = size.cssW;
    this.pageCssH = size.cssH;
    this.scale = 1;
    this.tx = (this.stage.clientWidth - this.pageCssW) / 2;
    this.ty = (this.stage.clientHeight - this.pageCssH) / 2;
    this.hideDetail();
    this.applyTransform(true);
    if (!skipPaint) this.paintBase();
  };

  DrawingViewer.prototype.applyTransform = function (immediate) {
    this.clampPan(this.softPan);
    if (immediate) {
      this.flushTransform();
      return;
    }
    if (this.transformRaf) return;
    var self = this;
    this.transformRaf = requestAnimationFrame(function () {
      self.transformRaf = 0;
      self.flushTransform();
    });
  };

  DrawingViewer.prototype.flushTransform = function () {
    this.clampPan(this.softPan);
    this.plane.style.width = this.pageCssW + 'px';
    this.plane.style.height = this.pageCssH + 'px';
    this.plane.style.transform = 'translate3d(' + this.tx + 'px,' + this.ty + 'px,0) scale(' + this.scale + ')';
    this.nudgeDetail();
  };

  DrawingViewer.prototype.hideDetail = function () {
    if (this.detailTimer) {
      clearTimeout(this.detailTimer);
      this.detailTimer = null;
    }
    if (this.detailTask && this.detailTask.cancel) {
      try { this.detailTask.cancel(); } catch (e) {}
    }
    this.detailTask = null;
    if (this.detail) {
      this.detail.classList.remove('is-on');
      this.detail.hidden = true;
      this.detail.style.transform = '';
      this.detail.style.opacity = '';
    }
    this.detailAtScale = 0;
  };

  /* Keep the last sharp crop on screen and slide it with the finger (Files-like). */
  DrawingViewer.prototype.nudgeDetail = function () {
    if (!this.detail || this.detail.hidden || !this.detailAtScale) return;
    var scaleRatio = this.scale / this.detailAtScale;
    if (scaleRatio < 0.94 || scaleRatio > 1.06) {
      this.detail.style.opacity = '0';
      return;
    }
    var dx = this.tx - this.detailAtTx;
    var dy = this.ty - this.detailAtTy;
    this.detail.style.transform = 'translate3d(' + dx + 'px,' + dy + 'px,0)';
    this.detail.style.opacity = '1';
    this.detail.classList.add('is-on');
  };

  DrawingViewer.prototype.detailNeedsRefresh = function () {
    if (!this.detail || !this.detailAtScale || this.detail.hidden) return this.scale > 1.08;
    if (Math.abs(this.scale / this.detailAtScale - 1) > 0.03) return true;
    var dx = this.tx - this.detailAtTx;
    var dy = this.ty - this.detailAtTy;
    return Math.sqrt(dx * dx + dy * dy) > DETAIL_REPAN_PX;
  };

  DrawingViewer.prototype.clampPan = function (soft) {
    var sw = this.stage.clientWidth;
    var sh = this.stage.clientHeight;
    var w = this.pageCssW * this.scale;
    var h = this.pageCssH * this.scale;
    var extra = soft ? RUBBER : 0;
    if (w <= sw) this.tx = (sw - w) / 2;
    else this.tx = clamp(this.tx, sw - w - extra, extra);
    if (h <= sh) this.ty = (sh - h) / 2;
    else this.ty = clamp(this.ty, sh - h - extra, extra);
  };

  DrawingViewer.prototype.hardBounds = function () {
    var sw = this.stage.clientWidth;
    var sh = this.stage.clientHeight;
    var w = this.pageCssW * this.scale;
    var h = this.pageCssH * this.scale;
    var minX = w <= sw ? (sw - w) / 2 : sw - w;
    var maxX = w <= sw ? (sw - w) / 2 : 0;
    var minY = h <= sh ? (sh - h) / 2 : sh - h;
    var maxY = h <= sh ? (sh - h) / 2 : 0;
    return { minX: minX, maxX: maxX, minY: minY, maxY: maxY };
  };

  DrawingViewer.prototype.stopInertia = function () {
    if (this.inertiaId) {
      cancelAnimationFrame(this.inertiaId);
      this.inertiaId = 0;
    }
    this.vx = 0;
    this.vy = 0;
  };

  DrawingViewer.prototype.startInertia = function () {
    var self = this;
    var vx = clamp(this.vx, -MAX_V, MAX_V);
    var vy = clamp(this.vy, -MAX_V, MAX_V);
    this.stopInertia();
    this.vx = vx;
    this.vy = vy;
    var speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
    if (speed < INERTIA_MIN) {
      this.softPan = false;
      this.flushTransform();
      this.scheduleDetail();
      return;
    }
    this.softPan = true;
    var last = performance.now();
    var tick = function (now) {
      if (!self.active) return;
      var dt = Math.min(32, now - last);
      last = now;
      self.tx += self.vx * dt;
      self.ty += self.vy * dt;
      var b = self.hardBounds();
      var out = self.tx < b.minX || self.tx > b.maxX || self.ty < b.minY || self.ty > b.maxY;
      var friction = out ? 0.82 : FRICTION;
      self.vx *= friction;
      self.vy *= friction;
      self.flushTransform();
      var sp = Math.sqrt(self.vx * self.vx + self.vy * self.vy);
      if (sp < 0.035) {
        self.inertiaId = 0;
        self.settleEdges();
        return;
      }
      self.inertiaId = requestAnimationFrame(tick);
    };
    this.inertiaId = requestAnimationFrame(tick);
  };

  DrawingViewer.prototype.settleEdges = function () {
    var self = this;
    this.softPan = false;
    var b = this.hardBounds();
    var tx = clamp(this.tx, b.minX, b.maxX);
    var ty = clamp(this.ty, b.minY, b.maxY);
    if (Math.abs(tx - this.tx) < 0.5 && Math.abs(ty - this.ty) < 0.5) {
      this.tx = tx;
      this.ty = ty;
      this.flushTransform();
      this.scheduleDetail();
      return;
    }
    var startX = this.tx;
    var startY = this.ty;
    var t0 = performance.now();
    var dur = 180;
    var step = function (now) {
      var t = Math.min(1, (now - t0) / dur);
      var e = 1 - Math.pow(1 - t, 3);
      self.tx = startX + (tx - startX) * e;
      self.ty = startY + (ty - startY) * e;
      self.flushTransform();
      if (t < 1) {
        self.inertiaId = requestAnimationFrame(step);
        return;
      }
      self.inertiaId = 0;
      self.scheduleDetail();
    };
    this.inertiaId = requestAnimationFrame(step);
  };

  DrawingViewer.prototype.zoomAt = function (clientX, clientY, nextScale) {
    var rect = this.stage.getBoundingClientRect();
    var x = clientX - rect.left;
    var y = clientY - rect.top;
    var ns = clamp(nextScale, MIN_SCALE, MAX_SCALE);
    var dx = (x - this.tx) / this.scale;
    var dy = (y - this.ty) / this.scale;
    this.scale = ns;
    this.tx = x - dx * this.scale;
    this.ty = y - dy * this.scale;
    this.applyTransform(true);
  };

  DrawingViewer.prototype.bumpScale = function (factor) {
    var rect = this.stage.getBoundingClientRect();
    this.zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, this.scale * factor);
    this.scheduleDetail();
  };

  DrawingViewer.prototype.paintBase = async function (force) {
    if (!this.page || !this.active) return;
    var pdfW = this.page.getViewport({ scale: 1 }).width;
    var rs = this.maxBaseScale(this.pageCssW, this.pageCssH, pdfW);
    var key = this.pageNum + ':' + Math.round(this.pageCssW) + 'x' + Math.round(this.pageCssH) + ':' + rs.toFixed(3);
    if (!force && key === this.basePaintKey) return;
    var token = ++this.renderToken;
    var viewport = this.page.getViewport({ scale: rs });
    var canvas = this.canvas;
    var w = Math.max(1, Math.round(viewport.width));
    var h = Math.max(1, Math.round(viewport.height));
    var ctx = canvas.getContext('2d', { alpha: false });
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    } else {
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, w, h);
    }
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    ctx.imageSmoothingEnabled = false;
    if (this.renderTask && this.renderTask.cancel) {
      try { this.renderTask.cancel(); } catch (e) {}
    }
    this.renderTask = this.page.render({ canvasContext: ctx, viewport: viewport, intent: 'display' });
    try {
      await this.renderTask.promise;
    } catch (e) {
      if (e && e.name === 'RenderingCancelledException') return;
      throw e;
    }
    if (token !== this.renderToken) return;
    this.renderTask = null;
    this.basePaintKey = key;
  };

  DrawingViewer.prototype.paintDetail = async function () {
    if (!this.page || !this.active || !this.detail) return;
    if (this.scale <= 1.08) {
      this.hideDetail();
      return;
    }
    if (!this.detailNeedsRefresh() && this.detail.classList.contains('is-on')) {
      this.nudgeDetail();
      return;
    }
    var token = ++this.detailToken;
    var sw = Math.max(1, this.stage.clientWidth);
    var sh = Math.max(1, this.stage.clientHeight);
    /* Cap detail DPR for speed — overlay only needs to look sharp, not print-ready. */
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    var boost = this.scale > 10 ? 1.15 : 1.35;
    var outW = Math.max(1, Math.round(sw * dpr * boost));
    var outH = Math.max(1, Math.round(sh * dpr * boost));
    var cap = MAX_CANVAS;
    var fit = Math.min(1, cap / Math.max(outW, outH));
    outW = Math.max(1, Math.round(outW * fit));
    outH = Math.max(1, Math.round(outH * fit));

    var vp1 = this.page.getViewport({ scale: 1 });
    var visLeft = (0 - this.tx) / this.scale;
    var visTop = (0 - this.ty) / this.scale;
    var visW = sw / this.scale;
    var visH = sh / this.scale;
    var pdfLeft = visLeft / this.pageCssW * vp1.width;
    var pdfTop = visTop / this.pageCssH * vp1.height;
    var pdfVisW = visW / this.pageCssW * vp1.width;
    var pdfVisH = visH / this.pageCssH * vp1.height;
    if (pdfVisW < 1 || pdfVisH < 1) return;

    var renderScale = outW / pdfVisW;
    var viewport = this.page.getViewport({ scale: renderScale });

    if (!this._detailOff) this._detailOff = document.createElement('canvas');
    var off = this._detailOff;
    if (off.width !== outW || off.height !== outH) {
      off.width = outW;
      off.height = outH;
    }
    var ctx = off.getContext('2d', { alpha: false });
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, outW, outH);
    ctx.imageSmoothingEnabled = false;

    if (this.detailTask && this.detailTask.cancel) {
      try { this.detailTask.cancel(); } catch (e) {}
    }
    this.detailTask = this.page.render({
      canvasContext: ctx,
      viewport: viewport,
      transform: [1, 0, 0, 1, -pdfLeft * renderScale, -pdfTop * renderScale],
      intent: 'display',
      background: 'rgb(255,255,255)'
    });
    try {
      await this.detailTask.promise;
    } catch (e) {
      if (e && e.name === 'RenderingCancelledException') return;
      throw e;
    }
    if (token !== this.detailToken || !this.active) return;
    this.detailTask = null;

    var shown = this.detail;
    if (shown.width !== outW || shown.height !== outH) {
      shown.width = outW;
      shown.height = outH;
    }
    shown.style.width = sw + 'px';
    shown.style.height = sh + 'px';
    var dest = shown.getContext('2d', { alpha: false });
    dest.drawImage(off, 0, 0);
    this.detailAtTx = this.tx;
    this.detailAtTy = this.ty;
    this.detailAtScale = this.scale;
    shown.style.transform = 'translate3d(0,0,0)';
    shown.style.opacity = '1';
    shown.hidden = false;
    shown.classList.add('is-on');
  };

  DrawingViewer.prototype.scheduleDetail = function () {
    var self = this;
    if (this.detailTimer) clearTimeout(this.detailTimer);
    if (!this.detailNeedsRefresh() && this.detail && this.detail.classList.contains('is-on')) {
      this.nudgeDetail();
      return;
    }
    this.detailTimer = setTimeout(function () {
      self.paintDetail().catch(function () {});
    }, DETAIL_SETTLE_MS);
  };

  DrawingViewer.prototype.touchPoints = function (e) {
    var out = [];
    var n = Math.min(e.touches.length, 2);
    for (var i = 0; i < n; i++) {
      out.push({ x: e.touches[i].clientX, y: e.touches[i].clientY });
    }
    return out;
  };

  DrawingViewer.prototype.beginGesture = function (pts) {
    this.stopInertia();
    if (this.detailTimer) {
      clearTimeout(this.detailTimer);
      this.detailTimer = null;
    }
    if (this.detailTask && this.detailTask.cancel) {
      try { this.detailTask.cancel(); } catch (e) {}
      this.detailTask = null;
    }
    if (pts.length >= 2) {
      this.gesture = {
        mode: 'two',
        dist: Math.max(1, dist(pts[0], pts[1])),
        mid: midpoint(pts[0], pts[1]),
        scale: this.scale,
        tx: this.tx,
        ty: this.ty
      };
      this.softPan = true;
      return;
    }
    if (pts.length === 1) {
      this.softPan = true;
      this.lastPanX = pts[0].x;
      this.lastPanY = pts[0].y;
      this.lastPanT = performance.now();
      this.vx = 0;
      this.vy = 0;
      this.gesture = {
        mode: 'one',
        x: pts[0].x,
        y: pts[0].y,
        tx: this.tx,
        ty: this.ty
      };
    }
  };

  DrawingViewer.prototype.applyTwoFinger = function (pts) {
    var g = this.gesture;
    if (!g || g.mode !== 'two' || pts.length < 2) return;
    var mid = midpoint(pts[0], pts[1]);
    var d = Math.max(1, dist(pts[0], pts[1]));
    var pinch = Math.pow(d / g.dist, 1.18);
    var newScale = clamp(g.scale * pinch, MIN_SCALE, MAX_SCALE);
    var rect = this.stage.getBoundingClientRect();
    var worldX = (g.mid.x - rect.left - g.tx) / g.scale;
    var worldY = (g.mid.y - rect.top - g.ty) / g.scale;
    this.scale = newScale;
    this.tx = (mid.x - rect.left) - worldX * newScale;
    this.ty = (mid.y - rect.top) - worldY * newScale;
    this.applyTransform();
  };

  DrawingViewer.prototype.applyOneFinger = function (pt) {
    var g = this.gesture;
    if (!g || g.mode !== 'one') return;
    var now = performance.now();
    var rawX = pt.x - g.x;
    var rawY = pt.y - g.y;
    if (Math.abs(rawX) > TAP_MOVE || Math.abs(rawY) > TAP_MOVE) {
      this.moved = true;
    }
    var gain = this.scale > 1.4 ? PAN_GAIN : 1.15;
    this.tx = g.tx + rawX * gain;
    this.ty = g.ty + rawY * gain;
    var dt = now - this.lastPanT;
    if (dt > 0 && dt < 64) {
      this.vx = (pt.x - this.lastPanX) * gain / dt;
      this.vy = (pt.y - this.lastPanY) * gain / dt;
    }
    this.lastPanX = pt.x;
    this.lastPanY = pt.y;
    this.lastPanT = now;
    this.applyTransform();
  };

  DrawingViewer.prototype.finishGesture = function (clientX, clientY) {
    this.gesture = null;
    if (!this.moved) {
      this.softPan = false;
      var now = Date.now();
      if (now - this.lastTap < DOUBLE_MS && Math.abs(clientX - this.lastTapX) < 28 && Math.abs(clientY - this.lastTapY) < 28) {
        this.lastTap = 0;
        if (this.scale > 9) this.fit();
        else if (this.scale > 3.2) this.zoomAt(clientX, clientY, TAP_ZOOM_2);
        else this.zoomAt(clientX, clientY, TAP_ZOOM);
        this.scheduleDetail();
        this.pokeChrome();
        return;
      }
      this.lastTap = now;
      this.lastTapX = clientX;
      this.lastTapY = clientY;
      this.toggleChrome();
      return;
    }
    var stale = performance.now() - this.lastPanT > 50;
    if (stale) {
      this.vx = 0;
      this.vy = 0;
    }
    this.startInertia();
    this.pokeChrome();
  };

  DrawingViewer.prototype.onTouchStart = function (e) {
    if (!this.active) return;
    e.preventDefault();
    var pts = this.touchPoints(e);
    if (pts.length === 1 && !this.gesture) this.moved = false;
    this.beginGesture(pts);
  };

  DrawingViewer.prototype.onTouchMove = function (e) {
    if (!this.active) return;
    e.preventDefault();
    var pts = this.touchPoints(e);
    if (pts.length >= 2) {
      if (!this.gesture || this.gesture.mode !== 'two') this.beginGesture(pts);
      this.applyTwoFinger(pts);
      this.moved = true;
      return;
    }
    if (pts.length === 1) {
      if (!this.gesture || this.gesture.mode !== 'one') this.beginGesture(pts);
      this.applyOneFinger(pts[0]);
    }
  };

  DrawingViewer.prototype.onTouchEnd = function (e) {
    if (!this.active) return;
    e.preventDefault();
    var pts = this.touchPoints(e);
    var x = (e.changedTouches && e.changedTouches[0]) ? e.changedTouches[0].clientX : this.lastTapX;
    var y = (e.changedTouches && e.changedTouches[0]) ? e.changedTouches[0].clientY : this.lastTapY;
    if (pts.length >= 1) {
      this.beginGesture(pts);
      return;
    }
    this.finishGesture(x, y);
  };

  DrawingViewer.prototype.ptrList = function () {
    var keys = Object.keys(this.pointers);
    var out = [];
    for (var i = 0; i < keys.length; i++) out.push(this.pointers[keys[i]]);
    return out;
  };

  DrawingViewer.prototype.onPtrDown = function (e) {
    if (!this.active) return;
    if (e.pointerType === 'touch') return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    this.stage.setPointerCapture(e.pointerId);
    this.pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
    this.moved = false;
    this.beginGesture(this.ptrList());
  };

  DrawingViewer.prototype.onPtrMove = function (e) {
    if (e.pointerType === 'touch') return;
    if (!this.pointers[e.pointerId]) return;
    e.preventDefault();
    this.pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
    var pts = this.ptrList();
    if (pts.length >= 2) {
      if (!this.gesture || this.gesture.mode !== 'two') this.beginGesture(pts);
      this.applyTwoFinger(pts);
      this.moved = true;
      return;
    }
    if (pts.length === 1) this.applyOneFinger(pts[0]);
  };

  DrawingViewer.prototype.onPtrUp = function (e) {
    if (e.pointerType === 'touch') return;
    if (!this.pointers[e.pointerId]) return;
    var x = e.clientX, y = e.clientY;
    delete this.pointers[e.pointerId];
    var pts = this.ptrList();
    try { this.stage.releasePointerCapture(e.pointerId); } catch (err) {}
    if (pts.length >= 1) {
      this.beginGesture(pts);
      return;
    }
    this.finishGesture(x, y);
  };

  DrawingViewer.prototype.onWheel = function (e) {
    if (!this.active) return;
    e.preventDefault();
    var factor = e.deltaY < 0 ? 1.16 : 0.86;
    this.zoomAt(e.clientX, e.clientY, this.scale * factor);
    this.scheduleDetail();
    this.pokeChrome();
  };

  DrawingViewer.prototype.onResize = function () {
    var self = this;
    if (!this.active || !this.page) return;
    clearTimeout(this.resizeTimer);
    this.resizeTimer = setTimeout(function () {
      if (self.scale <= 1.02) self.fit();
      else {
        var size = self.fitSize(self.page);
        self.pageCssW = size.cssW;
        self.pageCssH = size.cssH;
        self.applyTransform(true);
        self.paintBase(true);
        self.scheduleDetail();
      }
    }, 120);
  };

  DrawingViewer.prototype.toggleFullscreen = function () {
    var el = this.root;
    var app = document.getElementById('md-app');
    if (el.classList.contains('is-fs')) {
      el.classList.remove('is-fs');
      if (app) app.classList.remove('is-fs');
      if (document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch(function () {});
      }
      var self = this;
      setTimeout(function () { self.onResize(); }, 80);
      return;
    }
    el.classList.add('is-fs');
    if (app) app.classList.add('is-fs');
    var req = el.requestFullscreen || el.webkitRequestFullscreen;
    if (req) req.call(el).catch(function () {});
    var self2 = this;
    setTimeout(function () { self2.onResize(); }, 80);
  };

  DrawingViewer.prototype.clearHide = function () {
    if (this.hideTimer) { clearTimeout(this.hideTimer); this.hideTimer = null; }
  };

  DrawingViewer.prototype.pokeChrome = function () {
    this.root.classList.remove('is-chrome-hidden');
    this.armHide();
  };

  DrawingViewer.prototype.toggleChrome = function () {
    if (this.root.classList.contains('is-chrome-hidden')) this.pokeChrome();
    else {
      this.root.classList.add('is-chrome-hidden');
      this.clearHide();
    }
  };

  DrawingViewer.prototype.armHide = function () {
    var self = this;
    this.clearHide();
    this.hideTimer = setTimeout(function () {
      if (self.active) self.root.classList.add('is-chrome-hidden');
    }, HIDE_MS);
  };

  global.DrawingViewer = DrawingViewer;
})(window);
