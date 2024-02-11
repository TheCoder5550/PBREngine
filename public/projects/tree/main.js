import Renderer from "../../engine/renderer.mjs";
import { Scene } from "../../engine/scene.mjs";
import OrbitCamera from "../../engine/orbitCamera.mjs";
import Vector from "../../engine/vector.mjs";
import Matrix from "../../engine/matrix.mjs";
import PRNG from "../../PRNG.mjs";
import TreeHandler from "../../engine/treeHandler.mjs";
import Tonemapper from "../../engine/postprocessing-effects/tonemapper.mjs";
import FlyCamera from "../../engine/flyCamera.mjs";

const prng = new PRNG();

const renderer = new Renderer({ renderpipeline: 0, path: "../../" });
const scene = window.scene = renderer.add(new Scene());
await scene.loadEnvironment({ hdrFolder: "../../assets/hdri/kloofendal_48d_partly_cloudy_puresky_1k_precomputed" });

const pp = renderer.postprocessing;
pp.addEffect(new Tonemapper());

const orbitCamera = new FlyCamera(renderer, { far: 1000 });
// orbitCamera.setCenter(new Vector(0, 2, 0));
const camera = orbitCamera.camera;

const ground = scene.add(renderer.CreatePlane());
ground.transform.scale = Vector.fill(100);

const treeHandler = new TreeHandler(scene, camera);
const myFirstTree = await treeHandler.addVariant("../../assets/models/trees/myFirstTreeLOD/myFirstTreeLOD.glb", [
  20,
  40,
  Infinity
]);

const area = 90;
for (let i = 0; i < 1_000; i++) {
  const x = (prng.random() - 0.5) * 2 * area;
  const z = (prng.random() - 0.5) * 2 * area;
  const y = 0;

  const position = { x, y, z };
  const scale = Vector.fill(1 + prng.random() * 0.5);
  const rotationY = prng.random() * Math.PI * 2;

  const instance = Matrix.identity();
  Matrix.applyTranslation(position, instance);
  Matrix.applyScale(scale, instance);
  Matrix.applyRotationY(rotationY, instance);
  
  myFirstTree.addTree(instance);
}

renderer.on("renderloop", (frameTime) => {
  renderer.update(frameTime);
  renderer.render(camera);
});