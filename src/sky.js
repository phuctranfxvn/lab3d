// Decorative sky behind the home page: drifting clouds and things flying past
// under a spinning bamboo-copter. Images dropped into /flyers fly instead of
// the built-in bell and cube.

// A file name containing "left" or "trai" marks a picture facing left
const flyerImages = Object.entries(
  import.meta.glob('/flyers/*.{png,jpg,jpeg,webp,gif,svg,PNG,JPG,JPEG,WEBP,GIF,SVG}', { query: '?url', import: 'default', eager: true }),
).map(([path, url]) => ({ url, facesLeft: /left|trai/i.test(path.split('/').pop()) }));

const INK = 'var(--ink)';

const copter = `<svg class="copter" viewBox="0 0 80 34" aria-hidden="true">
  <g class="blades"><ellipse cx="40" cy="7" rx="36" ry="5" fill="#ffc928" stroke="${INK}" stroke-width="2.5"/></g>
  <rect x="37" y="7" width="6" height="22" rx="3" fill="#f08c2e" stroke="${INK}" stroke-width="2.5"/>
  <circle cx="40" cy="7" r="4" fill="#e8312f" stroke="${INK}" stroke-width="2"/>
</svg>`;

const payloads = [
  // bell
  `<svg viewBox="2 4 28 27" aria-hidden="true"><path d="M3.5 6.5 Q16 13 28.5 6.5 L28.5 10.5 Q16 17 3.5 10.5Z" fill="#e8312f" stroke="#0f3557" stroke-width="1.6" stroke-linejoin="round"/><circle cx="16" cy="20.5" r="9" fill="#ffc928" stroke="#0f3557" stroke-width="1.8"/><path d="M7.6 17.2 Q16 20 24.4 17.2M7.3 19.6 Q16 22.4 24.7 19.6" stroke="#0f3557" stroke-width="1.5" fill="none" stroke-linecap="round"/><circle cx="16" cy="24" r="1.7" fill="#0f3557"/><path d="M16 25.2V28.6" stroke="#0f3557" stroke-width="1.6" stroke-linecap="round"/></svg>`,
  // printed cube
  `<svg viewBox="0 0 84 88" aria-hidden="true"><path d="M42 6 78 24v40L42 82 6 64V24z" fill="#1ea0e6" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/><path d="M42 44 78 24M42 44 6 24M42 44v38" stroke="${INK}" stroke-width="5" fill="none" stroke-linejoin="round"/><path d="M42 6 78 24 42 44 6 24z" fill="#fff" opacity=".4"/></svg>`,
];

const cloud = `<svg viewBox="0 0 200 90" aria-hidden="true"><path d="M40 78h120a28 28 0 0 0 4-55.7A38 38 0 0 0 92 18a30 30 0 0 0-52 14 24 24 0 0 0 0 46z" fill="var(--cloud)"/></svg>`;

// Flight lanes: vertical position (vh), size (px), duration (s), delay (s)
const LANES = [
  { top: 30, size: 160, dur: 26, delay: -4 },
  { top: 55, size: 130, dur: 34, delay: -20 },
  { top: 76, size: 145, dur: 30, delay: -12 },
];

export function createSky() {
  const sky = document.createElement('div');
  sky.className = 'sky';
  sky.setAttribute('aria-hidden', 'true');

  const clouds = [
    { top: 10, w: 220, dur: 90, delay: -10 },
    { top: 38, w: 160, dur: 120, delay: -70 },
    { top: 64, w: 260, dur: 100, delay: -40 },
    { top: 86, w: 180, dur: 140, delay: -100 },
  ];
  for (const c of clouds) {
    const el = document.createElement('div');
    el.className = 'cloud';
    el.style.cssText = `top:${c.top}vh;width:${c.w}px;animation-duration:${c.dur}s;animation-delay:${c.delay}s`;
    el.innerHTML = cloud;
    sky.append(el);
  }

  if (flyerImages.length) {
    // User pictures fly past together as one group, slightly staggered.
    // Each picture is expected to show its own bamboo-copter.
    // Fly the way the pictures face; mirror any that face the other way
    const leftward = flyerImages.every((f) => f.facesLeft);
    const flyer = document.createElement('div');
    flyer.className = `flyer group${leftward ? ' leftward' : ''}`;
    flyer.style.cssText = 'top:40vh;animation-duration:28s;animation-delay:-6s;--size:220px';
    flyerImages.forEach(({ url, facesLeft }, i) => {
      const bob = document.createElement('div');
      bob.className = 'flyer-bob';
      bob.style.cssText = `animation-delay:${-i * 0.9}s;margin-top:${(i % 2) * 46}px`;
      const img = document.createElement('img');
      img.src = url;
      img.alt = '';
      img.className = `flyer-img${facesLeft !== leftward ? ' mirrored' : ''}`;
      bob.append(img);
      flyer.append(bob);
    });
    sky.append(flyer);
    return sky;
  }

  LANES.forEach((lane, i) => {
    const flyer = document.createElement('div');
    flyer.className = 'flyer';
    flyer.style.cssText = `top:${lane.top}vh;animation-duration:${lane.dur}s;animation-delay:${lane.delay}s;--size:${lane.size}px`;
    const bob = document.createElement('div');
    bob.className = 'flyer-bob';
    bob.style.animationDelay = `${-i * 0.7}s`;
    bob.innerHTML = copter + `<div class="payload">${payloads[i % payloads.length]}</div>`;
    flyer.append(bob);
    sky.append(flyer);
  });

  return sky;
}
