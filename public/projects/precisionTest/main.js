import { RENDERPIPELINE } from "../../engine/constants.mjs";
import Renderer from "../../engine/renderer.mjs";
import { Scene } from "../../engine/scene.mjs";
import OrbitCamera from "../../engine/orbitCamera.mjs";
import Vector from "../../engine/vector.mjs";
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
orbitCamera.setCenter(new Vector(600_000, 10, 500));
const camera = orbitCamera.camera;

const car = scene.add(await renderer.loadGLTF(renderer.path + "assets/models/cars/tocus.glb"));
car.transform.position.x = 600_000;
car.transform.position.y = 10;
car.transform.position.z = 500;

renderer.on("renderloop", (frameTime) => {
  renderer.update(frameTime);
  renderer.render(camera);
});