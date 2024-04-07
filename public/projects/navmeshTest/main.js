import { RENDERPIPELINE } from "../../engine/constants.mjs";
import Renderer from "../../engine/renderer.mjs";
import { Scene } from "../../engine/scene.mjs";
import OrbitCamera from "../../engine/orbitCamera.mjs";
import Tonemapper from "../../engine/postprocessing-effects/tonemapper.mjs";
import createInspector from "../../engine/inspector/inspector.mjs";
import GLDebugger from "../../engine/GLDebugger.mjs";
import { NavMesh } from "../../engine/navmesh.mjs";
import Vector from "../../engine/vector.mjs";
import { AABB } from "../../engine/physics.mjs";
// import { voxelGridData } from "./voxelGridData.mjs";

const renderer = new Renderer({
  renderpipeline: RENDERPIPELINE.FORWARD,
  path: "../../",
});

window.createInspector = () => createInspector(renderer);

const scene = window.scene = renderer.add(new Scene());
await scene.loadEnvironment({ hdrFolder: renderer.path + "assets/hdri/kloofendal_48d_partly_cloudy_puresky_1k_precomputed" });

window.glDebugger = new GLDebugger(scene);

const pp = renderer.postprocessing;
pp.addEffect(new Tonemapper());

const orbitCamera = new OrbitCamera(renderer, {
  fov: 20,
  near: 1,
  far: 1000,
});
const camera = orbitCamera.camera;

const map = scene.add(await renderer.loadGLTF(renderer.path + "assets/models/maps/beta/model.glb"));

// const voxelData = new Uint8Array(Math.floor(voxelGridData.length / 8 + 1));
// for (let i = 0; i < voxelData.length; i++) {
//   const byte = voxelGridData.slice(i * 8, (i + 1) * 8).join("").padEnd(8, "0");
//   voxelData[i] = parseInt(byte, 2);
// }

// const blob = new Blob([ voxelData ], {type: "application/octet-stream"});
// const url = window.URL.createObjectURL(blob);
// const a = document.createElement("a");
// document.body.appendChild(a);
// a.href = url;
// a.download = "voxel-grid-data.voxel";
// a.click();
// a.remove();
// window.URL.revokeObjectURL(url);


const navMesh = new NavMesh();
// navMesh.resolution = 256;
// navMesh.createVoxelGrid(map, new AABB(
//   Vector.fill(-75),
//   Vector.fill(55.5)
// ));
await navMesh.loadVoxelGrid("./voxel-grid-data.voxel", new AABB(
  Vector.fill(-75),
  Vector.fill(55.5)
));
// navMesh.exportVoxelGrid();
// navMesh.debugVoxelGrid();

renderer.on("renderloop", (frameTime) => {
  if (renderer.getKeyDown(32)) {
    const startWorld = new Vector(30 * (Math.random() - 0.5), 10, 30 * (Math.random() - 0.5));
    const endWorld = new Vector(30 * (Math.random() - 0.5), 10, 30 * (Math.random() - 0.5));
    navMesh.pathfind(startWorld, endWorld);
  }

  renderer.update(frameTime);
  renderer.render(camera);
});