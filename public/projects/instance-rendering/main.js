import { RENDERPIPELINE } from "../../engine/constants.mjs";
import Renderer from "../../engine/renderer.mjs";
import { Scene } from "../../engine/scene.mjs";
import OrbitCamera from "../../engine/orbitCamera.mjs";
import Vector from "../../engine/vector.mjs";
import Matrix from "../../engine/matrix.mjs";

const renderer = new Renderer({
  renderpipeline: RENDERPIPELINE.FORWARD,
  path: "../../",

  shadowSizes: [16 * 2, 64 * 2],
  shadowBiases: [2, 2],
  shadowResolution: 1024,
});
const scene = window.scene = renderer.add(new Scene());
await scene.loadEnvironment({ hdrFolder: renderer.path + "assets/hdri/kloofendal_48d_partly_cloudy_puresky_1k_precomputed" });

const orbitCamera = new OrbitCamera(renderer, {
  fov: 20,
  near: 1,
  far: 1000,
});
const camera = orbitCamera.camera;

const tree = await renderer.loadGLTF(renderer.path + "assets/models/trees/oak1/oak1LODs.glb", { loadVertexColors: false });
const billboard = tree.getChild("LOD2");
const mr = billboard.meshRenderer = billboard.meshRenderer.getInstanceMeshRenderer();
billboard.setParent(scene);

const colors = [
  [1, 0, 0, 1],
  [0, 1, 0, 1],
  [0, 0, 1, 1],
  [1, 1, 1, 1],
];

for (let i = 0; i < colors.length; i++) {
  const matrix = Matrix.identity();
  Matrix.applyTranslation(new Vector((i - (colors.length - 1) / 2) * 3, 0, 0), matrix);
  Matrix.applyRotationX(Math.PI / 2, matrix);
  Matrix.applyRotationZ(Math.PI / 4, matrix);
  Matrix.applyScale(Vector.fill(0.01), matrix);

  const instance = mr.addInstance(matrix);
  mr.setColor(instance, colors[i]);
}

renderer.on("renderloop", (frameTime) => {
  renderer.update(frameTime);
  renderer.render(camera);
});