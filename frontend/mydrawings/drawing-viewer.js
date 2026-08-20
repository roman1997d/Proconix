/* DrawingViewer — custom mobile-first plan viewer (pdf.js). Pan/pinch only; pages via icons. */
(function (global) {
  'use strict';

  var MIN_SCALE = 1;
  var MAX_SCALE = 8;
  var TAP_ZOOM = 2.75;
  var HIDE_MS = 3400;
  var MAX_CANVAS = 4096;
  var TAP_MOVE = 10;
  var DOUBLE_MS = 300;

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
    this.resizeTimer = null;
    this.active = false;
    this.drawing = null;

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
      self.bumpScale(1.25); self.pokeChrome();
    });
    root.querySelector('[data-dv-zoom-out]').addEventListener('click', function () {
      self.bumpScale(1 / 1.25); self.pokeChrome();
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
    if (this.qualityTimer) clearTimeout(this.qualityTimer);
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

  DrawingViewer.prototype.maxRenderScale = function (cssW, cssH, pdfW) {
    var dpr = Math.min(3, window.devicePixelRatio || 1);
    var pdfH = pdfW * (cssH / cssW);
    var want = (cssW / pdfW) * this.scale * dpr * 1.4;
    var maxByCanvas = MAX_CANVAS / Math.max(pdfW, pdfH);
    return clamp(want, 0.35, maxByCanvas);
  };

  DrawingViewer.prototype.showPage = async function (num, fit) {
    if (!this.pdf || !this.active) return;
    this.pageNum = clamp(num, 1, this.pageCount);
    this.updatePager();
    this.setStatus('Opening drawing…');
    this.page = await this.pdf.getPage(this.pageNum);
    if (fit) this.fit(true);
    else this.applyTransform();
    await this.paint(true);
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
    this.applyTransform();
    if (!skipPaint) this.schedulePaint();
  };

  DrawingViewer.prototype.applyTransform = function () {
    this.clampPan();
    this.plane.style.width = this.pageCssW + 'px';
    this.plane.style.height = this.pageCssH + 'px';
    this.plane.style.transform = 'translate3d(' + this.tx + 'px,' + this.ty + 'px,0) scale(' + this.scale + ')';
  };

  DrawingViewer.prototype.clampPan = function () {
    var sw = this.stage.clientWidth;
    var sh = this.stage.clientHeight;
    var w = this.pageCssW * this.scale;
    var h = this.pageCssH * this.scale;
    if (w <= sw) this.tx = (sw - w) / 2;
    else this.tx = clamp(this.tx, sw - w, 0);
    if (h <= sh) this.ty = (sh - h) / 2;
    else this.ty = clamp(this.ty, sh - h, 0);
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
    this.applyTransform();
  };

  DrawingViewer.prototype.bumpScale = function (factor) {
    var rect = this.stage.getBoundingClientRect();
    this.zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, this.scale * factor);
    this.schedulePaint();
  };

  DrawingViewer.prototype.paint = async function () {
    if (!this.page || !this.active) return;
    var token = ++this.renderToken;
    var size = { cssW: this.pageCssW, cssH: this.pageCssH };
    var pdfW = this.page.getViewport({ scale: 1 }).width;
    var rs = this.maxRenderScale(size.cssW, size.cssH, pdfW);
    var viewport = this.page.getViewport({ scale: rs });
    var canvas = this.canvas;
    var ctx = canvas.getContext('2d', { alpha: false });
    canvas.width = Math.max(1, Math.round(viewport.width));
    canvas.height = Math.max(1, Math.round(viewport.height));
    canvas.style.width = '100%';
    canvas.style.height = '100%';
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
  };

  DrawingViewer.prototype.schedulePaint = function () {
    var self = this;
    if (this.qualityTimer) clearTimeout(this.qualityTimer);
    this.qualityTimer = setTimeout(function () { self.paint(); }, 160);
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
    if (pts.length >= 2) {
      this.gesture = {
        mode: 'two',
        dist: Math.max(1, dist(pts[0], pts[1])),
        mid: midpoint(pts[0], pts[1]),
        scale: this.scale,
        tx: this.tx,
        ty: this.ty
      };
      return;
    }
    if (pts.length === 1) {
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
    var newScale = clamp(g.scale * (d / g.dist), MIN_SCALE, MAX_SCALE);
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
    var dx = pt.x - g.x;
    var dy = pt.y - g.y;
    if (Math.abs(dx) > TAP_MOVE || Math.abs(dy) > TAP_MOVE) this.moved = true;
    this.tx = g.tx + dx;
    this.ty = g.ty + dy;
    this.applyTransform();
  };

  DrawingViewer.prototype.finishGesture = function (clientX, clientY) {
    this.gesture = null;
    if (!this.moved) {
      var now = Date.now();
      if (now - this.lastTap < DOUBLE_MS && Math.abs(clientX - this.lastTapX) < 28 && Math.abs(clientY - this.lastTapY) < 28) {
        this.lastTap = 0;
        if (this.scale > 1.35) this.fit();
        else this.zoomAt(clientX, clientY, TAP_ZOOM);
        this.schedulePaint();
        this.pokeChrome();
        return;
      }
      this.lastTap = now;
      this.lastTapX = clientX;
      this.lastTapY = clientY;
      this.toggleChrome();
      return;
    }
    this.schedulePaint();
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
    var factor = e.deltaY < 0 ? 1.08 : 0.92;
    this.zoomAt(e.clientX, e.clientY, this.scale * factor);
    this.schedulePaint();
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
        self.applyTransform();
        self.paint();
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
