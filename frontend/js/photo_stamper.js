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
  var actionsLive = document.getElementById('ps-actions-live');
  var actionsReview = document.getElementById('ps-actions-review');
  var useBtn = document.getElementById('ps-use-btn');
  var retakeBtn = document.getElementById('ps-retake-btn');
  var galleryReviewBtn = document.getElementById('ps-gallery-review-btn');
  var galleryInputReview = document.getElementById('ps-gallery-input-review');
  var feedbackEl = document.getElementById('ps-feedback');
  var previewWrap = document.getElementById('ps-preview-wrap');
  var previewImg = document.getElementById('ps-preview-img');

  var overlayProjectEl = document.getElementById('ps-overlay-project');
  var overlayGpsEl = document.getElementById('ps-overlay-gps');
  var overlayTsEl = document.getElementById('ps-overlay-ts');
  var overlayOpEl = document.getElementById('ps-overlay-op');

  var videoEl = document.getElementById('ps-video');
  var canvas = document.getElementById('ps-stamp-canvas');
  var ctx = canvas.getContext('2d');

  var geo = { lat: null, lng: null };
  var pendingBlob = null;
  var pendingFileName = '';
  var previewObjectUrl = null;

  function setFeedback(msg, isError) {
    if (!feedbackEl) return;
    feedbackEl.textContent = msg || '';
    feedbackEl.style.color = isError ? '#ffb4b4' : 'rgba(226, 232, 240, 0.95)';
  }

  function revokePreviewUrl() {
    if (previewObjectUrl) {
      try {
        URL.revokeObjectURL(previewObjectUrl);
      } catch (_) {}
      previewObjectUrl = null;
    }
    if (previewImg) {
      previewImg.removeAttribute('src');
      previewImg.classList.add('d-none');
    }
  }

  function setUiMode(mode) {
    var isReview = mode === 'review';
    if (previewWrap) previewWrap.classList.toggle('ps-preview-wrap--review', isReview);
    if (actionsLive) actionsLive.classList.toggle('d-none', isReview);
    if (actionsReview) actionsReview.classList.toggle('d-none', !isReview);
    if (captureBtn) captureBtn.disabled = isReview;
    if (galleryBtn) galleryBtn.disabled = isReview;
    if (useBtn) useBtn.disabled = !isReview || !pendingBlob;
    if (retakeBtn) retakeBtn.disabled = !isReview;
    if (galleryReviewBtn) galleryReviewBtn.disabled = !isReview;
  }

  function drawStampOnCanvas(targetCtx, cw, ch) {
    var topPad = Math.max(14, Math.round(ch * 0.03));
    var leftPad = Math.max(12, Math.round(cw * 0.03));
    var rightPad = Math.max(12, Math.round(cw * 0.03));

    var topFontSize = Math.max(22, Math.round(ch * 0.042));
    var bottomFontSize = Math.max(22, Math.round(ch * 0.042));

    var projText = 'Project: ' + String(projectName || '—');
    var gpsText = 'GPS: ' + (geo.lat == null || geo.lng == null ? '—' : formatCoords(geo.lat) + ', ' + formatCoords(geo.lng));
    var now = new Date();
    var tsText = formatStampDate(now);
    var opText = 'Operative: ' + String(operativeName || '—');

    function drawRect(x, y, w, h, fill) {
      targetCtx.save();
      targetCtx.fillStyle = fill;
      targetCtx.fillRect(x, y, w, h);
      targetCtx.restore();
    }

    var boxFill = 'rgba(0,0,0,0.28)';
    var textFill = 'rgba(255,255,255,0.92)';

    targetCtx.save();
    targetCtx.font = '700 ' + topFontSize + 'px system-ui, sans-serif';
    targetCtx.textBaseline = 'top';
    targetCtx.fillStyle = textFill;

    var topLines = [projText, gpsText];
    var maxWidth = 0;
    topLines.forEach(function (t) {
      var m = targetCtx.measureText(t);
      maxWidth = Math.max(maxWidth, m.width);
    });

    var rectW = Math.min(maxWidth + leftPad, cw - leftPad - rightPad);
    var rectH = topLines.length * (topFontSize + 8) + 10;
    drawRect(leftPad, topPad, rectW, rectH, boxFill);

    var y = topPad + 10;
    targetCtx.textAlign = 'left';
    topLines.forEach(function (t) {
      targetCtx.fillText(t, leftPad + 10, y);
      y += topFontSize + 8;
    });
    targetCtx.restore();

    targetCtx.save();
    targetCtx.font = '700 ' + bottomFontSize + 'px system-ui, sans-serif';
    targetCtx.fillStyle = textFill;
    targetCtx.textAlign = 'right';

    var bottomLines = [tsText, opText];
    var bMaxW = 0;
    bottomLines.forEach(function (t) {
      var m = targetCtx.measureText(t);
      bMaxW = Math.max(bMaxW, m.width);
    });
    var bRectW = Math.min(bMaxW + 26, cw - leftPad - rightPad);
    var bRectH = bottomLines.length * (bottomFontSize + 8) + 10;
    var bX = cw - rightPad - bRectW;
    var bY = ch - topPad - bRectH;
    drawRect(bX, bY, bRectW, bRectH, boxFill);

    var yy = bY + 10;
    bottomLines.forEach(function (t) {
      targetCtx.textBaseline = 'top';
      targetCtx.fillText(t, cw - rightPad - 10, yy);
      yy += bottomFontSize + 8;
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
      videoEl.__ps_stream = stream;
    } catch (err) {
      setFeedback('Could not access camera. Choose from gallery.', true);
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
      if (videoEl) {
        videoEl.srcObject = null;
        videoEl.__ps_stream = null;
      }
    } catch (_) {}
  }

  function captureFrameFromVideo() {
    if (!videoEl || !videoEl.videoWidth || !videoEl.videoHeight) {
      return Promise.reject(new Error('Video not ready'));
    }

    var vw = videoEl.videoWidth;
    var vh = videoEl.videoHeight;
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

  function enterReviewWithBlob(blob) {
    pendingBlob = blob;
    pendingFileName = 'stamped_' + Date.now() + '.jpg';
    stopCamera();
    revokePreviewUrl();
    previewObjectUrl = URL.createObjectURL(blob);
    if (previewImg) {
      previewImg.src = previewObjectUrl;
      previewImg.classList.remove('d-none');
    }
    setUiMode('review');
    setFeedback('', false);
    if (useBtn) useBtn.disabled = !pendingBlob;
  }

  function leaveReviewAndRetake() {
    pendingBlob = null;
    pendingFileName = '';
    revokePreviewUrl();
    setUiMode('live');
    setFeedback('', false);
    if (galleryInput) galleryInput.value = '';
    if (galleryInputReview) galleryInputReview.value = '';
    startCamera().catch(function () {});
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

  if (overlayProjectEl) overlayProjectEl.textContent = 'Project: ' + String(projectName || '—');
  if (overlayOpEl) overlayOpEl.textContent = 'Operative: ' + String(operativeName || '—');
  updateOverlay();

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

  setInterval(function () {
    if (previewWrap && !previewWrap.classList.contains('ps-preview-wrap--review') && overlayTsEl) {
      overlayTsEl.textContent = formatStampDate(new Date());
    }
  }, 1000);

  setUiMode('live');

  if (captureBtn) {
    captureBtn.addEventListener('click', function () {
      if (!requestId) {
        setFeedback('Invalid request.', true);
        return;
      }
      captureBtn.disabled = true;
      if (galleryBtn) galleryBtn.disabled = true;
      setFeedback('Capturing…', false);

      captureFrameFromVideo()
        .then(function (blob) {
          enterReviewWithBlob(blob);
        })
        .catch(function (err) {
          setFeedback(err && err.message ? err.message : 'Capture failed.', true);
        })
        .finally(function () {
          if (!previewWrap || !previewWrap.classList.contains('ps-preview-wrap--review')) {
            captureBtn.disabled = false;
            if (galleryBtn) galleryBtn.disabled = false;
          }
        });
    });
  }

  function wireGalleryInput(inputEl) {
    if (!inputEl) return;
    inputEl.addEventListener('change', function () {
      var f = inputEl.files && inputEl.files[0] ? inputEl.files[0] : null;
      if (!f) return;
      if (!requestId) {
        setFeedback('Invalid request.', true);
        return;
      }
      if (captureBtn) captureBtn.disabled = true;
      if (galleryBtn) galleryBtn.disabled = true;
      if (retakeBtn) retakeBtn.disabled = true;
      if (galleryReviewBtn) galleryReviewBtn.disabled = true;
      setFeedback('Stamping photo…', false);

      drawStampOnImageFile(f)
        .then(function (blob) {
          enterReviewWithBlob(blob);
        })
        .catch(function (err) {
          setFeedback(err && err.message ? err.message : 'Stamping failed.', true);
        })
        .finally(function () {
          try {
            inputEl.value = '';
          } catch (_) {}
          if (!previewWrap || !previewWrap.classList.contains('ps-preview-wrap--review')) {
            if (captureBtn) captureBtn.disabled = false;
            if (galleryBtn) galleryBtn.disabled = false;
          } else {
            if (retakeBtn) retakeBtn.disabled = false;
            if (galleryReviewBtn) galleryReviewBtn.disabled = false;
          }
        });
    });
  }

  if (galleryBtn && galleryInput) {
    galleryBtn.addEventListener('click', function () {
      try {
        galleryInput.click();
      } catch (_) {}
    });
    wireGalleryInput(galleryInput);
  }

  if (galleryReviewBtn && galleryInputReview) {
    galleryReviewBtn.addEventListener('click', function () {
      try {
        galleryInputReview.click();
      } catch (_) {}
    });
    wireGalleryInput(galleryInputReview);
  }

  if (useBtn) {
    useBtn.addEventListener('click', function () {
      if (!requestId || !pendingBlob) return;
      useBtn.disabled = true;
      setFeedback('Sending…', false);
      sendToOpener({
        type: 'PROCONIX_STAMPED_PHOTO',
        requestId: requestId,
        fileName: pendingFileName || 'stamped_' + Date.now() + '.jpg',
        blob: pendingBlob,
      });
      stopCamera();
      revokePreviewUrl();
      setTimeout(function () {
        try {
          window.close();
        } catch (_) {}
      }, 200);
    });
  }

  if (retakeBtn) {
    retakeBtn.addEventListener('click', function () {
      leaveReviewAndRetake();
      if (captureBtn) captureBtn.disabled = false;
      if (galleryBtn) galleryBtn.disabled = false;
    });
  }

  if (cancelBtn) {
    cancelBtn.addEventListener('click', function () {
      try {
        sendToOpener({ type: 'PROCONIX_STAMPED_PHOTO_CANCEL', requestId: requestId });
      } catch (_) {}
      stopCamera();
      revokePreviewUrl();
      pendingBlob = null;
      setTimeout(function () {
        try {
          window.close();
        } catch (_) {}
      }, 50);
    });
  }

  startCamera().catch(function () {});
})();
