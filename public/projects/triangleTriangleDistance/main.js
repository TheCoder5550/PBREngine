import { RENDERPIPELINE } from "../../engine/constants.mjs";
import Renderer from "../../engine/renderer.mjs";
import { Scene } from "../../engine/scene.mjs";
import OrbitCamera from "../../engine/orbitCamera.mjs";
import Vector from "../../engine/vector.mjs";
import Tonemapper from "../../engine/postprocessing-effects/tonemapper.mjs";
import { GameObject } from "../../engine/gameObject.mjs";
import { triangleTriangleDistance } from "../../engine/algebra.mjs";
import GLDebugger from "../../engine/GLDebugger.mjs";

const renderer = new Renderer({
  renderpipeline: RENDERPIPELINE.FORWARD,
  path: "../../",

  shadowSizes: [16 * 2, 64 * 2],
  shadowBiases: [2, 2],
  shadowResolution: 1024,
});
const scene = window.scene = renderer.add(new Scene());
const glDebugger = window.glDebugger = new GLDebugger(scene);
await scene.loadEnvironment({ hdrFolder: renderer.path + "assets/hdri/kloofendal_48d_partly_cloudy_puresky_1k_precomputed" });

const pp = renderer.postprocessing;
pp.addEffect(new Tonemapper());

const orbitCamera = new OrbitCamera(renderer, {
  fov: 20,
  near: 1,
  far: 1000,
});
const camera = orbitCamera.camera;

const triangleA = [
  new Vector(-3, -0.2, 3),
  new Vector(3, 0, 3),
  new Vector(0, 0, -5),
];

const triangleB = [
  new Vector(-4, 2, 3),
  new Vector(3, 2, 3),
  new Vector(0, 0.3, -3),
];

createTriangle(triangleA, [0.2, 0, 0, 1]);
createTriangle(triangleB, [0, 0.2, 0, 1]);

const p = new Vector();
const q = new Vector();
const distanceSqr = triangleTriangleDistance(triangleA, triangleB, p, q);
console.log(distanceSqr, p, q);

glDebugger.CreatePoint(p);
glDebugger.CreatePoint(q);
glDebugger.CreateLine(p, q);

renderer.on("renderloop", (frameTime) => {
  renderer.update(frameTime);
  renderer.render(camera);
});

function createTriangle(triangle, albedo = [0.2, 0, 0, 1]) {
  let triangleGameObject = new GameObject("Triangle");
  let meshData = new renderer.MeshData({
    indices: {
      bufferData: new Uint32Array([ 0, 1, 2, 3, 4, 5 ]),
      target: renderer.gl.ELEMENT_ARRAY_BUFFER
    },
    position: {
      bufferData: new Float32Array([
        triangle[0].x, triangle[0].y, triangle[0].z,
        triangle[1].x, triangle[1].y, triangle[1].z,
        triangle[2].x, triangle[2].y, triangle[2].z,
      ]),
      size: 3
    },
    normal: {
      bufferData: new Float32Array([ 0, 1, 0, 0, 1, 0 ]),
      size: 3,
    },
  });
  let mat = renderer.CreateLitMaterial({ albedo });
  mat.doubleSided = true;
  let meshRenderer = new renderer.MeshRenderer(mat, meshData);

  triangleGameObject.meshRenderer = meshRenderer;
  scene.add(triangleGameObject);

  return triangleGameObject;
}