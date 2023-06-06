import * as ENUMS from "../engine/constants.mjs";
import Renderer, { GameObject, Scene, Light } from "../engine/renderer.mjs";
import OrbitCamera from "../engine/orbitCamera.mjs";
import Vector from "../engine/vector.mjs";
import Quaternion from "../engine/quaternion.mjs";
import Matrix from "../engine/matrix.mjs";

let renderer;
let scene;
let camera;

const stats = new Stats();

const canvas = document.querySelector("#mainCanvas");
const dropZone = document.querySelector("#dropZone");
const dropPrompt = document.querySelector(".dropPrompt");
const fileInput = document.querySelector("input[type=file]");

dropZone.addEventListener("drop", onDrop);
dropZone.addEventListener("dragover", onDragOver);
dropZone.addEventListener("dragenter", onDragEnter);
dropZone.addEventListener("dragleave", onDragLeave);

canvas.addEventListener("drop", onDrop);
canvas.addEventListener("dragover", onDragOver);
canvas.addEventListener("dragenter", onDragEnter);
// canvas.addEventListener("dragleave", onDragLeave);

dropPrompt.addEventListener("click", openFileDialog);
fileInput.addEventListener("change", uploadFile);

function openFileDialog() {
  fileInput.click();
}

function uploadFile(event) {
  let file = event.target.files[0];
  handleFile(file);
}

async function onDrop(ev) {
  ev.preventDefault();
  dropZone.classList.remove("dropping");

  let selectedFile;
  for (let file of ev.dataTransfer.files) {
    const ext = getFileExtension(file.name);
    if (ext !== "glb") {
      console.error(`File extension '${ext}' does not match allowed extensions: 'glb'`);
      continue;
    }

    selectedFile = file;
    break;
  }

  if (!selectedFile) {
    console.error("No file found");
    return;
  }

  handleFile(selectedFile);
}

async function handleFile(file) {
  const url = URL.createObjectURL(file);

  if (!renderer) {
    await createRenderer();
  }

  let model = await loadGLB(url);
  cleanUpScene(model);

  hideElement(dropZone);
  document.body.appendChild(stats.dom);
}

function onDragOver(ev) {
  ev.preventDefault();
}

function onDragEnter() {
  showElement(dropZone);
  dropZone.classList.add("dropping");
}

function onDragLeave() {
  if (renderer) {
    hideElement(dropZone);
  }
  dropZone.classList.remove("dropping");
}

async function createRenderer() {
  renderer = new Renderer({
    canvas,
    debug: true,
    path: "../",
    renderScale: 1,
    shadowResolution: 2048,
    renderpipeline: ENUMS.RENDERPIPELINE.FORWARD,
  });

  scene = new Scene();
  renderer.add(scene);

  scene.environmentIntensity = 0.5;
  scene.sunIntensity = Vector.fromArray(Light.kelvinToRgb(5200, 20));
  scene.sunDirection.z *= -1;
  scene.bloom.intensity = 0.01;

  await scene.loadEnvironment({
    hdrFolder: "../assets/hdri/kloofendal_48d_partly_cloudy_puresky_4k_precomputed",
    // res: 512
  });

  camera = new OrbitCamera(renderer, {near: 0.1, far: 300, fov: 30});
  camera.distance = 4;

  renderer.on("renderloop", function(frameTime, totalTime) {
    renderer.update(frameTime);
    renderer.render(camera.camera);

    stats.update();
  });
}

async function loadGLB(src) {
  let model = await renderer.loadGLTF(src);
  let batched = renderer.BatchGameObject(model);

  let aabb = batched.meshRenderer.getAABB();
  let size = aabb.getSize();
  let maxSize = Math.max(size.x, size.y, size.z);
  let scale = 5 / maxSize;

  batched.transform.scale = Vector.fill(scale);
  batched.transform.position = Vector.multiply(aabb.getCenter(), -scale);

  return scene.add(batched);
}

function cleanUpScene(skip) {
  camera.distance = 4;
  camera.rotation = Vector.zero();

  scene.root.traverse(obj => {
    if (!obj.parent) {
      return;
    }

    if (skip && obj == skip) {
      return;
    }

    if (obj.meshRenderer) {
      obj.meshRenderer.cleanup();
    }
    obj.delete();
  });
}

function getFileExtension(fileName) {
  return fileName.split(".").pop();
}

function showElement(element) {
  element.classList.remove("hidden");
}

function hideElement(element) {
  element.classList.add("hidden");
}