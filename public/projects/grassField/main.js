import * as grassShaderSource from "./grass.glsl.mjs";

import Renderer from "../../engine/renderer.mjs";
import { GameObject } from "../../engine/gameObject.mjs";
import { Scene } from "../../engine/scene.mjs";
import OrbitCamera from "../../engine/orbitCamera.mjs";
import Vector from "../../engine/vector.mjs";
import { NewMaterial } from "../../engine/material.mjs";
import Matrix from "../../engine/matrix.mjs";

const renderer = new Renderer({ renderpipeline: 0, path: "../../" });

const scene = window.scene = renderer.add(new Scene());
await scene.loadEnvironment({ hdrFolder: renderer.path + "assets/hdri/kloofendal_48d_partly_cloudy_puresky_1k_precomputed" });

const orbitCamera = new OrbitCamera(renderer, { fov: 30, near: 0.1, far: 1000 });
const camera = orbitCamera.camera;

const perlinNoiseTexture = await renderer.loadTextureAsync("./perlin.png");
const grassShader = new renderer.CustomProgram(grassShaderSource);
const tipColor = [0.15, 0.8, 0.05];
const baseColor = [0, 0.1, 0];
const dryColor = [0.5, 0.5, 0];

const material = new NewMaterial(grassShader);
material.doubleSided = true;
material.setUniform("noiseTexture", perlinNoiseTexture);
material.setUniform("tipColor", tipColor);
material.setUniform("baseColor", baseColor);
material.setUniform("dryColor", dryColor);

const meshData = getGrassMeshData();
const meshRenderer = new renderer.MeshInstanceRenderer(material, meshData);
meshRenderer.enableDither = false;

const grass = new GameObject("Grass");
grass.castShadows = false;
grass.meshRenderer = meshRenderer;
scene.add(grass);

const blades = 10_000;
const area = 6;
for (let i = 0; i < blades; i++) {
  const translation = new Vector(
    Math.random() - 0.5,
    0,
    Math.random() - 0.5
  );
  Vector.multiplyTo(translation, area);

  let scale = Math.random() * 0.5 + 0.5;
  scale **= 2;

  const instance = Matrix.identity();
  Matrix.applyTranslation(translation, instance);
  Matrix.applyRotationY(Math.random() * 2 * Math.PI, instance);
  Matrix.applyScale(scale, instance);

  meshRenderer.addInstance(instance);
}

const ground = scene.add(renderer.CreatePlane());
ground.transform.scale = Vector.fill(area / 2);
ground.meshRenderer.materials[0].setUniform("albedo", [0.03, 0.05, 0, 1]);

renderer.on("renderloop", (frameTime) => {
  renderer.update(frameTime);
  renderer.render(camera);
});

function getGrassMeshData() {
  const segments = 4;
  const height = 0.8;
  const width = 0.15;

  const vertices = new Float32Array(3 * 2 * (segments + 1));
  const uvs = new Float32Array(2 * 2 * (segments + 1));
  const indices = new Uint32Array(6 * segments);

  for (let i = 0; i < segments + 1; i++) {
    const normalizedHeight = i / segments;
    const currentWidth = width * (1 - normalizedHeight ** 1.5);

    vertices[i * 6 + 0] = -currentWidth / 2;
    vertices[i * 6 + 1] = normalizedHeight * height;
    vertices[i * 6 + 2] = 0;

    vertices[i * 6 + 3] = currentWidth / 2;
    vertices[i * 6 + 4] = normalizedHeight * height;
    vertices[i * 6 + 5] = 0;

    uvs[i * 4 + 0] = 0;
    uvs[i * 4 + 1] = normalizedHeight;

    uvs[i * 4 + 2] = 1;
    uvs[i * 4 + 3] = normalizedHeight;
  }

  for (let i = 0; i < segments; i++) {
    indices[i * 6 + 0] = i * 2 + 0;
    indices[i * 6 + 1] = i * 2 + 1;
    indices[i * 6 + 2] = i * 2 + 2;

    indices[i * 6 + 3] = i * 2 + 1;
    indices[i * 6 + 4] = i * 2 + 3;
    indices[i * 6 + 5] = i * 2 + 2;
  }

  return new renderer.MeshData({
    indices: {
      bufferData: indices,
      target: renderer.gl.ELEMENT_ARRAY_BUFFER
    },
    position: {
      bufferData: vertices,
      size: 3
    },
    // normal: {
    //   bufferData: normals,
    //   size: 3
    // },
    uv: {
      bufferData: uvs,
      size: 2
    }
  });
}