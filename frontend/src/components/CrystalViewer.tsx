import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { Structure } from "../types";
import { colorFor } from "../elementColors";

interface Props {
  structure: Structure | null;
  loading: boolean;
  error: string | null;
  onLoad: () => void;
  materialId: string | null;
}

interface BuiltScene {
  scene: THREE.Scene;
  center: THREE.Vector3;
  radius: number;
  dispose: () => void;
}

const BOND_CUTOFF = 3.2;
const ATOM_RADIUS = 0.35;
const BOND_RADIUS = 0.08;
const UP = new THREE.Vector3(0, 1, 0);

function latticeMatrix(a: number, b: number, c: number, alpha: number, beta: number, gamma: number): THREE.Matrix4 {
  const ar = (alpha * Math.PI) / 180;
  const br = (beta * Math.PI) / 180;
  const gr = (gamma * Math.PI) / 180;
  const cosA = Math.cos(ar);
  const cosB = Math.cos(br);
  const cosG = Math.cos(gr);
  const sinG = Math.sin(gr) || 1e-9;
  const v1 = new THREE.Vector3(a, 0, 0);
  const v2 = new THREE.Vector3(b * cosG, b * sinG, 0);
  const cx = c * cosB;
  const cy = c * (cosA - cosB * cosG) / sinG;
  const cz = Math.sqrt(Math.max(0, c * c - cx * cx - cy * cy));
  const v3 = new THREE.Vector3(cx, cy, cz);
  const m = new THREE.Matrix4();
  m.set(
    v1.x, v2.x, v3.x, 0,
    v1.y, v2.y, v3.y, 0,
    v1.z, v2.z, v3.z, 0,
    0, 0, 0, 1,
  );
  return m;
}

function fracToCart(mat: THREE.Matrix4, fx: number, fy: number, fz: number): THREE.Vector3 {
  return new THREE.Vector3(fx, fy, fz).applyMatrix4(mat);
}

function makeBond(start: THREE.Vector3, end: THREE.Vector3, geometry: THREE.CylinderGeometry, material: THREE.MeshStandardMaterial) {
  const dist = start.distanceTo(end);
  const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
  const dir = new THREE.Vector3().subVectors(end, start);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(mid);
  mesh.scale.set(1, dist, 1);
  mesh.quaternion.setFromUnitVectors(UP, dir.normalize());
  return mesh;
}

function disposeObject(obj: THREE.Object3D) {
  obj.traverse((child) => {
    if (child instanceof THREE.Mesh || child instanceof THREE.Line) {
      child.geometry.dispose();
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((material) => material.dispose());
    }
  });
}

function buildScene(structure: Structure): BuiltScene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0e14);

  const disposables: Array<{ dispose: () => void }> = [];
  const mat = latticeMatrix(structure.a, structure.b, structure.c, structure.alpha, structure.beta, structure.gamma);

  const corners = [
    [0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1],
    [1, 1, 0], [1, 0, 1], [0, 1, 1], [1, 1, 1],
  ].map(([x, y, z]) => fracToCart(mat, x, y, z));

  const edges = [
    [0, 1], [0, 2], [0, 3], [1, 4], [1, 5], [2, 4],
    [2, 6], [3, 5], [3, 6], [4, 7], [5, 7], [6, 7],
  ];
  const lineMat = new THREE.LineBasicMaterial({ color: 0x3a4a66 });
  disposables.push(lineMat);
  for (const [edgeStart, edgeEnd] of edges) {
    const geo = new THREE.BufferGeometry().setFromPoints([corners[edgeStart], corners[edgeEnd]]);
    disposables.push(geo);
    scene.add(new THREE.Line(geo, lineMat));
  }

  const sphereGeo = new THREE.SphereGeometry(ATOM_RADIUS, 24, 16);
  disposables.push(sphereGeo);
  const materialByElement = new Map<string, THREE.MeshStandardMaterial>();
  const positions: THREE.Vector3[] = [];

  for (const atom of structure.atoms) {
    const pos = fracToCart(mat, atom.x, atom.y, atom.z);
    positions.push(pos);
    let meshMat = materialByElement.get(atom.element);
    if (!meshMat) {
      meshMat = new THREE.MeshStandardMaterial({ color: colorFor(atom.element), roughness: 0.4, metalness: 0.3 });
      materialByElement.set(atom.element, meshMat);
      disposables.push(meshMat);
    }
    const mesh = new THREE.Mesh(sphereGeo, meshMat);
    mesh.position.copy(pos);
    scene.add(mesh);
  }

  const cylGeo = new THREE.CylinderGeometry(BOND_RADIUS, BOND_RADIUS, 1, 8);
  const bondMat = new THREE.MeshStandardMaterial({ color: 0x6b7891, roughness: 0.6 });
  disposables.push(cylGeo, bondMat);
  for (let i = 0; i < positions.length; i++) {
    for (let j = i + 1; j < positions.length; j++) {
      const dist = positions[i].distanceTo(positions[j]);
      if (dist < BOND_CUTOFF && dist > 0.1) {
        scene.add(makeBond(positions[i], positions[j], cylGeo, bondMat));
      }
    }
  }

  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
  dirLight.position.set(5, 10, 7);
  scene.add(dirLight);

  const box = new THREE.Box3();
  for (const p of positions) box.expandByPoint(p);
  for (const corner of corners) box.expandByPoint(corner);
  const center = new THREE.Vector3();
  box.getCenter(center);
  const radius = Math.max(1, box.getSize(new THREE.Vector3()).length() / 2);

  return {
    scene,
    center,
    radius,
    dispose: () => disposables.forEach((d) => d.dispose()),
  };
}

export function CrystalViewer({ structure, loading, error, onLoad, materialId }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const frameRef = useRef<number>(0);

  useEffect(() => {
    return () => {
      cancelAnimationFrame(frameRef.current);
      rendererRef.current?.dispose();
    };
  }, []);

  useEffect(() => {
    if (!structure || !containerRef.current) return undefined;

    cancelAnimationFrame(frameRef.current);
    rendererRef.current?.dispose();

    const el = containerRef.current;
    const w = Math.max(1, el.clientWidth);
    const h = Math.max(1, el.clientHeight);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    el.replaceChildren(renderer.domElement);
    rendererRef.current = renderer;

    const built = buildScene(structure);
    const camera = new THREE.PerspectiveCamera(50, w / h, 0.1, Math.max(1000, built.radius * 10));
    camera.position.copy(built.center).add(new THREE.Vector3(0, 0, built.radius * 2.5));
    camera.lookAt(built.center);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(built.center);
    controls.enableDamping = true;
    controls.update();

    const animate = () => {
      frameRef.current = requestAnimationFrame(animate);
      controls.update();
      renderer.render(built.scene, camera);
    };
    animate();

    const resizeObserver = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width <= 0 || height <= 0) return;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    });
    resizeObserver.observe(el);

    return () => {
      resizeObserver.disconnect();
      cancelAnimationFrame(frameRef.current);
      controls.dispose();
      disposeObject(built.scene);
      built.dispose();
      renderer.dispose();
      if (rendererRef.current === renderer) {
        rendererRef.current = null;
      }
    };
  }, [structure]);

  if (!materialId) {
    return <div className="viewer-empty">选择材料后可查看 3D 结构</div>;
  }

  if (!structure && !loading && !error) {
    return (
      <div className="viewer-prompt">
        <button className="load-btn" onClick={onLoad}>
          加载 3D 结构
        </button>
        <span>从本地 by_id.zip 读取 CIF，无需联网。</span>
      </div>
    );
  }

  if (loading) {
    return <div className="viewer-loading">加载结构中…</div>;
  }

  if (error) {
    return <div className="viewer-error">加载失败: {error}</div>;
  }

  return (
    <div className="viewer-wrap">
      <div className="viewer-info">
        {structure && (
          <>
            <span>{structure.atoms.length} 原子</span>
            <span>a={structure.a.toFixed(2)} b={structure.b.toFixed(2)} c={structure.c.toFixed(2)}</span>
            <span>{structure.spaceGroupName ?? `SG#${structure.spaceGroupNumber ?? "?"}`}</span>
          </>
        )}
      </div>
      <div className="viewer-canvas" ref={containerRef} />
    </div>
  );
}
