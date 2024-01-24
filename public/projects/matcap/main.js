import { RENDERPIPELINE } from "../../engine/constants.mjs";
import Renderer from "../../engine/renderer.mjs";
import { Scene } from "../../engine/scene.mjs";
import OrbitCamera from "../../engine/orbitCamera.mjs";

import * as matcapSource from "./matcap.glsl.mjs";
import Vector from "../../engine/vector.mjs";

const renderer = new Renderer({
  renderpipeline: RENDERPIPELINE.FORWARD,
  path: "../../",
});
renderer.setClearColor(0.2, 0.2, 0.2, 1);

const scene = window.scene = renderer.add(new Scene());
renderer.settings.enablePostProcessing = false;

const orbitCamera = new OrbitCamera(renderer, { fov: 10, far: 5000 });
const camera = orbitCamera.camera;

const normalTexture = await renderer.loadTextureAsync("./plasterNormal.jpg");

const folder = "./textures/";
const nrTextures = 49;
const textureContainer = document.querySelector("#textures");
const cachedTextures = {};

const index = 0;
const matcapTexture = await renderer.loadTextureAsync(`${folder}${(index + 1).toString().padStart(5, "0")}.png`);
cachedTextures[index] = matcapTexture;

for (let i = 0; i < nrTextures; i++) {
  const path = `${folder}${(i + 1).toString().padStart(5, "0")}.png`;
  const img = textureContainer.appendChild(document.createElement("img"));
  img.src = path;
  img.addEventListener("click", async () => {
    if (!cachedTextures[i]) {
      const matcapTexture = await renderer.loadTextureAsync(`${folder}${(i + 1).toString().padStart(5, "0")}.png`);
      cachedTextures[i] = matcapTexture;
    }

    material.setUniform("matcapTexture", cachedTextures[i]);
  });
}

const matcap = new renderer.CustomProgram(matcapSource);

// const suzanne = scene.add(await renderer.loadGLTF("../../assets/models/primitives/suzanneSmooth.glb"));
// const material = suzanne.children[0].meshRenderer.materials[0];
// material.programContainer = matcap;
// material.setUniform("matcapTexture", matcapTexture);
// material.setUniform("normalTexture", normalTexture);

const model = scene.add(renderer.BatchGameObject(await renderer.loadGLTF("../../assets/models/stanford_dragon.glb")));
model.transform.scale = Vector.fill(10);

console.log(model.getChildStructure());

const material = model.meshRenderer.materials[0];
material.programContainer = matcap;
material.setUniform("matcapTexture", matcapTexture);
material.setUniform("normalTexture", normalTexture);

renderer.on("renderloop", (frameTime) => {
  renderer.update(frameTime);
  renderer.render(camera);
});