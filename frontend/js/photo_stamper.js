(function () {
  'use strict';

  function getParam(name) {
    try {
      return new URLSearchParams(window.location.search).get(name);
    } catch (_) {
      return null;
    }
  }

  function formatCoords(v) {
    var n = Number(v);
    if (!isFinite(n)) return '—';
    return n.toFixed(6);
  }

  function formatStampDate(d) {
    try {
      // en-GB looks close to the example "11 May 2026, 19:49:27"
      return d.toLocaleString('en-GB', {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch (_) {
      return d.toISOString();
    }
  }

  var requestId = getParam('requestId') || '';
  var projectName = getParam('project') || '—';
  var operativeName = getParam('operative') || '—';

  var cancelBtn = document.getElementById('ps-cancel-btn');
  var captureBtn = document.getElementById('ps-capture-btn');
  var galleryBtn = document.getElementById('ps-gallery-btn');
  var galleryInput = document.getElementById('ps-gallery-input');
  var feedbackEl = document.getElementById('ps-feedback');

  var overlayProjectEl = document.getElementById('ps-overlay-project');
  var overlayGpsEl = document.getElementById('ps-overlay-gps');
  var overlayTsEl = document.getElementById('ps-overlay-ts');
  var overlayOpEl = document.getElementById('ps-overlay-op');

  var videoEl = document.getElementById('ps-video');
  var canvas = document.getElementById('ps-stamp-canvas');
  var ctx = canvas.getContext('2d');

  var geo = { lat: null, lng: null };

  function setFeedback(msg, isError) {
    if (!feedbackEl) return;
    feedbackEl.textContent = msg || '';
    feedbackEl.style.color = isError ? '#ffb4b4' : '#e5e7eb';
  }

  function drawStampOnCanvas(targetCtx, cw, ch) {
    // Top overlay (project + GPS)
    var topPad = Math.max(14, Math.round(ch * 0.03));
    var leftPad = Math.max(12, Math.round(cw * 0.03));
    var rightPad = Math.max(12, Math.round(cw * 0.03));

    var topFontSize = Math.max(16, Math.round(ch * 0.028));
    var bottomFontSize = Math.max(16, Math.round(ch * 0.028));

    var projText = 'Project: ' + String(projectName || '—');
    var gpsText = 'GPS: ' + (geo.lat == null || geo.lng == null ? '—' : formatCoords(geo.lat) + ', ' + formatCoords(geo.lng));
    var now = new Date();
    var tsText = formatStampDate(now);
    var opText = 'Operative: ' + String(operativeName || '—');

    // Semi-transparent rectangles for readability
    function drawRect(x, y, w, h, fill) {
      targetCtx.save();
      targetCtx.fillStyle = fill;
      targetCtx.fillRect(x, y, w, h);
      targetCtx.restore();
    }

    targetCtx.save();
    targetCtx.font = '700 ' + topFontSize + 'px system-ui, sans-serif';
    targetCtx.textBaseline = 'top';
    targetCtx.fillStyle = '#e5e7eb';

    // Measure and background for top block
    var topLines = [projText, gpsText];
    var maxWidth = 0;
    topLines.forEach(function (t) {
      var m = targetCtx.measureText(t);
      maxWidth = Math.max(maxWidth, m.width);
    });

    var rectW = Math.min(maxWidth + leftPad, cw - leftPad - rightPad);
    var rectH = topLines.length * (topFontSize + 6) + 8;
    drawRect(leftPad, topPad, rectW, rectH, 'rgba(0,0,0,0.45)');

    // Draw top lines
    var y = topPad + 8;
    targetCtx.textAlign = 'left';
    topLines.forEach(function (t) {
      targetCtx.fillText(t, leftPad + 8, y);
      y += topFontSize + 6;
    });
    targetCtx.restore();

    // Bottom-right overlay (timestamp + operative)
    targetCtx.save();
    targetCtx.font = '700 ' + bottomFontSize + 'px system-ui, sans-serif';
    targetCtx.textBaseline = 'bottom';
    targetCtx.fillStyle = '#e5e7eb';
    targetCtx.textAlign = 'right';

    var bottomLines = [tsText, opText];
    var bMaxW = 0;
    bottomLines.forEach(function (t) {
      var m = targetCtx.measureText(t);
      bMaxW = Math.max(bMaxW, m.width);
    });
    var bRectW = Math.min(bMaxW + 22, cw - leftPad - rightPad);
    var bRectH = bottomLines.length * (bottomFontSize + 6) + 8;
    var bX = cw - rightPad - bRectW;
    var bY = ch - topPad - bRectH;
    drawRect(bX, bY, bRectW, bRectH, 'rgba(0,0,0,0.45)');

    // Draw bottom lines
    var yy = ch - (bRectH - 8);
    bottomLines.forEach(function (t) {
      targetCtx.textBaseline = 'top';
      targetCtx.fillText(t, cw - rightPad - 8, yy + 6);
      yy += bottomFontSize + 6;
    });
    targetCtx.restore();
  }

  function sendToOpener(payload) {
    try {
      if (window.opener && typeof window.opener.postMessage === 'function') {
        window.opener.postMessage(payload, window.location.origin);
      }
    } catch (_) {
      /* ignore */
    }
  }

  async function startCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setFeedback('Camera is not available.', true);
      return;
    }
    try {
      var stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
      videoEl.srcObject = stream;
      await videoEl.play();

      // Stop tracks after capture to release camera
      videoEl.__ps_stream = stream;
    } catch (err) {
      setFeedback('Could not access camera. Use an existing photo instead.', true);
    }
  }

  function stopCamera() {
    try {
      var st = videoEl && videoEl.__ps_stream;
      if (st && typeof st.getTracks === 'function') {
        st.getTracks().forEach(function (t) {
          try {
            t.stop();
          } catch (_) {}
        });
      }
    } catch (_) {}
  }

  function captureFrameFromVideo() {
    if (!videoEl || !videoEl.videoWidth || !videoEl.videoHeight) {
      return Promise.reject(new Error('Video not ready'));
    }

    var vw = videoEl.videoWidth;
    var vh = videoEl.videoHeight;
    // Downscale for size (keeps stamps readable, reduces postMessage payload)
    var maxW = 1600;
    var scale = Math.min(1, maxW / vw);
    var cw = Math.max(1, Math.round(vw * scale));
    var ch = Math.max(1, Math.round(vh * scale));
    canvas.width = cw;
    canvas.height = ch;

    ctx.clearRect(0, 0, cw, ch);
    ctx.drawImage(videoEl, 0, 0, cw, ch);
    drawStampOnCanvas(ctx, cw, ch);

    return new Promise(function (resolve, reject) {
      canvas.toBlob(
        function (blob) {
          if (!blob) return reject(new Error('Could not render stamped image'));
          resolve(blob);
        },
        'image/jpeg',
        0.9
      );
    });
  }

  function drawStampOnImageFile(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onerror = function () {
        reject(new Error('Could not read image'));
      };
      reader.onload = function () {
        var dataUrl = reader.result;
        var img = new Image();
        img.onload = function () {
          var iw = img.naturalWidth || img.width;
          var ih = img.naturalHeight || img.height;
          var maxW = 1600;
          var scale = Math.min(1, maxW / iw);
          var cw = Math.max(1, Math.round(iw * scale));
          var ch = Math.max(1, Math.round(ih * scale));
          canvas.width = cw;
          canvas.height = ch;
          ctx.clearRect(0, 0, cw, ch);
          ctx.drawImage(img, 0, 0, cw, ch);
          drawStampOnCanvas(ctx, cw, ch);
          canvas.toBlob(
            function (blob) {
              if (!blob) return reject(new Error('Could not render stamped image'));
              resolve(blob);
            },
            'image/jpeg',
            0.9
          );
        };
        img.onerror = function () {
          reject(new Error('Could not decode image'));
        };
        img.src = dataUrl;
      };
      reader.readAsDataURL(file);
    });
  }

  function updateOverlay() {
    if (overlayProjectEl) overlayProjectEl.textContent = 'Project: ' + String(projectName || '—');
    if (overlayOpEl) overlayOpEl.textContent = 'Operative: ' + String(operativeName || '—');
    if (overlayTsEl) overlayTsEl.textContent = formatStampDate(new Date());
    if (overlayGpsEl) {
      overlayGpsEl.textContent =
        'GPS: ' + (geo.lat == null || geo.lng == null ? '—' : formatCoords(geo.lat) + ', ' + formatCoords(geo.lng));
    }
  }

  // Init overlay
  if (overlayProjectEl) overlayProjectEl.textContent = 'Project: ' + String(projectName || '—');
  if (overlayOpEl) overlayOpEl.textContent = 'Operative: ' + String(operativeName || '—');
  updateOverlay();

  // Geolocation
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      function (pos) {
        geo.lat = pos.coords.latitude;
        geo.lng = pos.coords.longitude;
        updateOverlay();
      },
      function () {
        updateOverlay();
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }

  if (captureBtn) {
    captureBtn.addEventListener('click', function () {
      if (!requestId) {
        setFeedback('Invalid request.', true);
        return;
      }
      captureBtn.disabled = true;
      setFeedback('Capturing...', false);

      captureFrameFromVideo()
        .then(function (blob) {
          stopCamera();
          setFeedback('Sending...', false);
          var fileName = 'stamped_' + Date.now() + '.jpg';
          sendToOpener({ type: 'PROCONIX_STAMPED_PHOTO', requestId: requestId, fileName: fileName, blob: blob });
          setTimeout(function () {
            try {
              window.close();
            } catch (_) {}
          }, 200);
        })
        .catch(function (err) {
          captureBtn.disabled = false;
          setFeedback(err && err.message ? err.message : 'Capture failed.', true);
        });
    });
  }

  if (galleryBtn && galleryInput) {
    galleryBtn.addEventListener('click', function () {
      try {
        galleryInput.click();
      } catch (_) {}
    });
    galleryInput.addEventListener('change', function () {
      var f = galleryInput.files && galleryInput.files[0] ? galleryInput.files[0] : null;
      if (!f) return;
      captureBtn.disabled = true;
      galleryBtn.disabled = true;
      setFeedback('Stamping photo...', false);

      drawStampOnImageFile(f)
        .then(function (blob) {
          stopCamera();
          setFeedback('Sending...', false);
          var fileName = 'stamped_' + Date.now() + '.jpg';
          sendToOpener({ type: 'PROCONIX_STAMPED_PHOTO', requestId: requestId, fileName: fileName, blob: blob });
          setTimeout(function () {
            try {
              window.close();
            } catch (_) {}
          }, 200);
        })
        .catch(function (err) {
          captureBtn.disabled = false;
          galleryBtn.disabled = false;
          setFeedback(err && err.message ? err.message : 'Stamping failed.', true);
        });
    });
  }

  if (cancelBtn) {
    cancelBtn.addEventListener('click', function () {
      try {
        sendToOpener({ type: 'PROCONIX_STAMPED_PHOTO_CANCEL', requestId: requestId });
      } catch (_) {}
      stopCamera();
      setTimeout(function () {
        try {
          window.close();
        } catch (_) {}
      }, 50);
    });
  }

  // Start camera at end (so UI is already visible)
  startCamera().catch(function () {});
})();

