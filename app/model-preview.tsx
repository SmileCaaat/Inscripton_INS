"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";

type ModelPreviewProps = {
  url: string;
  fileName: string;
};

type LoadedModel = {
  object: THREE.Object3D;
  animations: THREE.AnimationClip[];
};

function extensionOf(fileName: string) {
  const match = fileName.toLowerCase().match(/\.([a-z0-9]+)$/);
  return match?.[1] ?? "";
}

async function loadModel(url: string, extension: string): Promise<LoadedModel> {
  if (extension === "glb" || extension === "gltf") {
    const gltf = await new GLTFLoader().loadAsync(url);
    return { object: gltf.scene, animations: gltf.animations };
  }
  if (extension === "fbx") {
    const object = await new FBXLoader().loadAsync(url);
    return { object, animations: object.animations };
  }
  if (extension === "obj") {
    return { object: await new OBJLoader().loadAsync(url), animations: [] };
  }
  throw new Error(`暂不支持 .${extension || "未知"} 模型格式`);
}

function disposeObject(root: THREE.Object3D) {
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry?.dispose();
    const materials = Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material];
    for (const material of materials) {
      if (!material) continue;
      for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture) value.dispose();
      }
      material.dispose();
    }
  });
}

function prepareObject(root: THREE.Object3D) {
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const materials = Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material];
    for (const material of materials) {
      material.side = THREE.DoubleSide;
      material.needsUpdate = true;
    }
  });
}

function frameObject(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  object: THREE.Object3D,
) {
  const bounds = new THREE.Box3().setFromObject(object);
  if (bounds.isEmpty()) return;
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const span = Math.max(size.x, size.y, size.z, 0.01);
  const thinAxis =
    Math.min(size.x, size.y, size.z) / span < 0.4
      ? size.x <= size.y && size.x <= size.z
        ? "x"
        : size.y <= size.z
          ? "y"
          : "z"
      : null;
  const distance =
    span / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) * 1.35;

  if (thinAxis === "y") {
    camera.position.set(
      center.x + span * 0.18,
      center.y + distance * 0.9,
      center.z + span * 0.58,
    );
  } else if (thinAxis === "x") {
    camera.position.set(center.x + distance, center.y + span * 0.12, center.z);
  } else {
    camera.position.set(center.x, center.y + span * 0.08, center.z + distance);
  }
  camera.near = Math.max(span / 500, 0.01);
  camera.far = Math.max(span * 100, 1000);
  camera.updateProjectionMatrix();
  controls.target.copy(center);
  controls.update();
}

export function ModelPreview({ url, fileName }: ModelPreviewProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const resetViewRef = useRef<(() => void) | null>(null);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const clipsRef = useRef<THREE.AnimationClip[]>([]);
  const gridRef = useRef<THREE.GridHelper | null>(null);
  const animationPlayingRef = useRef(true);
  const [status, setStatus] = useState("正在读取模型…");
  const [error, setError] = useState("");
  const [animationPlaying, setAnimationPlaying] = useState(true);
  const [gridVisible, setGridVisible] = useState(true);
  const [clipNames, setClipNames] = useState<string[]>([]);
  const [selectedClip, setSelectedClip] = useState("");

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let cancelled = false;
    let loadedObject: THREE.Object3D | null = null;
    let frameId = 0;
    let resizeFrame = 0;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#171916");
    const camera = new THREE.PerspectiveCamera(42, 1, 0.01, 5000);
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.domElement.setAttribute("aria-label", `${fileName} 三维模型预览`);
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.screenSpacePanning = true;
    controls.minDistance = 0.01;
    controls.maxDistance = 100000;

    scene.add(new THREE.HemisphereLight(0xf2eee4, 0x343a36, 1.45));
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
    keyLight.position.set(5, 9, 7);
    keyLight.castShadow = true;
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0x9eb7d0, 0.85);
    fillLight.position.set(-6, 3, -5);
    scene.add(fillLight);
    const grid = new THREE.GridHelper(20, 20, 0x77766f, 0x343631);
    grid.name = "preview-grid";
    gridRef.current = grid;
    scene.add(grid);

    const resize = () => {
      window.cancelAnimationFrame(resizeFrame);
      resizeFrame = window.requestAnimationFrame(() => {
        const width = Math.max(1, mount.clientWidth);
        const height = Math.max(1, mount.clientHeight);
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
      });
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(mount);
    resize();

    const clock = new THREE.Clock();
    const render = () => {
      const delta = clock.getDelta();
      if (mixerRef.current && animationPlayingRef.current) {
        mixerRef.current.update(delta);
      }
      controls.update();
      renderer.render(scene, camera);
      frameId = window.requestAnimationFrame(render);
    };
    render();

    setStatus("正在读取模型…");
    setError("");
    setClipNames([]);
    setSelectedClip("");
    void loadModel(url, extensionOf(fileName))
      .then(({ object, animations }) => {
        if (cancelled) {
          disposeObject(object);
          return;
        }
        loadedObject = object;
        prepareObject(object);
        scene.add(object);
        const bounds = new THREE.Box3().setFromObject(object);
        if (!bounds.isEmpty()) {
          const size = bounds.getSize(new THREE.Vector3());
          grid.scale.setScalar(Math.max(size.x, size.y, size.z, 1) / 10);
        }
        resetViewRef.current = () => frameObject(camera, controls, object);
        resetViewRef.current();
        if (animations.length > 0) {
          animations.forEach((clip, index) => {
            if (!clip.name) clip.name = `动画 ${index + 1}`;
          });
          const mixer = new THREE.AnimationMixer(object);
          mixerRef.current = mixer;
          clipsRef.current = animations;
          setClipNames(animations.map((clip) => clip.name));
          setSelectedClip(animations[0].name);
          mixer.clipAction(animations[0]).reset().play();
          setStatus(`模型已载入 · ${animations.length} 个动画`);
        } else {
          setStatus("模型已载入");
        }
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        setError(reason instanceof Error ? reason.message : "模型读取失败");
        setStatus("");
      });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frameId);
      window.cancelAnimationFrame(resizeFrame);
      resizeObserver.disconnect();
      controls.dispose();
      mixerRef.current?.stopAllAction();
      mixerRef.current = null;
      clipsRef.current = [];
      if (loadedObject) {
        scene.remove(loadedObject);
        disposeObject(loadedObject);
      }
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
      resetViewRef.current = null;
      gridRef.current = null;
    };
  }, [fileName, url]);

  useEffect(() => {
    if (gridRef.current) gridRef.current.visible = gridVisible;
  }, [gridVisible]);

  useEffect(() => {
    animationPlayingRef.current = animationPlaying;
  }, [animationPlaying]);

  useEffect(() => {
    const mixer = mixerRef.current;
    if (!mixer || !selectedClip) return;
    const clip = clipsRef.current.find((item) => item.name === selectedClip);
    if (!clip) return;
    mixer.stopAllAction();
    mixer.clipAction(clip).reset().play();
  }, [selectedClip]);

  return (
    <div className="model-preview-shell">
      <div className="model-preview-toolbar">
        <span>{error || status}</span>
        <div>
          {clipNames.length > 1 && (
            <select
              aria-label="选择模型动画"
              value={selectedClip}
              onChange={(event) => setSelectedClip(event.target.value)}
            >
              {clipNames.map((name) => (
                <option value={name} key={name}>
                  {name}
                </option>
              ))}
            </select>
          )}
          <button type="button" onClick={() => resetViewRef.current?.()}>
            正视图
          </button>
          <button
            type="button"
            className={gridVisible ? "active" : ""}
            onClick={() => setGridVisible((visible) => !visible)}
          >
            网格
          </button>
          <button
            type="button"
            className={animationPlaying ? "active" : ""}
            onClick={() => setAnimationPlaying((playing) => !playing)}
          >
            {animationPlaying ? "暂停动画" : "播放动画"}
          </button>
        </div>
      </div>
      <div ref={mountRef} className="model-preview-canvas" />
      <small className="model-preview-hint">左键旋转 · 右键平移 · 滚轮缩放</small>
    </div>
  );
}
