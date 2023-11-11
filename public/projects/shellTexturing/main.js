import * as shellTexturingShaderSource from "./shellTexturing.glsl.mjs";
import Renderer from "../../engine/renderer.mjs";
import { Scene } from "../../engine/scene.mjs";
import OrbitCamera from "../../engine/orbitCamera.mjs";
import Vector from "../../engine/vector.mjs";
import GUI from "./lil-gui.mjs";

const renderer = new Renderer({ renderpipeline: 0, path: "../../" });

const scene = window.scene = renderer.add(new Scene());
await scene.loadEnvironment({ hdrFolder: renderer.path + "assets/hdri/kloofendal_48d_partly_cloudy_puresky_1k_precomputed" });

const orbitCamera = new OrbitCamera(renderer, { fov: 30, near: 0.1, far: 1000 });
orbitCamera.rotation = new Vector(-0.6, 0, 0);
const camera = orbitCamera.camera;

const shellTexturingShader = new renderer.CustomProgram(shellTexturingShaderSource);
const perlinNoiseTexture = await renderer.loadTextureAsync("./perlin.png");

const createShells = () => {
  shellObjects.length = 0;

  // Do front to back rendering (when looking from above)
  for (let i = settings.shells - 1; i >= 0; i--) {
    const shell = scene.add(renderer.CreatePlane());
    shell.transform.scale = Vector.fill(settings.area);

    const mat = shell.meshRenderer.materials[0];
    mat.programContainer = shellTexturingShader;
    mat.doubleSided = true;

    shellObjects[i] = shell;
  }

  updateMaterials();
};

const updateShells = () => {
  for (let i = 0; i < shellObjects.length; i++) {
    const shellObject = shellObjects[i];
    shellObject.delete();
  }

  createShells();
};

const updateMaterials = () => {
  for (let i = 0; i < shellObjects.length; i++) {
    const shellObject = shellObjects[i];
    const mat = shellObject.meshRenderer.materials[0];

    mat.setUniform("height", settings.height / settings.area);
    mat.setUniform("heightBias", settings.heightBias);
    mat.setUniform("shells", settings.shells);
    mat.setUniform("shellIndex", i);
    mat.setUniform("baseColor", settings.baseColor);
    mat.setUniform("density", settings.density * settings.area);
    mat.setUniform("simplexNoiseTexture", settings.simplexNoiseTexture);
    mat.setUniform("swayStrength", settings.swayStrength);
    mat.setUniform("swayDensity", settings.swayDensity * settings.area);
    mat.setUniform("windSpeed", settings.windSpeed);
    mat.setUniform("thickness", settings.thickness);
  }
};

const updateArea = () => {
  for (let i = 0; i < shellObjects.length; i++) {
    const shellObject = shellObjects[i];
    shellObject.transform.scale = Vector.fill(settings.area);
  }

  updateMaterials();
};

const settings = {
  area: 2,
  shells: 64,
  height: 1,
  heightBias: 0.3,
  baseColor: [0.1, 1, 0.25, 1],
  density: 30,
  thickness: 2.5,
  simplexNoiseTexture: perlinNoiseTexture,
  swayStrength: 10,
  swayDensity: 0.1,
  windSpeed: 0.015,
};
const shellObjects = [];

const gui = new GUI();
gui.add(settings, "area", 1, 100).onChange(updateArea);
gui.add(settings, "shells", 4, 256, 1).onChange(updateShells);
gui.add(settings, "height", 0, 3).onChange(updateMaterials);
gui.add(settings, "heightBias", 0.01, 1).onChange(updateMaterials);
gui.addColor(settings, "baseColor").onChange(updateMaterials);
gui.add(settings, "density", 1, 100).onChange(updateMaterials);
gui.add(settings, "thickness", 0, 10).onChange(updateMaterials);
gui.add(settings, "swayStrength", 0, 50).onChange(updateMaterials);
gui.add(settings, "swayDensity", 0, 1).onChange(updateMaterials);
gui.add(settings, "windSpeed", 0, 0.1).onChange(updateMaterials);

createShells();

renderer.on("renderloop", (frameTime) => {
  renderer.update(frameTime);
  renderer.render(camera);
});