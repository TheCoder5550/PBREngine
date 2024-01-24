import { RENDERPIPELINE } from "../../engine/constants.mjs";
import Renderer from "../../engine/renderer.mjs";
import { Scene } from "../../engine/scene.mjs";
import OrbitCamera from "../../engine/orbitCamera.mjs";

import * as roadShaderSource from "../asp-simulator/roadShader.glsl.mjs";
import { loadImage } from "../../engine/helper.mjs";
import Quaternion from "../../engine/quaternion.mjs";

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
  near: 0.01,
  far: 50,
});
orbitCamera.rotation = Quaternion.euler(-Math.PI, 0, 0);
const camera = orbitCamera.camera;

const roadProgram = new renderer.CustomProgram(roadShaderSource);

let [
  albedoImage,
  normalImage,
  metallicRoughnessImage
] = await Promise.all([
  loadImage(renderer.path + "assets/textures/roadNoLines512/albedo.png"),
  loadImage(renderer.path + "assets/textures/roadNoLines512/normal.png"),
  loadImage(renderer.path + "assets/textures/roadNoLines512/metallicRoughness.png")
]);

const roadMaterial = new renderer.LitMaterial({
  albedo: [0.3, 0.3, 0.3, 1],
  albedoTexture: await renderer.loadTexture(albedoImage, { ...renderer.getSRGBFormats(), anisotropicFiltering: true }),
  normalTexture: await renderer.loadTexture(normalImage, { anisotropicFiltering: true }),
  metallicRoughnessTexture: await renderer.loadTexture(metallicRoughnessImage, { anisotropicFiltering: true }),
  metallic: 0.5,
}, roadProgram);

const plane = scene.add(renderer.CreatePlane());
plane.meshRenderer.materials[0] = roadMaterial;

renderer.on("renderloop", (frameTime) => {
  renderer.update(frameTime);
  renderer.render(camera);
});