import { RENDERPIPELINE } from "../../engine/constants.mjs";
import Renderer from "../../engine/renderer.mjs";
import { Scene } from "../../engine/scene.mjs";
import OrbitCamera from "../../engine/orbitCamera.mjs";

import * as gridShaderSource from "./grid.glsl.mjs";
import { GameObject } from "../../engine/gameObject.mjs";
import { NewMaterial } from "../../engine/material.mjs";
import Vector from "../../engine/vector.mjs";

const renderer = new Renderer({
  renderpipeline: RENDERPIPELINE.FORWARD,
  path: "../../",
});
renderer.setClearColor(0.03, 0.03, 0.03, 1);

const scene = window.scene = renderer.add(new Scene());
scene.skyboxVisible = false;
await scene.loadEnvironment({ hdrFolder: renderer.path + "assets/hdri/kloofendal_48d_partly_cloudy_puresky_1k_precomputed" });

const orbitCamera = new OrbitCamera(renderer, { fov: 20, far: 5000 });
orbitCamera.rotation = new Vector(
  -Math.PI / 8,
  -Math.PI / 4,
  0,
);
const camera = orbitCamera.camera;

const gridShader = new renderer.CustomProgram(gridShaderSource);
const material = new NewMaterial(gridShader);
material.opaque = false;
material.setUniform("near", camera.getNear());
material.setUniform("far", camera.getFar());
material.setUniform("strength", 0.25);
material.setUniform("color", [0.1, 0.1, 0.1]);
material.setUniform("gridSize", 1);
material.setUniform("mainAxisWidth", 1);
material.setUniform("maxDistance", 200);

const meshData = new renderer.MeshData({
  position: {
    bufferData: new Float32Array([
      1, 1, 0,
      -1, 1, 0,
      -1, -1, 0,
      -1, -1, 0,
      1, -1, 0,
      1, 1, 0,
    ]),
    size: 3
  }
});

const grid = scene.add(new GameObject("Grid"));
grid.meshRenderer = new renderer.MeshRenderer(material, meshData);

const helmet = scene.add(await renderer.loadGLTF("../../assets/models/DamagedHelmet.glb"));

renderer.on("renderloop", (frameTime) => {
  renderer.update(frameTime);
  renderer.render(camera);
});