// three.js viewer for OpenSCAD output. OpenSCAD is Z-up, so the scene is too.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

THREE.Object3D.DEFAULT_UP.set(0, 0, 1);

export class Viewer {
  constructor(container, { interactive = true, background = null } = {}) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: !interactive });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    if (background) this.scene.background = new THREE.Color(background);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.55;

    this.camera = new THREE.PerspectiveCamera(35, 1, 0.1, 5000);
    this.camera.position.set(60, -90, 70);

    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(40, -60, 120);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.bias = -0.0005;
    key.shadow.radius = 6;
    this.key = key;
    this.scene.add(key, key.target);
    this.scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x2a2018, 0.6));

    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShadowMaterial({ opacity: 0.28 }));
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);

    this.grid = new THREE.Group();
    this.scene.add(this.grid);

    this.material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.42,
      metalness: 0.05,
      side: THREE.DoubleSide,
    });
    this.edgesMaterial = new THREE.LineBasicMaterial({ color: 0x0b0d12, transparent: true, opacity: 0.35 });

    this.mesh = null;
    this.edges = null;
    this.colorOverride = null;
    this.showEdges = false;

    if (interactive) {
      this.controls = new OrbitControls(this.camera, this.renderer.domElement);
      this.controls.enableDamping = true;
      this.controls.dampingFactor = 0.08;
      this.controls.screenSpacePanning = true;
      this.controls.addEventListener('change', () => this.requestRender());
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(container);
    }
    this.resize();
  }

  resize(w = this.container.clientWidth, h = this.container.clientHeight) {
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.requestRender();
  }

  requestRender() {
    if (this._raf) return;
    this._raf = requestAnimationFrame(() => {
      this._raf = null;
      const moving = this.controls?.update();
      this.renderer.render(this.scene, this.camera);
      if (moving) this.requestRender();
    });
  }

  renderNow() {
    this.controls?.update();
    this.renderer.render(this.scene, this.camera);
  }

  setGeometry(geometry, { fit = false } = {}) {
    const firstLoad = !this.mesh;
    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.mesh.geometry.dispose();
    }
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.scene.add(this.mesh);
    this.originalColors = geometry.getAttribute('color').array.slice();
    this.applyColor();
    this.updateEdges();
    this.updateStage();
    // Re-frame on first load, or when the model grew/shrank a lot
    const extent = geometry.boundingBox.getSize(new THREE.Vector3()).length();
    const ratio = this.fittedExtent ? extent / this.fittedExtent : 0;
    if (fit || firstLoad || ratio > 1.35 || ratio < 0.55) this.fit();
    this.requestRender();
  }

  // Single filament color, or null to use the colors from color() in the file
  setColor(hex) {
    this.colorOverride = hex;
    this.applyColor();
    this.requestRender();
  }

  applyColor() {
    if (!this.mesh) return;
    const attr = this.mesh.geometry.getAttribute('color');
    if (this.colorOverride) {
      const c = new THREE.Color(this.colorOverride);
      for (let i = 0; i < attr.count; i++) attr.setXYZ(i, c.r, c.g, c.b);
    } else {
      attr.array.set(this.originalColors);
    }
    attr.needsUpdate = true;
  }

  setEdges(on) {
    this.showEdges = on;
    this.updateEdges();
    this.requestRender();
  }

  updateEdges() {
    if (this.edges) {
      this.scene.remove(this.edges);
      this.edges.geometry.dispose();
      this.edges = null;
    }
    if (!this.showEdges || !this.mesh) return;
    this.edges = new THREE.LineSegments(new THREE.EdgesGeometry(this.mesh.geometry, 25), this.edgesMaterial);
    this.scene.add(this.edges);
  }

  // Ground, grid and light follow the model's footprint
  updateStage() {
    const box = this.mesh.geometry.boundingBox;
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const extent = Math.max(size.x, size.y, 20);
    const cell = extent > 150 ? 10 : extent > 40 ? 5 : 2;
    const half = Math.ceil((extent * 1.4) / cell / 2) * cell * 2;

    this.ground.position.set(center.x, center.y, box.min.z - 0.01);
    this.ground.scale.set(half * 4, half * 4, 1);

    this.grid.clear();
    const gridColor = getComputedStyle(document.documentElement).getPropertyValue('--grid').trim() || '#2a2f3a';
    const fine = new THREE.GridHelper(half * 2, (half * 2) / cell, gridColor, gridColor);
    fine.material.transparent = true;
    fine.material.opacity = 0.5;
    const major = new THREE.GridHelper(half * 2, (half * 2) / (cell * 5), gridColor, gridColor);
    major.material.transparent = true;
    major.material.opacity = 0.9;
    for (const g of [fine, major]) {
      g.rotation.x = Math.PI / 2;
      g.position.set(Math.round(center.x / cell) * cell, Math.round(center.y / cell) * cell, box.min.z - 0.02);
      this.grid.add(g);
    }

    const r = Math.max(size.length(), 20);
    this.key.position.set(center.x + r * 0.6, center.y - r * 0.9, box.max.z + r * 1.6);
    this.key.target.position.copy(center);
    const cam = this.key.shadow.camera;
    cam.left = cam.bottom = -r;
    cam.right = cam.top = r;
    cam.near = 0.1;
    cam.far = r * 6;
    cam.updateProjectionMatrix();
  }

  fit() {
    if (!this.mesh) return;
    const box = this.mesh.geometry.boundingBox;
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    this.fittedExtent = box.getSize(new THREE.Vector3()).length();
    const dist = sphere.radius / Math.sin(THREE.MathUtils.degToRad(this.camera.fov / 2)) * 1.05;
    const dir = new THREE.Vector3(0.45, -0.8, 0.75).normalize();
    this.camera.position.copy(sphere.center).addScaledVector(dir, dist);
    this.camera.near = dist / 100;
    this.camera.far = dist * 20;
    this.camera.updateProjectionMatrix();
    if (this.controls) {
      this.controls.target.copy(sphere.center);
      this.controls.update();
    } else {
      this.camera.lookAt(sphere.center);
    }
    this.requestRender();
  }

  view(name) {
    if (!this.mesh) return;
    const dirs = { iso: [0.45, -0.8, 0.75], top: [0, -0.0001, 1], front: [0, -1, 0.0001], right: [1, 0, 0.0001] };
    const box = this.mesh.geometry.boundingBox;
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const dist = this.camera.position.distanceTo(this.controls.target);
    const dir = new THREE.Vector3(...dirs[name]).normalize();
    this.controls.target.copy(sphere.center);
    this.camera.position.copy(sphere.center).addScaledVector(dir, dist);
    this.controls.update();
    this.requestRender();
  }

  snapshot(w, h) {
    this.resize(w, h);
    this.renderNow();
    return this.renderer.domElement.toDataURL('image/webp', 0.85);
  }

  dispose() {
    this.resizeObserver?.disconnect();
    this.controls?.dispose();
    this.mesh?.geometry.dispose();
    this.edges?.geometry.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
