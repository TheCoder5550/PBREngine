import { RENDERPIPELINE } from "../../engine/constants.mjs";
import Renderer from "../../engine/renderer.mjs";
import { Scene } from "../../engine/scene.mjs";
import OrbitCamera from "../../engine/orbitCamera.mjs";
import Tonemapper from "../../engine/postprocessing-effects/tonemapper.mjs";

const renderer = new Renderer({
  renderpipeline: RENDERPIPELINE.FORWARD,
  path: "../../",

  shadowSizes: [16 * 2, 64 * 2],
  shadowBiases: [2, 2],
  shadowResolution: 1024,
});
const scene = window.scene = renderer.add(new Scene());
await scene.loadEnvironment({ hdrFolder: renderer.path + "assets/hdri/kloofendal_48d_partly_cloudy_puresky_1k_precomputed" });

const pp = renderer.postprocessing;
pp.addEffect(new Tonemapper());

const orbitCamera = new OrbitCamera(renderer, {
  fov: 20,
  near: 1,
  far: 1000,
});
const camera = orbitCamera.camera;

const car = scene.add(await renderer.loadGLTF(renderer.path + "assets/models/cars/tocus.glb"));

renderer.on("renderloop", (frameTime) => {
  // renderer.update(frameTime);
  renderer.render(camera);
});

// let x = 0;

// const a = new Vector();
// const b = new Vector();
// const up = Vector.up();

// loop();
// function loop() {
//   for (let i = 0; i < 100_000; i++) {
//     new Vector(1, b.y, 3, a);
//     Vector.project(a, up, b);
//     Vector.add(b, a, b);
//     Vector.normalizeTo(b);
//   }

//   // x += 2;
//   requestAnimationFrame(loop);
// }