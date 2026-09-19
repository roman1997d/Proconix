import * as THREE from 'three';

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const canvas = document.getElementById('chip-canvas');
const fallback = document.getElementById('chip-fallback');
const nav = document.querySelector('.nav');
const leds = document.querySelector('.chip-leds');
if (leds && !leds.dataset.ready) {
  leds.dataset.ready = '1';
  const count = 28;
  for (let i = 0; i < count; i++) {
    const dot = document.createElement('i');
    const t = (i / count) * Math.PI * 2;
    dot.style.cssText = [
      'position:absolute',
      'width:5px',
      'height:5px',
      'border-radius:50%',
      'background:#e8f0ff',
      'box-shadow:0 0 8px #4d8cff',
      `left:calc(50% + ${Math.cos(t) * 46}% - 2px)`,
      `top:calc(50% + ${Math.sin(t) * 46}% - 2px)`,
    ].join(';');
    leds.appendChild(dot);
  }
}

function markReady() {
  if (fallback) fallback.classList.add('is-hidden');
}

function roundedBox(width, height, depth, radius) {
  const shape = new THREE.Shape();
  const x = -width / 2;
  const y = -depth / 2;
  shape.moveTo(x + radius, y);
  shape.lineTo(x + width - radius, y);
  shape.quadraticCurveTo(x + width, y, x + width, y + radius);
  shape.lineTo(x + width, y + depth - radius);
  shape.quadraticCurveTo(x + width, y + depth, x + width - radius, y + depth);
  shape.lineTo(x + radius, y + depth);
  shape.quadraticCurveTo(x, y + depth, x, y + depth - radius);
  shape.lineTo(x, y + radius);
  shape.quadraticCurveTo(x, y, x + radius, y);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: height,
    bevelEnabled: true,
    bevelThickness: 0.03,
    bevelSize: 0.03,
    bevelSegments: 2,
    curveSegments: 10,
  });
  geo.rotateX(-Math.PI / 2);
  geo.center();
  return geo;
}

function makeMarkTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 512, 512);
  g.strokeStyle = '#f4f7fb';
  g.lineWidth = 22;
  g.lineJoin = 'round';
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(156, 340);
  g.lineTo(256, 168);
  g.lineTo(356, 340);
  g.stroke();
  g.beginPath();
  g.moveTo(196, 340);
  g.lineTo(256, 236);
  g.lineTo(316, 340);
  g.stroke();
  return new THREE.CanvasTexture(c);
}

function bootScene() {
  if (!canvas || reduced) return false;

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 40);
  camera.position.set(0.2, 1.72, 4.45);
  camera.lookAt(0, 0.04, 0);

  scene.add(new THREE.AmbientLight(0x1a2744, 0.35));
  scene.add(new THREE.HemisphereLight(0x4d8cff, 0x000000, 0.55));

  const key = new THREE.SpotLight(0x4d8cff, 48, 18, 0.7, 0.45, 1.1);
  key.position.set(-2.2, 3.2, 2.6);
  key.target.position.set(0, 0, 0);
  scene.add(key);
  scene.add(key.target);

  const rim = new THREE.PointLight(0x60a5ff, 70, 14, 1.4);
  rim.position.set(2.6, 0.35, 1.8);
  scene.add(rim);

  const under = new THREE.PointLight(0x1a6dff, 90, 12, 1.15);
  under.position.set(0.15, -0.85, 0.35);
  scene.add(under);

  const edge = new THREE.PointLight(0xffffff, 12, 6, 2);
  edge.position.set(-1.4, 0.8, 1.6);
  scene.add(edge);

  const group = new THREE.Group();
  scene.add(group);

  const body = new THREE.Mesh(
    roundedBox(2.2, 0.16, 2.2, 0.22),
    new THREE.MeshStandardMaterial({
      color: 0x0a0a10,
      metalness: 0.92,
      roughness: 0.22,
    })
  );
  group.add(body);

  const plate = new THREE.Mesh(
    roundedBox(1.92, 0.02, 1.92, 0.18),
    new THREE.MeshStandardMaterial({
      color: 0x050508,
      metalness: 0.72,
      roughness: 0.36,
    })
  );
  plate.position.y = 0.09;
  group.add(plate);

  const mark = new THREE.Mesh(
    new THREE.PlaneGeometry(1.05, 1.05),
    new THREE.MeshBasicMaterial({
      map: makeMarkTexture(),
      transparent: true,
    })
  );
  mark.rotation.x = -Math.PI / 2;
  mark.position.y = 0.145;
  mark.scale.setScalar(1.15);
  group.add(mark);

  const ledGeo = new THREE.SphereGeometry(0.028, 10, 10);
  const ledMat = new THREE.MeshStandardMaterial({
    color: 0xe8f0ff,
    emissive: 0xb7ccff,
    emissiveIntensity: 1.6,
    roughness: 0.25,
    metalness: 0.1,
  });
  const inset = 0.92;
  const step = 0.26;
  for (let x = -inset; x <= inset + 0.001; x += step) {
    for (const z of [-inset, inset]) {
      const led = new THREE.Mesh(ledGeo, ledMat);
      led.position.set(x, 0.14, z);
      group.add(led);
    }
  }
  for (let z = -inset + step; z < inset; z += step) {
    for (const x of [-inset, inset]) {
      const led = new THREE.Mesh(ledGeo, ledMat);
      led.position.set(x, 0.14, z);
      group.add(led);
    }
  }

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(5.4, 80),
    new THREE.MeshStandardMaterial({
      color: 0x000000,
      metalness: 0.92,
      roughness: 0.18,
    })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.55;
  scene.add(floor);

  const bloom = new THREE.Mesh(
    new THREE.CircleGeometry(1.7, 48),
    new THREE.MeshBasicMaterial({
      color: 0x1a6dff,
      transparent: true,
      opacity: 0.32,
    })
  );
  bloom.rotation.x = -Math.PI / 2;
  bloom.position.y = -0.54;
  scene.add(bloom);

  group.scale.setScalar(0.84);
  group.rotation.set(0.22, 0.62, 0.04);

  const pointer = { x: 0, y: 0 };
  window.addEventListener('pointermove', (event) => {
    pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
    pointer.y = (event.clientY / window.innerHeight) * 2 - 1;
  }, { passive: true });

  function resize() {
    const wrap = canvas.parentElement;
    const w = wrap.clientWidth;
    const h = wrap.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(h, 1);
    camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener('resize', resize);

  let visible = true;
  const io = new IntersectionObserver((entries) => {
    visible = entries.some((entry) => entry.isIntersecting);
  }, { threshold: 0.05 });
  io.observe(canvas);

  const clock = new THREE.Clock();
  function tick() {
    const t = clock.getElapsedTime();
    if (visible) {
      group.rotation.y = 0.55 + pointer.x * 0.28 + t * 0.08;
      group.rotation.x = 0.18 + pointer.y * 0.12;
      group.position.y = Math.sin(t * 0.7) * 0.05;
      bloom.material.opacity = 0.14 + Math.sin(t * 1.3) * 0.04;
      renderer.render(scene, camera);
    }
    requestAnimationFrame(tick);
  }
  tick();
  markReady();
  return true;
}

try {
  if (!bootScene() && fallback) fallback.classList.remove('is-hidden');
} catch (err) {
  if (fallback) fallback.classList.remove('is-hidden');
}

window.addEventListener('scroll', () => {
  if (nav) nav.classList.toggle('is-on', window.scrollY > 8);
}, { passive: true });

document.querySelectorAll('[data-tilt]').forEach((node) => {
  const phone = node.querySelector('.phone');
  if (!phone || reduced) return;
  node.addEventListener('pointermove', (event) => {
    const box = node.getBoundingClientRect();
    const x = (event.clientX - box.left) / box.width - 0.5;
    const y = (event.clientY - box.top) / box.height - 0.5;
    const dir = node.closest('.reverse') ? 1 : -1;
    phone.style.transform = `rotateY(${dir * 16 + x * 10}deg) rotateX(${6 - y * 8}deg)`;
  });
  node.addEventListener('pointerleave', () => {
    phone.style.transform = '';
  });
});
