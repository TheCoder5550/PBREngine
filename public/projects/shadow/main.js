import { RENDERPIPELINE } from "../../engine/constants.mjs";
import Renderer from "../../engine/renderer.mjs";
import { Scene } from "../../engine/scene.mjs";
import OrbitCamera from "../../engine/orbitCamera.mjs";
import Vector from "../../engine/vector.mjs";
import Quaternion from "../../engine/quaternion.mjs";

const renderer = new Renderer({
  renderpipeline: RENDERPIPELINE.FORWARD,
  path: "../../",

  shadowSizes: [16 * 2, 64 * 2],
  shadowBiases: [2, 2],
  shadowResolution: 1024,
});
const scene = window.scene = renderer.add(new Scene());
await scene.loadEnvironment({ hdrFolder: "../../assets/hdri/kloofendal_48d_partly_cloudy_puresky_1k_precomputed" });

const orbitCamera = new OrbitCamera(renderer, { near: 0.01, far: 100 });
const camera = orbitCamera.camera;

const ground = scene.add(renderer.CreatePlane());
ground.transform.scale = Vector.fill(100);
ground.meshRenderer.materials[0].setUniform("albedo", [0.1, 0.1, 0, 1]);

const cube = scene.add(renderer.CreateShape("cube"));
cube.transform.position.x = -2;
cube.transform.position.y = 1;
cube.meshRenderer.materials[0].setUniform("albedo", [0.1, 0, 0.1, 1]);

const sphere = scene.add(renderer.CreateShape("sphere"));
sphere.transform.position.x = 2;
sphere.transform.position.y = 1;

for (let i = 0; i < 10; i++) {
  const plane = scene.add(renderer.CreatePlane());
  plane.transform.rotation = Quaternion.euler(-i / 9 * Math.PI, 0, 0);
  plane.transform.position.x = i * 3;
  plane.transform.position.y = 5;

  plane.meshRenderer.materials[0].setUniform("albedo", [0.1, 0, 0.1, 1]);
}

renderer.on("renderloop", (frameTime) => {
  renderer.update(frameTime);
  renderer.render(camera);
});