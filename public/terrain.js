"use strict";

import Renderer, { Scene, Camera, AudioListener3D, GameObject } from "./engine/renderer.mjs";
import Vector from "./engine/vector.mjs";
import { PhysicsEngine } from "./engine/physics.mjs";
import { clamp } from "./engine/helper.mjs";
import { getTriangleNormal } from "./engine/algebra.mjs";
import FlyCamera from "./engine/flyCamera.mjs";
import { NewMaterial } from "./engine/material.mjs";
import GamepadManager from "./gamepadManager.js";

// window.mobileCheck = function() {
//   let check = false;
//   (function(a){if(/(android|bb\d+|meego).+mobile|avantgo|bada\/|blackberry|blazer|compal|elaine|fennec|hiptop|iemobile|ip(hone|od)|iris|kindle|lge |maemo|midp|mmp|mobile.+firefox|netfront|opera m(ob|in)i|palm( os)?|phone|p(ixi|re)\/|plucker|pocket|psp|series(4|6)0|symbian|treo|up\.(browser|link)|vodafone|wap|windows ce|xda|xiino/i.test(a)||/1207|6310|6590|3gso|4thp|50[1-6]i|770s|802s|a wa|abac|ac(er|oo|s\-)|ai(ko|rn)|al(av|ca|co)|amoi|an(ex|ny|yw)|aptu|ar(ch|go)|as(te|us)|attw|au(di|\-m|r |s )|avan|be(ck|ll|nq)|bi(lb|rd)|bl(ac|az)|br(e|v)w|bumb|bw\-(n|u)|c55\/|capi|ccwa|cdm\-|cell|chtm|cldc|cmd\-|co(mp|nd)|craw|da(it|ll|ng)|dbte|dc\-s|devi|dica|dmob|do(c|p)o|ds(12|\-d)|el(49|ai)|em(l2|ul)|er(ic|k0)|esl8|ez([4-7]0|os|wa|ze)|fetc|fly(\-|_)|g1 u|g560|gene|gf\-5|g\-mo|go(\.w|od)|gr(ad|un)|haie|hcit|hd\-(m|p|t)|hei\-|hi(pt|ta)|hp( i|ip)|hs\-c|ht(c(\-| |_|a|g|p|s|t)|tp)|hu(aw|tc)|i\-(20|go|ma)|i230|iac( |\-|\/)|ibro|idea|ig01|ikom|im1k|inno|ipaq|iris|ja(t|v)a|jbro|jemu|jigs|kddi|keji|kgt( |\/)|klon|kpt |kwc\-|kyo(c|k)|le(no|xi)|lg( g|\/(k|l|u)|50|54|\-[a-w])|libw|lynx|m1\-w|m3ga|m50\/|ma(te|ui|xo)|mc(01|21|ca)|m\-cr|me(rc|ri)|mi(o8|oa|ts)|mmef|mo(01|02|bi|de|do|t(\-| |o|v)|zz)|mt(50|p1|v )|mwbp|mywa|n10[0-2]|n20[2-3]|n30(0|2)|n50(0|2|5)|n7(0(0|1)|10)|ne((c|m)\-|on|tf|wf|wg|wt)|nok(6|i)|nzph|o2im|op(ti|wv)|oran|owg1|p800|pan(a|d|t)|pdxg|pg(13|\-([1-8]|c))|phil|pire|pl(ay|uc)|pn\-2|po(ck|rt|se)|prox|psio|pt\-g|qa\-a|qc(07|12|21|32|60|\-[2-7]|i\-)|qtek|r380|r600|raks|rim9|ro(ve|zo)|s55\/|sa(ge|ma|mm|ms|ny|va)|sc(01|h\-|oo|p\-)|sdk\/|se(c(\-|0|1)|47|mc|nd|ri)|sgh\-|shar|sie(\-|m)|sk\-0|sl(45|id)|sm(al|ar|b3|it|t5)|so(ft|ny)|sp(01|h\-|v\-|v )|sy(01|mb)|t2(18|50)|t6(00|10|18)|ta(gt|lk)|tcl\-|tdg\-|tel(i|m)|tim\-|t\-mo|to(pl|sh)|ts(70|m\-|m3|m5)|tx\-9|up(\.b|g1|si)|utst|v400|v750|veri|vi(rg|te)|vk(40|5[0-3]|\-v)|vm40|voda|vulc|vx(52|53|60|61|70|80|81|83|85|98)|w3c(\-| )|webc|whit|wi(g |nc|nw)|wmlb|wonu|x700|yas\-|your|zeto|zte\-/i.test(a.substr(0,4))) check = true;})(navigator.userAgent||navigator.vendor||window.opera);
//   return check;
// };

// window.mobileCheck() && new FakeConsole("right", 200);

var perlin = typeof Perlin == "undefined" ? {noise: _ => 0} : new Perlin();
var gamepadManager = new GamepadManager();

var stats = new Stats();
document.body.appendChild(stats.dom);

var ui = new GameCanvas({publicMethods: false});
ui.canvas.classList.add("ingameUI");

var renderer;
var scene = new Scene("Main scene");
var mainCamera;// = new Camera({position: new Vector(0, 0, -3), near: 0.1, far: 300, fov: 20});
var physicsEngine = new PhysicsEngine(scene);

var player = {
  position: Vector.zero(),
  rotation: Vector.zero()
};

var audioListener = new AudioListener3D();

var lastUpdate = performance.now();

setup();
async function setup() {
  console.time("Setup");

  renderer = new Renderer({
    clearColor: [1, 0, 0, 1],
    width: innerWidth,
    height: innerHeight/* - 200*/,
    version: 2,
    renderpipeline: 0
  });
  renderer.add(scene);

  scene.postprocessing.exposure = -1.5;
  scene.skyboxFogIntensity = 1;
  scene.fogDensity = 0.02;
  await scene.loadEnvironment();

  // scene.skyboxFogIntensity = 0;
  // await scene.loadEnvironment({ hdrFolder: "./assets/hdri/snowy_field_1k" });

  mainCamera = new FlyCamera(renderer);
  // mainCamera.setAspect(renderer.aspect);

  var solidColorInstanceProgram = new renderer.ProgramContainer(await renderer.createProgramFromFile("./assets/shaders/custom/webgl2/solidColor"));

  // AABB visualizer
  scene.add(new GameObject("AABB", {
    meshRenderer: new renderer.MeshInstanceRenderer([new NewMaterial(solidColorInstanceProgram)], [new renderer.MeshData(renderer.getLineCubeData())], {drawMode: renderer.gl.LINES}),
    castShadows: false
  }));

  // await renderer.CreatePBRGrid(10, 10);
  scene.add(await renderer.loadGLTF("./assets/models/porsche-911-carrera-4s.glb"));
  // var helmet = scene.add(await renderer.loadGLTF("./assets/models/DamagedHelmetTangents.glb"));

  physicsEngine.fixedUpdate = function(dt) {}

  var albedo = await renderer.loadTextureAsync("./assets/textures/Snow/albedo.jpg");
  var normal = await renderer.loadTextureAsync("./assets/textures/Snow/normal.jpg");
  var terrainMat = renderer.CreateLitMaterial({
    albedoTexture: albedo,
    normalTexture: normal
  });

  for (var z = -1; z <= 1; z++) {
    for (var x = -1; x <= 1; x++) {
      var terrain = scene.add(new GameObject("Terrain " + x + "," + z));
      terrain.transform.position = new Vector(x * 95, 0, z * 95);
      terrain.meshRenderer = new renderer.MeshRenderer(terrainMat, createTerrainData(20, 20, 5, 2, new Vector(19 * x, 19 * z, 0), 0.1, 50));

      physicsEngine.addMeshCollider(terrain);
    }
  }
  physicsEngine.setupMeshCollider();
  // physicsEngine.octree.render();

  // var snow = new GameObject("Snow");
  // var snowParticles = new renderer.ParticleSystem(4000/*, null await renderer.loadObj("./assets/models/particle.obj")*/);
  // snow.addComponent(snowParticles);
  // scene.add(snow);

  // snowParticles.emitPosition = () => {
  //   return Vector.add(Vector.compMultiply(mainCamera.transform.position, new Vector(1, 1, -1)), new Vector((Math.random() - 0.5) * 15, 5, (Math.random() - 0.5) * 15));
  // }
  // snowParticles.emitVelocity = () => {
  //   return new Vector(0, -4, 0);
  // }

  // setInterval(_ => {
  //   snowParticles.emit(30);
  // }, 20);

  scene.root.traverse(function(gameObject) {
    if (gameObject.meshRenderer && gameObject.meshRenderer.skin) {
      gameObject.meshRenderer.skin.updateMatrixTexture();
    }
  });

  SetupEvents();

  renderer.disableCulling();

  console.timeEnd("Setup");

  loop();
}

function loop() {
  var frameTime = getFrameTime();

  mainCamera.update(frameTime);

  // mainCamera.transform.position = new Vector(-2.35, 1.12, -3.49);
  // mainCamera.transform.rotation = new Vector(-0.146 + Math.sin(physicsEngine.time * 0.7) * 0.02, -0.728 + Math.sin(physicsEngine.time * 0.5) * 0.02, 0);
  // mainCamera.updateMatrices();
  // cameraControls(frameTime);

  physicsEngine.update();
  // if (renderer.getKey(32))
  scene.update(physicsEngine.dt);

  renderer.render(mainCamera.camera);
  renderUI(frameTime);

  stats.update();
  requestAnimationFrame(loop);
}

function renderUI(dt) {
  ui.clearScreen();
}

function cameraControls(dt) {
  var x = gamepadManager.getAxis("RSHorizontal");
  var y = gamepadManager.getAxis("RSVertical");
  x = (Math.abs(x) > 0.08 ? x : 0);
  y = (Math.abs(y) > 0.08 ? y : 0);
  mainCamera.transform.rotation.x -= Math.abs(y) * y * 0.07;
  mainCamera.transform.rotation.y -= Math.abs(x) * x * 0.07;

  flyCamera(renderer, mainCamera, dt);
}

function createTerrainData(w = 20, h = 20, scale = 5, heightFactor = 2, noiseOffset = Vector.zero(), noiseScale = 0.1, uvScale = 20) {
  function getHeight(i, j) {
    return perlin.noise(i * noiseScale, j * noiseScale) * scale * heightFactor * clamp((Vector.length(new Vector((i - (w - 1) / 2) * scale, (j - (h - 1) / 2) * scale)) - 10) * 0.05, 0, 1);
  }

  var uvs = [];
  var vertices = [];
  var triangles = [];
  var tangents = [];

  for (var i = 0; i < w; i++) {
    for (var j = 0; j < h; j++) {
      var vertex = new Vector(
        (i - (w - 1) / 2) * scale,
        getHeight(i + noiseOffset.x, j + noiseOffset.y),
        (j - (h - 1) / 2) * scale
      );
      vertices.push(vertex.x, vertex.y, vertex.z);
      uvs.push(i / (w - 1) * uvScale, j / (h - 1) * uvScale);
    }
  }

  var normals = new Array(vertices.length / 3);
  for (var i = 0; i < normals.length; i++) {
    normals[i] = [];
  }

  for (var i = 0; i < w - 1; i++) {
    for (var j = 0; j < h - 1; j++) {
      var ind = j + i * h;
      var indices = [
        ind,
        ind + 1,
        ind + h,

        ind + 1,
        ind + h + 1,
        ind + h
      ];
      triangles.push(...indices);

      var t1Normal = getTriangleNormal([Vector.fromArray(vertices, indices[0] * 3), Vector.fromArray(vertices, indices[1] * 3), Vector.fromArray(vertices, indices[2] * 3)]);
      var t2Normal = getTriangleNormal([Vector.fromArray(vertices, indices[3] * 3), Vector.fromArray(vertices, indices[4] * 3), Vector.fromArray(vertices, indices[5] * 3)]);

      normals[indices[0]].push(t1Normal);
      normals[indices[1]].push(t1Normal);
      normals[indices[2]].push(t1Normal);
      normals[indices[3]].push(t2Normal);
      normals[indices[4]].push(t2Normal);
      normals[indices[5]].push(t2Normal);
    }
  }

  var outNormals = [];
  for (var i = 0; i < normals.length; i++) {
    var normal = Vector.divide(normals[i].reduce((a, b) => {
      return Vector.add(a, b);
    }, Vector.zero()), normals[i].length);

    outNormals.push(normal.x, normal.y, normal.z);

    tangents.push(normal.y, normal.x, normal.z);
  }

  var meshData = new renderer.MeshData({
    indices: {
      bufferData: new Uint32Array(triangles),
      target: renderer.gl.ELEMENT_ARRAY_BUFFER
    },
    position: {
      bufferData: new Float32Array(vertices),
      size: 3
    },
    normal: {
      bufferData: new Float32Array(outNormals),
      size: 3
    },
    tangent: {
      bufferData: new Float32Array(tangents),
      size: 3
    },
    uv: {
      bufferData: new Float32Array(uvs),
      size: 2
    }
  });
  
  return meshData;
}

function SetupEvents() {
  renderer.gl.canvas.addEventListener('contextmenu', event => event.preventDefault());

  renderer.onmousedown = function(e) {
    renderer.lockPointer();
  }

  renderer.onmousemove = function(e) {
    if (renderer.isPointerLocked()) {
      mainCamera.rotation.x -= e.movementY * 0.002;
      mainCamera.rotation.y -= e.movementX * 0.002;
    }
  }
}

function getFrameTime() {
  var now = performance.now();
  var frameTime = (now - lastUpdate) / 1000;
  lastUpdate = now;

  return frameTime;
}