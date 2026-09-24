/* ═══════════════════════════════════════════════════════════════
   VPN Pro+  —  3-D Wireframe Globe  (three.js)
   Animated rotating globe with dotted wireframe + flying arcs
   ═══════════════════════════════════════════════════════════════ */

// THREE is loaded globally via three-shim.js → three.cjs → three-post.js

let _globe = null;

(function () {

  class GlobeScene {
    constructor(canvas) {
      this.canvas = canvas;
      this.arcs = [];
      this.state = 'idle'; // idle | connecting | connected
      this.targetArcCount = 0;
      this.animationId = null;
      this.time = 0;
      this.init();
    }

    init() {
      const rect = this.canvas.parentElement.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      const dpr = Math.min(window.devicePixelRatio, 2);

      // Scene
      this.scene = new THREE.Scene();

      // Camera
      this.camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100);
      this.camera.position.set(0, 0, 3.2);

      // Renderer
      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        antialias: true,
        alpha: true
      });
      this.renderer.setSize(w, h);
      this.renderer.setPixelRatio(dpr);
      this.renderer.setClearColor(0x000000, 0);

      // Globe group
      this.globeGroup = new THREE.Group();
      this.scene.add(this.globeGroup);

      this._buildGlobe();
      this._buildAtmosphere();

      // Arc group
      this.arcGroup = new THREE.Group();
      this.scene.add(this.arcGroup);

      // Handle resize
      this._onResize = () => this._resize();
      window.addEventListener('resize', this._onResize);

      this._animate();
    }

    _buildGlobe() {
      const radius = 1;

      // Dotted wireframe sphere
      const geo = new THREE.IcosahedronGeometry(radius, 3);
      const edges = new THREE.EdgesGeometry(geo);
      const lineMat = new THREE.LineBasicMaterial({
        color: 0x1e3a5f,
        transparent: true,
        opacity: 0.35
      });
      this.wireframe = new THREE.LineSegments(edges, lineMat);
      this.globeGroup.add(this.wireframe);

      // Latitude/longitude grid lines
      for (let lat = -60; lat <= 60; lat += 30) {
        const points = [];
        const phi = (90 - lat) * Math.PI / 180;
        for (let lng = 0; lng <= 360; lng += 4) {
          const theta = lng * Math.PI / 180;
          points.push(new THREE.Vector3(
            radius * Math.sin(phi) * Math.cos(theta),
            radius * Math.cos(phi),
            radius * Math.sin(phi) * Math.sin(theta)
          ));
        }
        const curve = new THREE.BufferGeometry().setFromPoints(points);
        const line = new THREE.Line(curve, new THREE.LineBasicMaterial({
          color: 0x1a3555,
          transparent: true,
          opacity: 0.2
        }));
        this.globeGroup.add(line);
      }

      for (let lng = 0; lng < 360; lng += 30) {
        const points = [];
        const theta = lng * Math.PI / 180;
        for (let lat = -90; lat <= 90; lat += 4) {
          const phi = (90 - lat) * Math.PI / 180;
          points.push(new THREE.Vector3(
            radius * Math.sin(phi) * Math.cos(theta),
            radius * Math.cos(phi),
            radius * Math.sin(phi) * Math.sin(theta)
          ));
        }
        const curve = new THREE.BufferGeometry().setFromPoints(points);
        const line = new THREE.Line(curve, new THREE.LineBasicMaterial({
          color: 0x1a3555,
          transparent: true,
          opacity: 0.15
        }));
        this.globeGroup.add(line);
      }

      // Dots on the sphere surface
      const dotGeo = new THREE.BufferGeometry();
      const dotPositions = [];
      const goldenRatio = (1 + Math.sqrt(5)) / 2;
      const numDots = 800;
      for (let i = 0; i < numDots; i++) {
        const theta2 = 2 * Math.PI * i / goldenRatio;
        const phi2 = Math.acos(1 - 2 * (i + 0.5) / numDots);
        dotPositions.push(
          radius * Math.sin(phi2) * Math.cos(theta2),
          radius * Math.cos(phi2),
          radius * Math.sin(phi2) * Math.sin(theta2)
        );
      }
      dotGeo.setAttribute('position', new THREE.Float32BufferAttribute(dotPositions, 3));
      const dotMat = new THREE.PointsMaterial({
        color: 0x3b82f6,
        size: 0.012,
        transparent: true,
        opacity: 0.6,
        sizeAttenuation: true
      });
      this.dots = new THREE.Points(dotGeo, dotMat);
      this.globeGroup.add(this.dots);
    }

    _buildAtmosphere() {
      // Glow ring
      const glowGeo = new THREE.RingGeometry(1.02, 1.12, 64);
      const glowMat = new THREE.MeshBasicMaterial({
        color: 0x06d6a0,
        transparent: true,
        opacity: 0.0,
        side: THREE.DoubleSide
      });
      this.glowRing = new THREE.Mesh(glowGeo, glowMat);
      this.glowRing.lookAt(this.camera.position);
      this.scene.add(this.glowRing);
    }

    setState(state) {
      this.state = state;
      if (state === 'connecting') {
        this.targetArcCount = 4;
        this.wireframe.material.color.setHex(0x4f46e5);
        this.wireframe.material.opacity = 0.5;
        this.dots.material.color.setHex(0x818cf8);
        this.glowRing.material.color.setHex(0x818cf8);
      } else if (state === 'connected') {
        this.targetArcCount = 6;
        this.wireframe.material.color.setHex(0x065f46);
        this.wireframe.material.opacity = 0.5;
        this.dots.material.color.setHex(0x06d6a0);
        this.glowRing.material.color.setHex(0x06d6a0);
      } else {
        this.targetArcCount = 0;
        this.wireframe.material.color.setHex(0x1e3a5f);
        this.wireframe.material.opacity = 0.35;
        this.dots.material.color.setHex(0x3b82f6);
        this.glowRing.material.opacity = 0;
      }
    }

    _spawnArc() {
      // Random source point (front-facing)
      const srcPhi   = Math.random() * Math.PI;
      const srcTheta = (Math.random() - 0.5) * Math.PI;
      const src = new THREE.Vector3(
        Math.sin(srcPhi) * Math.cos(srcTheta),
        Math.cos(srcPhi),
        Math.sin(srcPhi) * Math.sin(srcTheta)
      );

      // Random destination point
      const dstPhi   = Math.random() * Math.PI;
      const dstTheta = (Math.random() - 0.5) * Math.PI + Math.PI;
      const dst = new THREE.Vector3(
        Math.sin(dstPhi) * Math.cos(dstTheta),
        Math.cos(dstPhi),
        Math.sin(dstPhi) * Math.sin(dstTheta)
      );

      // Create arc curve
      const mid = new THREE.Vector3().addVectors(src, dst).multiplyScalar(0.5);
      mid.normalize().multiplyScalar(1.6 + Math.random() * 0.4); // height above surface
      const curve = new THREE.QuadraticBezierCurve3(src, mid, dst);
      const points = curve.getPoints(60);
      const geo = new THREE.BufferGeometry().setFromPoints(points);

      const color = this.state === 'connected' ? 0x06d6a0 : 0x818cf8;
      const mat = new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity: 0.8
      });
      const line = new THREE.Line(geo, mat);

      // Packet dot
      const packetGeo = new THREE.SphereGeometry(0.02, 8, 8);
      const packetMat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 1
      });
      const packet = new THREE.Mesh(packetGeo, packetMat);

      this.arcGroup.add(line);
      this.arcGroup.add(packet);

      this.arcs.push({
        line,
        packet,
        curve,
        progress: 0,
        speed: 0.005 + Math.random() * 0.008,
        drawProgress: 0
      });
    }

    _updateArcs() {
      // Spawn arcs if needed
      while (this.arcs.length < this.targetArcCount) {
        this._spawnArc();
      }

      // Remove excess arcs
      while (this.arcs.length > this.targetArcCount + 2) {
        const arc = this.arcs.shift();
        this.arcGroup.remove(arc.line);
        this.arcGroup.remove(arc.packet);
        arc.line.geometry.dispose();
        arc.line.material.dispose();
        arc.packet.geometry.dispose();
        arc.packet.material.dispose();
      }

      // Animate each arc
      for (let i = this.arcs.length - 1; i >= 0; i--) {
        const arc = this.arcs[i];
        arc.progress += arc.speed;
        arc.drawProgress = Math.min(arc.drawProgress + arc.speed * 1.5, 1);

        // Update draw range to animate line drawing
        const totalPoints = 61; // 60 segments + 1
        const drawCount = Math.floor(arc.drawProgress * totalPoints);
        arc.line.geometry.setDrawRange(0, drawCount);

        // Move packet along curve
        const pos = arc.curve.getPoint(Math.min(arc.progress, 1));
        arc.packet.position.copy(pos);

        // Fade out as it completes
        if (arc.progress > 0.8) {
          const fade = 1 - (arc.progress - 0.8) / 0.3;
          arc.line.material.opacity = Math.max(0, fade * 0.8);
          arc.packet.material.opacity = Math.max(0, fade);
        }

        // Remove completed arcs
        if (arc.progress > 1.1) {
          this.arcGroup.remove(arc.line);
          this.arcGroup.remove(arc.packet);
          arc.line.geometry.dispose();
          arc.line.material.dispose();
          arc.packet.geometry.dispose();
          arc.packet.material.dispose();
          this.arcs.splice(i, 1);
        }
      }
    }

    _animate() {
      this.animationId = requestAnimationFrame(() => this._animate());
      this.time += 0.004;

      // Rotate globe
      this.globeGroup.rotation.y += 0.002;

      // Glow pulse
      if (this.state !== 'idle') {
        const glowBase = this.state === 'connected' ? 0.12 : 0.08;
        this.glowRing.material.opacity = glowBase + Math.sin(this.time * 8) * 0.04;
        this.glowRing.lookAt(this.camera.position);
      }

      this._updateArcs();
      this.renderer.render(this.scene, this.camera);
    }

    _resize() {
      const rect = this.canvas.parentElement.getBoundingClientRect();
      this.camera.aspect = rect.width / rect.height;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(rect.width, rect.height);
    }

    destroy() {
      cancelAnimationFrame(this.animationId);
      window.removeEventListener('resize', this._onResize);
      this.renderer.dispose();
    }
  }

  // ── Init globe (THREE is loaded via script tag in index.html) ─
  function initGlobe() {
    const canvas = document.getElementById('globe-canvas');
    if (!canvas) return;

    if (typeof THREE === 'undefined') {
      console.error('THREE.js not loaded — globe disabled');
      return;
    }

    _globe = new GlobeScene(canvas);
    window._globe = _globe;
  }

  // Wait for DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initGlobe);
  } else {
    initGlobe();
  }
})();
