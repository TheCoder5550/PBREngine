import * as ENUMS from "../engine/constants.mjs";
import Renderer, { Scene, GameObject, Camera, Light, LOD } from "../engine/renderer.mjs";
import Vector from "../engine/vector.mjs";
import Matrix from "../engine/matrix.mjs";
import Quaternion from "../engine/quaternion.mjs";
// import GLDebugger from "../engine/GLDebugger.mjs";
// import Terrain from "../engine/terrain.mjs";
import { LerpCurve } from "../engine/curves.mjs";
import { lerp, mapValue, clamp, loadImage, getImagePixelData, hideElement, showElement, roundNearest, roundToPlaces, randomFromArray, getAngleBetween, getDistanceBetween, smoothstep, sleep, wrap } from "../engine/helper.mjs";
import Perlin from "../engine/perlin.mjs";
import { GetMeshAABB, PhysicsEngine, MeshCollider, Rigidbody, DistanceConstraint } from "../engine/physics.mjs";
import { Car, Trailer } from "../car.js";
import * as carSettings from "./carSettings.mjs";
import Keybindings from "../keybindingsController.mjs";
import GamepadManager, { quadraticCurve, deadZone } from "../gamepadManager.js";
import OrbitCamera from "../engine/orbitCamera.mjs";
import { NewMaterial } from "../engine/material.mjs";
import Terrain from "../engine/terrain.mjs";

import * as roadSource from "../assets/shaders/custom/road.glsl.mjs";
import * as carPaintShader from "../assets/shaders/custom/carPaint.glsl.mjs";
import * as terrainShader from "./terrain.glsl.mjs";
import * as simpleFoliage from "../assets/shaders/custom/simpleFoliage.glsl.mjs";
import createInspector from "../engine/inspector/inspector.mjs";

class ControllerUIInteraction {
  #tickPath = "../assets/sound/menu tick.wav";
  #tickAudio = new Audio(this.#tickPath);

  constructor(keybindings) {
    this.keybindings = keybindings;

    this.selectedElement = null;
  }

  update() {
    if (this.keybindings.getInputDown("UIup")) {
      this.#handleInput(0);
    }
    else if (this.keybindings.getInputDown("UIright")) {
      this.#handleInput(1);
    }
    else if (this.keybindings.getInputDown("UIdown")) {
      this.#handleInput(2);
    }
    else if (this.keybindings.getInputDown("UIleft")) {
      this.#handleInput(3);
    }
    else if (this.keybindings.getInputDown("UIselect")) {
      this.#handleClick();
    }
  }

  #handleClick() {
    if (this.selectedElement && this.selectedElement.offsetParent !== null) {
      this.selectedElement.click();
      this.#playTickSound();
    }
  }

  #handleInput(direction) {
    var selectables = document.querySelectorAll(".isSelectable:not([disabled]):not(.hidden):not(.selected)");
    selectables = [...selectables].filter(e => e.offsetParent !== null);

    if (selectables.length == 0) {
      this.deselectElement();
      return;
    }

    if (this.selectedElement && this.selectedElement.offsetParent == null) {
      this.deselectElement();
    }

    if (!this.selectedElement) {
      this.selectFirstElement(selectables);
      return;
    }

    var selectedBB = this.selectedElement.getBoundingClientRect();
    var directionAngle = direction * Math.PI / 2 - Math.PI / 2;

    var getAngleDiff = function(element) {
      var elementBB = element.getBoundingClientRect();
      var angleToElement = getAngleBetween(selectedBB.x, selectedBB.y, elementBB.x, elementBB.y);
      var d = angleToElement - directionAngle;
      var angleDiff = Math.abs(Math.atan2(Math.sin(d), Math.cos(d)));
      return angleDiff;
    };

    var getDistanceToElement = function(element) {
      var elementBB = element.getBoundingClientRect();
      return getDistanceBetween(selectedBB.x, selectedBB.y, elementBB.x, elementBB.y);
    };

    var bestMatch = selectables.reduce((prev, curr) => {
      if (getAngleDiff(curr) < Math.PI * 0.4) {
        if (!prev || getDistanceToElement(curr) < getDistanceToElement(prev)) {
          return curr;
        }
      }

      return prev;
    }, null);

    if (bestMatch) {
      this.selectElement(bestMatch);
    }
  }

  deselectElement() {
    if (this.selectedElement) {
      this.selectedElement.classList.remove("selected");
      this.selectedElement = null;
    }
  }

  selectFirstElement(_selectables) {
    var selectables = _selectables;
    if (!_selectables) {
      selectables = document.querySelectorAll(".isSelectable:not([disabled]):not(.hidden):not(.selected)");
      selectables = [...selectables].filter(e => e.offsetParent !== null);
    }

    var topSelectable = selectables.reduce((prev, curr) => {
      var rank = prev.getBoundingClientRect().y - curr.getBoundingClientRect().y + 0.1 * (prev.getBoundingClientRect().x - curr.getBoundingClientRect().x);
      
      if (rank > 0) {
        return curr;
      }

      return prev;
    });
    this.selectElement(topSelectable);
  }

  selectElement(element) {
    if (this.selectedElement) {
      this.selectedElement.classList.remove("selected");
    }

    if (element.classList.contains("isSelectable")) {
      this.selectedElement = element;
      this.selectedElement.classList.add("selected");
      this.selectedElement.scrollIntoView({
        behavior: "smooth",
      });
      this.#playTickSound();
    }
    else {
      console.warn("Element is not selectable");
      console.log(element);
    }
  }

  #playTickSound() {
    this.#tickAudio.currentTime = 0;
    this.#tickAudio.play();
  }
}

class CarPaintMaterial {
  constructor(renderer, carPaintProgram, settings = {}) {
    var paintMaterial = new renderer.LitMaterial();
    paintMaterial.programContainer = carPaintProgram;

    if (settings.flakesNormalTexture) {
      paintMaterial.setUniform("flakesNormalTexture", settings.flakesNormalTexture);
      paintMaterial.setUniform("useFlakes", 1);
    }
    
    paintMaterial.setUniform("metallic", settings.metallic ?? 1);
    paintMaterial.setUniform("roughness", settings.roughness ?? 0.4);

    paintMaterial.setUniform("twoTone", settings.twoTone ?? 0);
    paintMaterial.setUniform("color1", settings.color1 ?? [0, 0.3, 1]);
    paintMaterial.setUniform("color2", settings.color2 ?? [0.4, 0.3, 1]);
    paintMaterial.setUniform("flakeScale", settings.flakeScale ?? 500);
    paintMaterial.setUniform("clearcoatRoughness", settings.clearcoatRoughness ?? 0.1);
    paintMaterial.setUniform("clearcoatFactor", settings.clearcoatFactor ?? 1);

    return paintMaterial;
  }
}

class FlakesTexture {
  constructor(width = 512, height = 512) {
    const canvas = document.createElement( 'canvas' );
    canvas.width = width;
    canvas.height = height;
  
    const context = canvas.getContext( '2d' );
    context.fillStyle = 'rgb(127,127,255)';
    context.fillRect( 0, 0, width, height );
  
    for ( let i = 0; i < 4000; i ++ ) {
      const x = Math.random() * width;
      const y = Math.random() * height;
      const r = Math.random() * 3 + 3;
  
      let nx = Math.random() * 2 - 1;
      let ny = Math.random() * 2 - 1;
      let nz = 1.5 * 5;
  
      const l = Math.sqrt( nx * nx + ny * ny + nz * nz );
  
      nx /= l; ny /= l; nz /= l;
  
      context.fillStyle = 'rgb(' + ( nx * 127 + 127 ) + ',' + ( ny * 127 + 127 ) + ',' + ( nz * 255 ) + ')';
      context.beginPath();
      context.arc( x, y, r, 0, Math.PI * 2 );
      context.fill();
  
    }
  
    return canvas;
  }
}

document.addEventListener("DOMContentLoaded", async function () {
  var pauseOverlay = document.querySelector(".pauseOverlay");
  var garageOverlay = document.querySelector(".garage");
  var loadingOverlay = document.querySelector(".loading");
  var settingsOverlay = document.querySelector(".settings");
  var selectCarButton = garageOverlay.querySelector(".selectCar");
  var progressBar = loadingOverlay.querySelector(".progressBar");
  var progressStatus = loadingOverlay.querySelector(".progressStatus");
  let lastTextStatus;
  var messagesContainer = document.querySelector(".messages");

  var perlin = new Perlin();
  var stats;

  var ui = new GameCanvas({publicMethods: false});
  ui.canvas.classList.add("ingameUICanvas");
  ui.canvas.style.zIndex = 2;

  // var snowCamera;

  var settingsManager;
  var settingsOpened = false;
  var paused = false;

  var allowedCars = [ "lowpolySportsCar" ];
  // var allowedCars = [
  //   "skyline",
  //   "drift",
  //   "drift2",
  //   "gtr",
  //   "ranger",
  //   "bus",
  //   "audiRS6",
  //   "M3_E30",
  //   "crownVic",
  //   "aventador",
  // ];
  var selectedCar = 0;
  var loadedCar = 0;
  var carRotation = 0;

  var gamepadManager = new GamepadManager();
  var bindsLookup = {
    "brights": {
      keyboard: "KeyX",
      controller: "LB"
    },
    "drive": {
      keyboard: "KeyW",
      controller: "RT"
    },
    "brake": {
      keyboard: "KeyS",
      controller: "LT"
    },
    "ebrake": {
      keyboard: "Space",
      controller: "A"
    },
    "clutch": {
      keyboard: "KeyC",
      controller: "Y"
    },
    "steer": {
      keyboard: ["KeyA", "KeyD"],
      controller: "LSHorizontal"
    },
    "gearDown": {
      keyboard: "KeyQ",
      controller: "X"
    },
    "gearUp": {
      keyboard: "KeyE",
      controller: "B"
    },
    "cameraMode": {
      keyboard: "KeyC",
      controller: "RB"
    },
    "turnCamera": {
      keyboard: ["ArrowLeft", "ArrowRight"],
      controller: "RSHorizontal"
    },
    "horn": {
      keyboard: "KeyT",
      controller: "RS"
    },

    "pause": {
      keyboard: "Escape",
      controller: "Menu"
    },
    "back": {
      keyboard: "Escape",
      controller: "B"
    },
    "menuDown": {
      keyboard: "ArrowDown",
      controller: "DPDown"
    },
    "menuUp": {
      keyboard: "ArrowUp",
      controller: "DPUp"
    },
    "menuSelect": {
      keyboard: "Enter",
      controller: "A"
    },

    "garagePrev": {
      keyboard: "ArrowLeft",
      controller: "DPLeft"
    },
    "garageNext": {
      keyboard: "ArrowRight",
      controller: "DPRight"
    },

    "UIup": {
      keyboard: "ArrowUp",
      controller: "DPUp"
    },
    "UIright": {
      keyboard: "ArrowRight",
      controller: "DPRight"
    },
    "UIdown": {
      keyboard: "ArrowDown",
      controller: "DPDown"
    },
    "UIleft": {
      keyboard: "ArrowLeft",
      controller: "DPLeft"
    },
    "UIselect": {
      keyboard: "Enter",
      controller: "A"
    },
  };
  var keybindings;
  var controllerUIInteraction;

  // Multiplayer
  var ws;

  let currentTask = 0;
  let totalTasks = 10 + allowedCars.length;

  // Renderer
  setProgress(currentTask++, totalTasks, "Initializing renderer");
  const renderer = new Renderer({
    path: "../",
    renderScale: 1,
    debug: true,
    renderpipeline: ENUMS.RENDERPIPELINE.FORWARD,

    shadowResolution: 256 * 4,
    // shadowSizes: [4, 12],
    shadowSizes: [6, 64],
  });
  renderer.disableContextMenu();
  renderer.canvas.style.position = "fixed";

  window.isDay = isDay;
  settingsManager = new SettingsManager();
  keybindings = new Keybindings(renderer, gamepadManager, bindsLookup);
  controllerUIInteraction = new ControllerUIInteraction(keybindings);

  // Scene
  setProgress(currentTask++, totalTasks, "Loading scene");
  console.time("Scene");
  const scene = new Scene("Playground");
  renderer.add(scene);

  scene.fogColor = [0.4, 0.4, 0.5, 1];
  scene.fogDensity = 0.001;
  scene.environmentMinLight = 0.5;
  // scene.environmentIntensity = 1;//1.5 * 1.2;
  // scene.sunIntensity = Vector.fromArray(Light.kelvinToRgb(5500, 20));
  scene.postprocessing.exposure = -1;
  scene.postprocessing.vignette.amount = 0.3;
  scene.postprocessing.vignette.falloff = 0.3;
  // renderer.postprocessing.saturation.value = 0.4;
  // renderer.settings.enableShadows = false;
  // renderer.postprocessing.rainTexture = await renderer.loadTextureAsync("../assets/textures/rain-normal-map.jpg");
  renderer.shadowCascades.refreshRate = 0;
  // renderer.settings.enableShadows = false;

  await scene.loadEnvironment({
    // hdr: "../assets/hdri/kloofendal_48d_partly_cloudy_puresky_4k.hdr",
    hdrFolder: "../assets/hdri/kloofendal_48d_partly_cloudy_puresky_4k_precomputed",
    // hdrFolder: "../assets/hdri/snowy_field_1k",
    // res: 1024
  });
  console.timeEnd("Scene");

  // Garage scene
  setProgress(currentTask++, totalTasks, "Generating garage");
  console.time("Garage");

  const garageScene = new Scene("Garage");
  renderer.add(garageScene);

  garageScene.sunIntensity = Vector.zero();
  garageScene.environmentIntensity = 0.2;
  await garageScene.loadEnvironment({
    // hdr: "../assets/hdri/studio_small_09_1k.hdr",
    hdrFolder: "../assets/hdri/studio_small_09_1k_precomputed",
    // res: 512
  });

  console.timeEnd("Garage");

  garageScene.add(await renderer.loadGLTF("./garage.glb"));

  const garageCamera = new Camera({ fov: 30 });
  garageCamera.transform.matrix = Matrix.lookAt(new Vector(0, 1.5, 6), new Vector(0, 0.5, 0), Vector.up());
  var resizeEvent = () => {
    garageCamera.setAspect(renderer.aspect);
  };
  renderer.on("resize", resizeEvent);
  resizeEvent();

  // Debugger
  // setProgress(currentTask++, totalTasks, "Initializing debugger");
  // window.Debug = new GLDebugger(scene);

  // Physics engine
  setProgress(currentTask++, totalTasks, "Initializing physics engine");
  const physicsEngine = new PhysicsEngine(scene, {
    octreeLevels: 5,
    multipleTimestepsPerFrame: false
  });

  // Road program
  // var roadProgram = new renderer.ProgramContainer(await renderer.createProgram(roadSource.webgl2.vertex, roadSource.webgl2.fragment));
  
  // var terrainProgram = new renderer.CustomProgram(terrainShader);

  // Car paint
  setProgress(currentTask++, totalTasks, "Initializing car paint material");
  const flakes = await renderer.loadTextureAsync(new FlakesTexture());
  const carPaintProgram = new renderer.CustomProgram(carPaintShader);

  const paints = {
    purple: new CarPaintMaterial(renderer, carPaintProgram, { flakesNormalTexture: flakes }),
    simplyRed: new CarPaintMaterial(renderer, carPaintProgram, {
      metallic: 0,
      clearcoatRoughness: 0,
      twoTone: 0,
      color1: [1, 0, 0],
    }),
    darkgray: new CarPaintMaterial(renderer, carPaintProgram, {
      flakesNormalTexture: flakes,
      flakeScale: 1000,
      metallic: 1,
      roughness: 0.5,
      clearcoatRoughness: 0,
      clearcoatFactor: 0.5,
      twoTone: 0,
      color1: [0.05, 0.05, 0.05],
    }),
  };

  // Load map
  setProgress(currentTask++, totalTasks, "Loading map");

  var terrain = new Terrain(scene, {
    terrainSize: 10_000,
    colliderDepthThreshold: 6,
    // enableCollision: false,
  });
  terrain.chunkRes = 25;
  terrain.amplitude = 0;

  function LayeredNoise(x, y, octaves = 4) {
    var noise = 0;
    var frequency = 1;
    var factor = 1;
  
    var persistance = 0.4;
    var roughness = 3;
  
    for (var i = 0; i < octaves; i++) {
      noise += perlin.noise(x * frequency + i * 0.72354, y * frequency + i * 0.72354) * factor;
      factor *= persistance;
      frequency *= roughness;
    }
  
    return noise;
  }

  terrain.getHeight = function(i, j) {
    var power = 2.5;
    var noiseLayers = 2;
    var noiseScale = 0.001;

    var heightFalloff = 1;//1 - clamp((Vector.length(new Vector(i, j)) - 400) * 0.005, 0, 1);
    var elevation = Math.pow(Math.abs(LayeredNoise(i * noiseScale, j * noiseScale, noiseLayers)), power) * this.amplitude * heightFalloff;

    // elevation *= smoothstep(Math.abs(i), 10, 50);

    return elevation;
  };

  var litTerrain = new renderer.ProgramContainer(await renderer.createProgramFromFile(renderer.path + "assets/shaders/custom/webgl2/litTerrain"));

  // var grassAlbedo = await renderer.loadTextureAsync(renderer.path + "assets/textures/aerial_rocks_02_1k/textures/aerial_rocks_02_diff_1k.jpg", { ...renderer.getSRGBFormats() });
  // var grassNormal = await renderer.loadTextureAsync(renderer.path + "assets/textures/aerial_rocks_02_1k/textures/aerial_rocks_02_nor_gl_1k.png");
  // var grassAlbedo = await renderer.loadTextureAsync(renderer.path + "assets/textures/Grass_001_SD/Grass_001_COLOR.jpg", { ...SRGBFormat });
  // var grassNormal = await renderer.loadTextureAsync(renderer.path + "assets/textures/Grass_001_SD/Grass_001_NORM.jpg");
  // var grassAlbedo = await renderer.loadTextureAsync(renderer.path + "assets/textures/brown_mud_leaves_01_2k_jpg/brown_mud_leaves_01_diff_2k.jpg", { ...SRGBFormat });
  // var grassNormal = await renderer.loadTextureAsync(renderer.path + "assets/textures/brown_mud_leaves_01_2k_jpg/brown_mud_leaves_01_Nor_2k.jpg");

  // var stoneAlbedo = await renderer.loadTextureAsync(renderer.path + "assets/textures/rocks_ground_06/diffuse.jpg", { ...SRGBFormat });
  // var stoneNormal = await renderer.loadTextureAsync(renderer.path + "assets/textures/rocks_ground_06/normal.png");

  let [
    grassAlbedoImage,
    grassNormalImage,
    stoneAlbedoImage,
    stoneNormalImage,
    snowAlbedoImage,
    snowNormalImage
  ] = await Promise.all([
    loadImage(renderer.path + "assets/textures/GroundForest003/GroundForest003_COL_VAR1_3K.jpg"),
    loadImage(renderer.path + "assets/textures/GroundForest003/GroundForest003_NRM_3K.jpg"),
    loadImage(renderer.path + "assets/textures/aerial_rocks_02_1k/textures/aerial_rocks_02_diff_1k.jpg"),
    loadImage(renderer.path + "assets/textures/aerial_rocks_02_1k/textures/aerial_rocks_02_nor_gl_1k.png"),
    loadImage(renderer.path + "assets/textures/Snow/albedo.jpg"),
    loadImage(renderer.path + "assets/textures/Snow/normal.jpg")
  ]);
  
  let SRGBFormat = renderer.getSRGBFormats();

  let grassAlbedo = renderer.loadTexture(grassAlbedoImage, { ...SRGBFormat });
  let grassNormal = renderer.loadTexture(grassNormalImage);
  let stoneAlbedo = renderer.loadTexture(stoneAlbedoImage, { ...SRGBFormat });
  let stoneNormal = renderer.loadTexture(stoneNormalImage);
  let snowAlbedo = renderer.loadTexture(snowAlbedoImage, { ...SRGBFormat });
  let snowNormal = renderer.loadTexture(snowNormalImage);

  let terrainMat = renderer.CreateLitMaterial({}, litTerrain);
  terrainMat.setUniform("roughness", 1);
  terrainMat.setUniform("albedoTextures[0]", [ grassAlbedo, stoneAlbedo, snowAlbedo ]);
  terrainMat.setUniform("normalTextures[0]", [ grassNormal, stoneNormal, snowNormal ]);

  await terrain.loadMaterials(terrainMat);

  const roadMaterial = await createRoadMaterial();

  const house = scene.add(await renderer.loadGLTF("./house.glb"));
  house.children[0].meshRenderer = house.children[0].meshRenderer.getInstanceMeshRenderer();

  generateRoadNetwork([
    1, 1, 1, 1, 1, 1, 1, 1,
    1, 2, 1, 0, 2, 0, 2, 1,
    1, 2, 1, 0, 0, 0, 0, 1,
    1, 1, 1, 1, 1, 1, 0, 1,
    1, 0, 1, 0, 2, 1, 2, 1,
    1, 0, 1, 0, 0, 1, 1, 1,
    1, 0, 1, 0, 2, 0, 0, 1,
    1, 1, 1, 1, 1, 1, 1, 1,
  ], 8, 8, {
    material: roadMaterial
  });

  // let track = await generateTrack({
  //   material: roadMaterial
  // });

  // let grass = await renderer.loadGLTF("grass1.glb");
  // grass.castShadows = false;
  // // grass.children[0].meshRenderer.materials[0].setUniform("albedo", [15, 15, 15, 1]);
  // grass.children[0].meshRenderer.materials[0].setUniform("albedo", [6, 8, 6, 1]);
  // let grassScatter = terrain.addScatter(grass);
  // grass.children[0].meshRenderer.materials[0].programContainer = renderer.programContainers.unlitInstanced;
  // grassScatter.spawnProbability = (origin) => {
  //   if (Vector.lengthSqr(new Vector(origin.x, 0, origin.z)) <= 162 ** 2 && track.curve.distanceSqrToPoint(origin).distance < (track.width / 2) ** 2) {
  //     return 0;
  //   }

  //   let p = 1 - smoothstep(origin.y, 80, 100);
  //   return p;
  // };

  // let tree = await renderer.loadGLTF("../assets/models/trees/stylizedAutumnBillboard.glb");
  // let tree = await renderer.loadGLTF("../assets/models/treePbrBillboard.glb");
  let tree = await renderer.loadGLTF("../assets/models/trees/wideTreeBillboard.glb");
  tree.children[0].meshRenderer.materials[0].setUniform("alphaCutoff", 0.5);
  // tree.children[0].meshRenderer.materials[0].programContainer = simpleFoliageProgram;
  let treeScatter = terrain.addScatter(tree, 4, 100, 10 * 10);
  tree.children[0].meshRenderer.materials[0].programContainer = renderer.programContainers.unlitInstanced;
  treeScatter.minScale = 1 * 4;
  treeScatter.maxScale = 1.8 * 4;
  treeScatter.cross = true;
  treeScatter.spawnProbability = (origin) => {
    if (Vector.lengthSqr(new Vector(origin.x, 0, origin.z)) <= 162 ** 2 && track.curve.distanceSqrToPoint(origin).distance < (track.width / 2) ** 2) {
      return 0;
    }

    let p = 1 - clamp(mapValue(origin.y, 10, 50, 1, 0), 0, 0.95);
    p *= 1 - smoothstep(origin.y, 60, 100);
    return p;
  };

  // let pebbles = await renderer.loadGLTF("../assets/models/rock.glb");
  // pebbles.castShadows = false;
  // let pebblesScatter = terrain.addScatter(pebbles, 2, 20);
  // pebblesScatter.minScale = 0.1;
  // pebblesScatter.maxScale = 0.15;
  // pebbles.children[0].meshRenderer.materials[0].doubleSided = false;
  // // pebbles.children[0].meshRenderer.materials[0].programContainer = renderer.programContainers.unlitInstanced;
  // pebblesScatter.spawnProbability = (origin) => {
  //   if (Vector.lengthSqr(new Vector(origin.x, 0, origin.z)) <= 162 ** 2 && track.curve.distanceSqrToPoint(origin).distance < (track.width / 2) ** 2) {
  //     return 0;
  //   }

  //   return smoothstep(origin.y, 10, 20);
  // };

  // let rocks = await renderer.loadGLTF("../assets/models/rock.glb");
  // let rocksScatter = terrain.addScatter(rocks, 2, 220, 10);
  // rocksScatter.minScale = 2;
  // rocksScatter.maxScale = 6;
  // rocks.children[0].meshRenderer.materials[0].doubleSided = false;
  // rocksScatter.spawnProbability = (origin) => {
  //   if (Vector.lengthSqr(new Vector(origin.x, 0, origin.z)) <= 162 ** 2 && track.curve.distanceSqrToPoint(origin).distance < (track.width / 2) ** 2) {
  //     return 0;
  //   }

  //   return 1;
  // };
  // // rocks.children[0].meshRenderer.materials[0].programContainer = renderer.programContainers.unlitInstanced;

  // Spawn in everything all at once
  terrain.chunkUpdatesPerFrame = 1e6;
  terrain.update();
  terrain.chunkUpdatesPerFrame = 1;

  let m = scene.add(renderer.CreateShape("sphere")).meshRenderer.materials[0];
  m.setUniform("roughness", 0);
  m.setUniform("metallic", 1);

  // await createChunks();

  // var tutorialSign = scene.add(await renderer.loadGLTF("tutorialSign.glb"));
  // tutorialSign.transform.position = new Vector(-2.7, 0, 3);
  // tutorialSign.transform.rotation = Quaternion.euler(0, Math.PI * 0.65, 0);

  // await loadMap();

  // Load all car models
  setProgress(currentTask++, totalTasks, "Loading car models");
  var models = {};
  var modelOffset = {};

  var i = 0;
  for (var key of allowedCars) {
    setProgress(currentTask++, totalTasks, `Loading car number ${i + 1}: ${key}`);

    var settings = carSettings[key];

    var model = await renderer.loadGLTF(settings.model);
    models[key] = model;

    var aabb = GetMeshAABB(model);
    modelOffset[key] = Vector.add(Vector.negate(aabb.getCenter()), new Vector(0, aabb.getSize().y / 2, 0));
    model.transform.position = Vector.add(new Vector(i * 5, 0.1, 0), modelOffset[key]);

    garageScene.add(model);

    i++;

    // break;
  }

  // Load car
  setProgress(currentTask++, totalTasks, "Setting up car");
  var carKey = allowedCars[0];
  var carModel = scene.add(models[carKey].copy());
  let trailer;
  var car;
  car = await loadCar(carSettings[carKey].settings, carModel);

  // var controlPoints = JSON.parse('[{"x":238.9905803198908,"y":11.010891524613218,"z":0},{"x":248.35707929750777,"y":12.723226116925797,"z":180.44198024083917},{"x":86.43430472565373,"y":2.3016814664524694,"z":266.0174367013337},{"x":-68.42980023211553,"y":0.19100462446428695,"z":210.60526962657337},{"x":-291.0143147923255,"y":11.280076252913517,"z":211.43427595496414},{"x":-367.37847338756524,"y":44.89847560608845,"z":4.4990887150972286e-14},{"x":-244.37662920532279,"y":21.023621965313925,"z":-177.55001396826387},{"x":-88.49153796618087,"y":6.502505256081859,"z":-272.34894957783365},{"x":75.79755225098485,"y":0.26559658178005546,"z":-233.28087872103728},{"x":209.2681935881474,"y":11.838977337235947,"z":-152.04224240064795}]');
  // var crCurve = new CatmullRomCurve(controlPoints, 0.5);
  // initRoad(crCurve);

  setProgress(currentTask++, totalTasks, "Finalizing physics colliders");
  physicsEngine.setupMeshCollider();

  // // Grass
  // setProgress(10, totalTasks, "Planting trees");
  // await loadGrass();

  // Reflection probe
  // if (car) {
  //   setProgress(currentTask++, totalTasks, "Generating cubemap");
  //   var cubemap = renderer.captureReflectionCubemap(Vector.add(car.rb.position, new Vector(0, 6, 0)));
  //   var oldSkybox = scene.skyboxCubemap;
  //   await scene.loadEnvironment({ cubemap });
  //   scene.skyboxCubemap = oldSkybox;
  //   scene.environmentIntensity = 1;
  // }

  if (!car) {
    var fallbackCamera = new OrbitCamera(renderer, { far: 10_000 });
  }

  var othersModels = {};

  ws = new WebSocket(`wss://${location.hostname}:8080`);
  ws.onerror = function() {
    sendLog("Disconnected");
  };
  ws.onopen = function() {
    console.log("Connected to server!");
    sendLog("Connected");

    setInterval(function() {
      if (car && car.rb) {
        sendMessage("updatePlayer", {
          position: car.rb.position,
          rotation: car.rb.rotation,
          velocity: car.rb.velocity,
          angularVelocity: car.rb.angularVelocity,
        });
        sendMessage("getAllPlayers");
      }
    }, 100);
  };
  ws.onmessage = async function(msg) {
    // console.log(msg);

    var parsed;
    try {
      parsed = JSON.parse(msg.data);
    }
    catch(e) {
      console.warn(e);
      return;
    }

    if (parsed.hasOwnProperty("type") && parsed.hasOwnProperty("data")) {
      if (parsed.type == "ping") {
        console.log(parsed.data);
      }
      else if (parsed.type == "playerAction") {
        switch (parsed.data.action) {
          case "join":
            console.log("Player has joined!", parsed.data.clientID);
            sendLog(`${parsed.data.clientID} has joined`);
            break;
          case "leave":
            console.log("Player has left!", parsed.data.clientID);
            sendLog(`${parsed.data.clientID} has left`);
            break;
        }
      }
      else if (parsed.type == "getAllPlayers") {
        for (let player of parsed.data) {
          let otherModel = othersModels[player.clientID];
          if (!otherModel) {
            let model = scene.add(models["skyline"].copy());
            let car = await loadCar(carSettings["skyline"].settings, model);
            car.activateAutoCountersteer = false;
            car.simulateFriction = false;

            othersModels[player.clientID] = otherModel = {
              model,
              car,
            };
          }

          let rb = otherModel.car.rb;
          let d = player.data;
          rb.position = d.position;
          rb.rotation = d.rotation;
          rb.velocity = d.velocity;
          rb.angularVelocity = d.angularVelocity;
        }
      }
    }
  };

  document.addEventListener("visibilitychange", function() {
    if (document.hidden) {
      paused = true;
    }

    handlePauseChange();
  }, false);

  setProgress(currentTask++, totalTasks, "Done!");

  settingsManager.loadSaveData();

  hideElement(loadingOverlay);

  if (settingsManager.getSettingValue("Show FPS")) {
    stats = new Stats();
    document.body.appendChild(stats.dom);
  }

  // createInspector(renderer);

  renderer.on("renderloop", function(frameTime, totalTime) {
    ui.clearScreen();

    handleInput(frameTime);

    if (renderer.getActiveScene() == scene) {
      if (!paused) {
        let currentCamera = car ? car.mainCamera : fallbackCamera.camera;

        // scene.updateLights();

        // terrain.update();
        terrain.update(currentCamera.transform);

        physicsEngine.update();
        if (car) {
          car.update(frameTime);
          car.renderUI(ui);
        }

        renderer.update(frameTime); // scene.update(frameTime);
        renderer.render(currentCamera/*, [ snowCamera ]*/);
      }
    }
    else {
      var carRotQuat = Quaternion.euler(0, carRotation, 0);

      garageScene.root.getChild("spin", true).transform.rotation = carRotQuat;

      var i = 0;
      for (var key in models) {
        var model = models[key];

        var target = Vector.add(new Vector((i - selectedCar) * 20, 0.1, 0), modelOffset[key]);
        Vector.addTo(model.transform.position, Vector.multiply(Vector.subtract(target, model.transform.position), 0.3));
      
        model.transform.rotation = carRotQuat;

        model.visible = selectedCar == i;

        i++;
      }

      carRotation += frameTime * 0.1;

      renderer.update(frameTime);
      if (!paused) renderer.render(garageCamera);
    }

    stats?.update();
  });

  window.renderer = renderer;
  window.scene = scene;
  window.physicsEngine = physicsEngine;
  window.car = car;

  function isDay(day) {
    if (day) {
      scene.environmentIntensity = 1.25;
      scene.sunIntensity = {x: 30, y: 24, z: 18};//Vector.fromArray(Light.kelvinToRgb(5500, 27));
      // grass.children[0].meshRenderer.materials[0].setUniform("albedo", [2, 2, 2, 1]);
    }
    else {
      scene.fogDensity = 0.005;
      scene.environmentIntensity = 0.01;
      scene.sunIntensity = Vector.fill(0.25);
      // grass.children[0].meshRenderer.materials[0].setUniform("albedo", [0.1, 0.1, 0.1, 1]);
    }
  }

  window.selectCar = async function() {
    if (loadedCar !== selectedCar) {
      var oldPosition = Vector.copy(car.rb.position);
      oldPosition.y = 0;

      car.destroy();
      if (trailer) {
        trailer.destroy();
      }

      var key = Object.keys(models)[selectedCar];
      var currentCarSettings = carSettings[key];
      var carModel = scene.add(models[key].copy());
      car = await loadCar(currentCarSettings.settings, carModel);

      // var key = Object.keys(models)[selectedCar];
      // var currentCarSettings = carSettings[key];
      // car = new Car(scene, physicsEngine, {
      //   path: renderer.path,
      //   keybindings,

      //   ...currentCarSettings.settings
      // });

      // car.resetPosition = Vector.copy(carResetPosition);

      // var carModel = scene.add(models[key].copy());
      // carModel.transform.matrix = Matrix.identity();
      // car.setup(carModel);

      // car.gameObject.traverse(gameObject => {
      //   if (gameObject.meshRenderer) {
      //     var mats = gameObject.meshRenderer.materials;
      //     for (var mat of mats) {
      //       if (mat.name.toLowerCase() == "carpaint") {
      //         var i = mats.indexOf(mat);
      //         mats[i] = paints.darkgray;
      //         mats[i].setUniform("flakeScale", 50);
      //       }
  
      //       mat.doubleSided = false;
      //       mat.doubleSidedShadows = false;
      //     }
      //   }
      // });

      // car.rb.position = Vector.subtract(oldPosition, car.bottomOffset);

      loadedCar = selectedCar;
    }

    selectCarButton.disabled = loadedCar == selectedCar;
  };

  window.gotoPlayground = function() {
    setActiveScene(scene);
    window.resume();
  };

  window.gotoGarage = function() {
    setActiveScene(garageScene);
    window.resume();
  };

  window.resetCar = function() {
    // car.reset();
    // car.rb.position = Vector.copy(car.resetPosition);
    // car.rb.rotation = Quaternion.copy(car.resetRotation);

    // car.gameObject.transform.position = car.rb.position;
    // car.gameObject.transform.rotation = car.rb.rotation;

    // car.rb.position.y = terrain.getHeight(car.rb.position.x, car.rb.position.z) + 1;

    car.resetGame();
    window.resume();
  };

  window.resume = function() {
    paused = false;
    handlePauseChange();
  };

  window.openSettings = function() {
    settingsOpened = true;
    hideElement(pauseOverlay);
    showElement(settingsOverlay);
    controllerUIInteraction.selectFirstElement();
  };

  window.goBack = function() {
    if (settingsOpened) {
      hideElement(settingsOverlay);
      showElement(pauseOverlay);
      controllerUIInteraction.selectFirstElement();

      settingsOpened = false;
      return;
    }

    if (paused) {
      paused = false;
      handlePauseChange();
      return;
    }
  };

  function setProgress(currentTask, totalTasks, textStatus) {
    if (lastTextStatus) {
      console.timeEnd(lastTextStatus);
    }
    if (currentTask < totalTasks) {
      console.time(textStatus);
    }
    lastTextStatus = textStatus;

    progressBar.querySelector(".progress").style.width = `${currentTask / totalTasks * 100}%`;
    progressStatus.textContent = `${textStatus} (${currentTask}/${totalTasks})`;
  }

  function handleInput(frameTime) {
    if (settingsOpened && keybindings.getInputDown("back")) {
      hideElement(settingsOverlay);
      showElement(pauseOverlay);
      controllerUIInteraction.selectFirstElement();

      settingsOpened = false;
      return;
    }

    if (paused && keybindings.getInputDown("back")) {
      paused = false;
      handlePauseChange();
      return;
    }

    if (keybindings.getInputDown("pause") && !settingsOpened) {
      paused = !paused;
      handlePauseChange();
      return;
    }

    if (!paused && renderer.getActiveScene() == garageScene) {
      if (keybindings.getInputDown("back")) {
        window.gotoPlayground();
      }
      if (keybindings.getInputDown("garagePrev")) {
        garageChangeCar(-1);
      }
      if (keybindings.getInputDown("garageNext")) {
        garageChangeCar(1);
      }
      if (keybindings.getInputDown("menuSelect")) {
        window.selectCar();
      }

      carRotation += -quadraticCurve(deadZone(gamepadManager.getAxis("RSHorizontal"), 0.08)) * frameTime * 5;
    }

    controllerUIInteraction.update(frameTime);
  }

  function garageChangeCar(dir = 1) {
    selectedCar += dir;
    selectedCar = clamp(selectedCar, 0, Object.keys(models).length - 1);

    selectCarButton.disabled = loadedCar == selectedCar;
    setCarName();
  }

  function handlePauseChange() {
    if (paused) {
      car.freeze();

      showElement(pauseOverlay);
      controllerUIInteraction.deselectElement();
      controllerUIInteraction.selectFirstElement();
    }
    else {
      car.unfreeze();
      hideElement(pauseOverlay);

      if (car.mainGainNode) {
        if (renderer.getActiveScene() != scene) {
          car.mainGainNode.gain.value = 0;
        }
        else {
          car.mainGainNode.gain.value = settingsManager.getSettingValue("masterVolume");
        }
      }
    }
  }

  function setActiveScene(_scene) {
    renderer.setActiveScene(_scene);

    document.querySelectorAll(".menu > div").forEach(e => hideElement(e));
    showElement(document.querySelector(".menu > ." + _scene.name));
    
    if (_scene == garageScene) {
      showElement(garageOverlay);
      setCarName();
    }
    else {
      hideElement(garageOverlay);
    }
  }

  function setCarName() {
    let cs = carSettings[Object.keys(models)[selectedCar]];
    let css = cs.settings;

    garageOverlay.querySelector(".carName").textContent = cs.name;
    garageOverlay.querySelectorAll(".stats .value")[0].textContent = `${css.torque} Nm` ?? "UNKNOWN";
    garageOverlay.querySelectorAll(".stats .value")[1].textContent = `${css.mass} kg` ?? "UNKNOWN";
    garageOverlay.querySelectorAll(".stats .value")[2].textContent = css.drivetrain ?? "UNKNOWN";
    garageOverlay.querySelectorAll(".stats .value")[3].textContent = Object.keys(Car.ENUMS.DIFFERENTIAL).find(key => Car.ENUMS.DIFFERENTIAL[key] === css.differential) ?? "UNKNOWN";
    garageOverlay.querySelectorAll(".stats .value")[4].textContent = css.friction ?? "UNKNOWN";
  }

  async function loadCar(settings, model) {
    var car = new Car(scene, physicsEngine, {
      path: renderer.path,
      keybindings,
      controlScheme: Car.ControlScheme.Controller,

      ...settings
    });

    // model.castShadows = false;
    model.transform.matrix = Matrix.identity();
    await car.setup(model);

    // car.gameObject.castShadows = false;

    car.gameObject.traverse(gameObject => {
      if (gameObject.meshRenderer) {
        var mats = gameObject.meshRenderer.materials;
        for (var mat of mats) {
          if (mat.name.toLowerCase() == "carpaint") {
            var i = mats.indexOf(mat);
            mats[i] = paints.darkgray;
            mats[i].setUniform("flakeScale", 50);

            // mat.setUniform("albedo", [1, 0, 0, 1]);
            // mat.setUniform("metallic", 1);
            // mat.setUniform("roughness", 0.2);
          }

          mat.uniforms["enableMotionBlur"] = 0;

          // mat.setUniform("roughness", 0);

          mat.doubleSided = false;
          mat.doubleSidedShadows = false;
        }
      }
    });

    car.wheels.map(w => {
      w.model.setLayer(0b10, true);
    });

    // var resetPosition = Vector.copy(carResetPosition);
    // resetPosition.y = terrain.getHeight(resetPosition.x, resetPosition.z) + 0.5;

    // var spawnPoints = map.getChildren("SpawnPoint", true, false);
    var spawnPoint = null;//randomFromArray(spawnPoints);
    var carResetPosition = spawnPoint ? Vector.subtract(spawnPoint.transform.worldPosition, car.bottomOffset) : new Vector(0, 10, 0);
    // carResetPosition = new Vector(0, terrain.getHeight(0, 0) + 3, 0);
    carResetPosition = track.curve.getPoint(0);
    carResetPosition.y = terrain.getHeight(carResetPosition.x, carResetPosition.z) - car.bottomOffset.y + car.wheels[0].suspensionTravel + 5;

    car.resetPosition = Vector.copy(carResetPosition);
    car.rb.position = Vector.copy(carResetPosition);
    car.gameObject.transform.position = Vector.copy(carResetPosition);

    let diff = Vector.subtract(track.curve.getPoint(0), track.curve.getPoint(0.001));
    let angle = -Math.atan2(diff.z, diff.x) + Math.PI / 2;
    car.resetRotation = Quaternion.angleAxis(angle, Vector.up());
    car.rb.rotation = Quaternion.angleAxis(angle, Vector.up());

    car.mainCamera = new Camera({near: 0.1, far: 15000, fov: 35});
    car.mainCamera.setAspect(renderer.aspect);

    car.ABS = settingsManager.getSettingValue("abs");
    car.TCS = settingsManager.getSettingValue("tcs");
    car.activateAutoCountersteer = settingsManager.getSettingValue("steeringAssist");
    car.autoCountersteer = settingsManager.getSettingValue("autoCountersteer");
    car.autoCountersteerVelocityMultiplier = settingsManager.getSettingValue("autoCountersteerVelocityMultiplier");
    car.followCamera.followMode = settingsManager.getSettingValue("cameraFollowMode");
    car.mainGainNode.gain.value = settingsManager.getSettingValue("masterVolume");

    // // Trailer
    // trailer = new Trailer(scene, physicsEngine, {
    //   mass: 300,
    // });
    // await trailer.setup("../assets/models/trailer2wheels.glb");
    // trailer.rb.position = Vector.add(car.rb.position, new Vector(0, 0, -3.8));

    // setTimeout(function() {
    //   let trailerJoint = new DistanceConstraint(car.rb, new Vector(0, -0.25, -2.5), trailer.rb, new Vector(0, -0.12, 1.3));
    //   physicsEngine.add(trailerJoint);
    // }, 3000);

    return car;
  }

  function getHeightFromImage(u, v, imageData, imageRes, maxHeight) {
    u = clamp(u, 0, imageRes - 1);
    v = clamp(v, 0, imageRes - 1);

    var indexOffset = (u + v * imageRes) * 4;
    var remappedHeight = imageData[indexOffset + 0] + imageData[indexOffset + 1] / 255;
    var height = remappedHeight * maxHeight / 255;

    return height;
  }

  function generateTerrainHeightmap(imageRes = 256, maxHeight = 400) {
    var terrainBounds = 500;

    var controlPoints = [];
    for (var i = 0; i < Math.PI * 2; i += Math.PI * 2 / 10) {
      let r = 300 + (Math.random() - 0.5) * 200;

      var controlPoint = new Vector(
        r * Math.cos(i),
        0,
        r * Math.sin(i)
      );
      controlPoint.y = terrain.getHeightBeforeCurve(controlPoint.x, controlPoint.z);

      controlPoints.push(controlPoint);
    }

    var crCurve = new CatmullRomCurve(controlPoints, 0.5);

    var perlin = new Perlin();

    var canvas = document.createElement("canvas");
    canvas.width = canvas.height = imageRes;
    var ctx = canvas.getContext("2d");
    const imageData = ctx.createImageData(imageRes, imageRes);

    for (var u = 0; u < imageRes; u++) {
      for (var v = 0; v < imageRes; v++) {
        var x = mapValue(u, 0, imageRes - 1, -terrainBounds, terrainBounds);
        var z = mapValue(v, 0, imageRes - 1, -terrainBounds, terrainBounds);
        var height = getHeight(x, z);

        if (height < 0 || height > maxHeight) {
          console.warn("Height outside range!", height);
        }

        height = clamp(height, 0, maxHeight);

        var h = height / maxHeight * 255;
        var r = Math.floor(h);
        var g = (h % 1) * 255;

        var indexOffset = (u + v * imageRes) * 4;
        imageData.data[indexOffset + 0] = r;
        imageData.data[indexOffset + 1] = g;
        imageData.data[indexOffset + 2] = 0;
        imageData.data[indexOffset + 3] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);
    return canvas;

    function LayeredNoise(x, y, octaves = 4) {
      var noise = 0;
      var frequency = 1;
      var factor = 1;

      var persistance = 0.4;
      var roughness = 3;

      for (var i = 0; i < octaves; i++) {
        noise += perlin.noise(x * frequency + i * 0.72354, y * frequency + i * 0.72354) * factor;
        factor *= persistance;
        frequency *= roughness;
      }

      return noise;
    }

    function getHeight(i, j) {
      var power = 1.5;
      var noiseLayers = 2;
      var noiseScale = 0.001;
      var height = 100;

      var heightFalloff = 1;//1 - clamp((Vector.length(new Vector(i, j)) - 400) * 0.005, 0, 1);
      var elevation = Math.pow(Math.abs(LayeredNoise(i * noiseScale, j * noiseScale, noiseLayers)), power) * height * heightFalloff;

      var w = 15;
      var d = crCurve.distanceSqrToPoint(new Vector(i, 0, j));
      if (!d.point) {
        console.log(d);
      }

      return lerp(d.point?.y ?? 0, elevation, clamp(
        (d.distance - w * w) / 2500,
        0, 1
      ));

      // return elevation;
    }
  }

  async function createRoadMaterial() {
    let [
      albedoImage,
      normalImage,
      metallicRoughnessImage
    ] = await Promise.all([
      loadImage("../assets/textures/roadNoCenterLine/albedo.png"),
      loadImage("../assets/textures/roadNoCenterLine/normal.png"),
      loadImage("../assets/textures/roadNoCenterLine/metallicRoughness.png")
    ]);

    let roadMaterial = renderer.CreateLitMaterial({
      albedo: [0.3, 0.3, 0.3, 1],
      albedoTexture: await renderer.loadTexture(albedoImage, { ...renderer.getSRGBFormats(), anisotropicFiltering: true }),
      normalTexture: await renderer.loadTexture(normalImage, { anisotropicFiltering: true }),
      metallicRoughnessTexture: await renderer.loadTexture(metallicRoughnessImage, { anisotropicFiltering: true }),
      metallic: 0.5,
      // roughness: 2,
      // albedoTexture: renderer.loadTexture("../assets/textures/asphalt_01_1k/asphalt_01_diff_1k.jpg", { ...renderer.getSRGBFormats() }),
      // normalTexture: renderer.loadTexture("../assets/textures/asphalt_01_1k/asphalt_01_nor_gl_1k.png"),
    });

    return roadMaterial;
  }

  async function generateTrack(settings = {}) {
    const material = settings.material;
    const trackWidth = settings.trackWidth ?? 18;

    let flipUV = false;
    let uvScale = 1;

    let points = [];

    let curveRes = 10;
    for (let i = 0; i < curveRes; i++) {
      let angle = i / curveRes * Math.PI * 2;
      let radius = 100 + (Math.random() - 0.5) * 2 * 10;
      points.push(new Vector(
        Math.cos(angle) * radius,
        0,
        Math.sin(angle) * radius
      ));
    }

    let roadCurve = new CatmullRomCurve(points, 0.5, true);

    // Road
    extrudeCurve(roadCurve, [
      { x: -trackWidth / 2, y: 0.03 },
      { x: trackWidth / 2, y: 0.03 }
    ], {
      material,
      segments: 300,
      uvScale: [2, 2 / trackWidth],
    });

    // Barriers
    extrudeCurve(roadCurve, [
      { x: -trackWidth / 2 - 3, y: -1 },
      { x: -trackWidth / 2 - 3, y: 1 },
      { x: -trackWidth / 2 + 0.5 - 3, y: 1 },
      { x: -trackWidth / 2 + 0.5 - 3, y: -1 },
      
      { x: trackWidth / 2 - 0.5 + 3, y: -1 },
      { x: trackWidth / 2 - 0.5 + 3, y: 1 },
      { x: trackWidth / 2 + 3, y: 1 },
      { x: trackWidth / 2 + 3, y: -1 },
    ], {
      material,
      segments: 100,
      uvScale: [1, 1 / trackWidth],
    });

    return {
      width: trackWidth,
      curve: roadCurve
    };

    function generateRoad(chunkCenter, crCurve, width = 12, segments = 100) {
      var container = new GameObject("Chunk");
      container.transform.position = chunkCenter;

      // Road
      var road = new GameObject("Road");

      var distanceAlongPath = 0;

      var indices = [];
      var vertices = [];
      var uvs = [];

      var groundIndices = [];
      var groundVertices = [];
      var groundUVs = [];

      var groundCounter = 0;
      var step = 1 / segments;
      for (let s = 0; s < segments; s++) {
        let t = s / (segments - 1);
        let center = crCurve.getPoint(t);

        let diff = Vector.subtract(
          center,
          crCurve.getPoint(t - step),
        );
        // let diff = Vector.subtract(
        //   crCurve.getPoint(t + step),
        //   center
        // );
        let tangent = Vector.normalize(diff);

        let normal = Quaternion.QxV(Quaternion.angleAxis(Math.PI / 2, tangent), Vector.up());
        
        var edge = Vector.multiply(normal, width / 2); // inner edge
        var margin = Vector.multiply(normal, width / 2 * 1.4); // outer edge

        var e1 = Vector.add(center, edge);
        var m1 = Vector.add(center, margin);
        m1.y -= width * 0.06;
        var e2 = Vector.subtract(center, edge);
        var m2 = Vector.subtract(center, margin);
        m2.y -= width * 0.06;

        // Shrinkwrap to terrain
        // center.y = terrain.getHeight(chunkCenter.x + center.x, chunkCenter.z + center.z);
        e1.y = terrain.getHeight(chunkCenter.x + e1.x, chunkCenter.z + e1.z) + 0.01;
        e2.y = terrain.getHeight(chunkCenter.x + e2.x, chunkCenter.z + e2.z) + 0.01;
        m1.y = terrain.getHeight(chunkCenter.x + m1.x, chunkCenter.z + m1.z) - 0.5;
        m2.y = terrain.getHeight(chunkCenter.x + m2.x, chunkCenter.z + m2.z) - 0.5;

        vertices.push(m1.x, m1.y, m1.z);
        vertices.push(e1.x, e1.y, e1.z);
        vertices.push(e1.x, e1.y, e1.z);
        vertices.push(e2.x, e2.y, e2.z);
        vertices.push(e2.x, e2.y, e2.z);
        vertices.push(m2.x, m2.y, m2.z);

        var v = distanceAlongPath / width;

        if (flipUV) {
          uvs.push(v * uvScale, -0.4 * uvScale);
          uvs.push(v * uvScale, 0 * uvScale);
          uvs.push(v * uvScale, 0 * uvScale);
          uvs.push(v * uvScale, 1 * uvScale);
          uvs.push(v * uvScale, 1 * uvScale);
          uvs.push(v * uvScale, 1.4 * uvScale);
        }
        else {
          uvs.push(-0.4 * uvScale, v * uvScale);
          uvs.push(0 * uvScale, v * uvScale);
          uvs.push(0 * uvScale, v * uvScale);
          uvs.push(1 * uvScale, v * uvScale);
          uvs.push(1 * uvScale, v * uvScale);
          uvs.push(1.4 * uvScale, v * uvScale);
        }
        
        var mountainHeight = (perlin.noise(0, 0, (chunkCenter.z + center.z) * 0.01) + 1) / 2;

        // var farEdge = Vector.multiply(normal, width * 2);
        var steepness = 1.6;//0.2 + (perlin.noise(0, 0, center.z * 0.07) + 1) / 2 * 4;
        var l1 = Vector.add(e1, new Vector(-width * steepness, width * 0.4 * mountainHeight, 0));
        var ll1 = Vector.add(e1, new Vector(-width * 8, width * 0.55 * mountainHeight, 0));
        var l2 = Vector.add(e2, new Vector(width * steepness, width * 0.4 * mountainHeight, 0));
        var ll2 = Vector.add(e2, new Vector(width * 8, width * 0.55 * 5 * mountainHeight, 0));

        if (groundCounter % 3 == 0) {
          groundVertices.push(ll1.x, ll1.y, ll1.z);
          groundVertices.push(l1.x, l1.y, l1.z);
          groundVertices.push(e1.x, e1.y, e1.z);
          groundVertices.push(e2.x, e2.y, e2.z);
          groundVertices.push(l2.x, l2.y, l2.z);
          groundVertices.push(ll2.x, ll2.y, ll2.z);

          groundUVs.push(-8 * 4, v * 4);
          groundUVs.push(-4 * 4, v * 4);
          groundUVs.push(0 * 4, v * 4);
          groundUVs.push(1 * 4, v * 4);
          groundUVs.push(3 * 4, v * 4);
          groundUVs.push(9 * 4, v * 4);
        }
        groundCounter++;

        distanceAlongPath += Vector.length(diff);
      }

      for (var i = 0; i < (vertices.length / 3 / 6 - 1) * 6; i += 6) {
        // for (var i = 0; i < vertices.length / 3 * 3; i += 6) {
        var w = 10000000000;//vertices.length / 3;
        indices.push(
          (i + 0) % w,
          (i + 6) % w,
          (i + 1) % w,

          (i + 1) % w,
          (i + 6) % w,
          (i + 7) % w,

          (i + 2) % w,
          (i + 8) % w,
          (i + 3) % w,

          (i + 3) % w,
          (i + 8) % w,
          (i + 9) % w,

          (i + 4) % w,
          (i + 10) % w,
          (i + 5) % w,

          (i + 5) % w,
          (i + 10) % w,
          (i + 11) % w,
        );
      }

      for (let i = 0; i < (groundVertices.length / 3 / 6 - 1) * 6; i += 6) {
        let v = 6;
        for (let j = 0; j < 5; j++) {
          if (j == 2) continue;

          groundIndices.push(
            (i + 0 + j),
            (i + v + j),
            (i + 1 + j),
  
            (i + 1 + j),
            (i + v + j),
            (i + v + 1 + j),
          );
        }
      }

      var roadMeshData = new renderer.MeshData({
        indices: {
          bufferData: new Uint32Array(indices),
          target: renderer.gl.ELEMENT_ARRAY_BUFFER
        },
        position: {
          bufferData: new Float32Array(vertices),
          size: 3
        },
        uv: {
          bufferData: new Float32Array(uvs),
          size: 2
        }
      });
      roadMeshData.recalculateNormals();
      roadMeshData.recalculateTangents();

      road.meshRenderer = new renderer.MeshRenderer(roadMaterial, roadMeshData);
      road.addComponent(new MeshCollider());
      road.transform.position.y = 0.04;
      container.addChild(road);

      scene.add(container);

      return container;
    }
  }

  function extrudeCurve(curve, offsets, settings = {}) {
    let segments = settings.segments ?? 100;
    let material = settings.material ?? renderer.CreateLitMaterial();
    let uvScale = settings.uvScale ?? [ 1, 1 ];

    let gameObject = new GameObject("Extruded curve");

    let indices = [];
    let vertices = [];
    let uvs = [];

    let vps = offsets.length;
    let step = 1 / segments;

    let distanceAlongPath = 0;

    for (let s = 0; s < segments; s++) {
      let t = s / (segments - 1);
      let center = curve.getPoint(t);

      let diff;
      if (s === 0 && !curve.loop) {
        diff = Vector.subtract(
          curve.getPoint(t + step),
          center,
        );
      }
      else {
        diff = Vector.subtract(
          center,
          curve.getPoint(t - step),
        );
      }

      let tangent = Vector.normalize(diff);
      let normal = Quaternion.QxV(Quaternion.angleAxis(Math.PI / 2, tangent), Vector.up());
      
      for (let i = 0; i < offsets.length; i++) {
        const offsetVector = offsets[i];
        let worldOffset = Vector.copy(center);
        Vector.addTo(worldOffset, Vector.multiply(normal, offsetVector.x));

        // Shrinkwrap to terrain
        worldOffset.y = terrain.getHeight(worldOffset.x, worldOffset.z) + 0.01;

        worldOffset.y += offsetVector.y;

        vertices.push(worldOffset.x, worldOffset.y, worldOffset.z);

        uvs.push(
          i / (vps - 1) * uvScale[0],
          distanceAlongPath * uvScale[1]
        );
      }

      // Shrinkwrap to terrain
      // e1.y = terrain.getHeight(chunkCenter.x + e1.x, chunkCenter.z + e1.z) + 0.01;
      // e2.y = terrain.getHeight(chunkCenter.x + e2.x, chunkCenter.z + e2.z) + 0.01;
      // m1.y = terrain.getHeight(chunkCenter.x + m1.x, chunkCenter.z + m1.z) - 0.5;
      // m2.y = terrain.getHeight(chunkCenter.x + m2.x, chunkCenter.z + m2.z) - 0.5;

      // var v = distanceAlongPath / 20;

      // if (flipUV) {
      //   uvs.push(v * uvScale, -0.4 * uvScale);
      //   uvs.push(v * uvScale, 0 * uvScale);
      //   uvs.push(v * uvScale, 0 * uvScale);
      //   uvs.push(v * uvScale, 1 * uvScale);
      //   uvs.push(v * uvScale, 1 * uvScale);
      //   uvs.push(v * uvScale, 1.4 * uvScale);
      // }
      // else {
      //   uvs.push(-0.4 * uvScale, v * uvScale);
      //   uvs.push(0 * uvScale, v * uvScale);
      //   uvs.push(0 * uvScale, v * uvScale);
      //   uvs.push(1 * uvScale, v * uvScale);
      //   uvs.push(1 * uvScale, v * uvScale);
      //   uvs.push(1.4 * uvScale, v * uvScale);
      // }

      distanceAlongPath += Vector.length(diff);
    }
    
    for (var i = 0; i < (vertices.length / 3 / vps - 1) * vps; i += vps) {
      for (let j = 0; j < vps - 1; j++) {
        indices.push(
          j + i + 0,
          j + i + 1,
          j + i + vps,

          j + i + 1,
          j + i + vps + 1,
          j + i + vps,
        );
      }
    }

    let meshData = new renderer.MeshData({
      indices: {
        bufferData: new Uint32Array(indices),
        target: renderer.gl.ELEMENT_ARRAY_BUFFER
      },
      position: {
        bufferData: new Float32Array(vertices),
        size: 3
      },
      uv: {
        bufferData: new Float32Array(uvs),
        size: 2
      }
    });
    meshData.recalculateNormals();
    meshData.recalculateTangents();

    gameObject.meshRenderer = new renderer.MeshRenderer(material, meshData);
    gameObject.addComponent(new MeshCollider());

    scene.add(gameObject);

    return gameObject;
  }

  function generateRoadNetwork(data, dataWidth, dataHeight, settings = {}) {
    const material = settings.material ?? renderer.CreateLitMaterial();
    const chunkSize = settings.chunkSize ?? 25;
    
    const flatIndex = (i, j) => i * dataWidth + j;

    const indicesToPosition = (i, j) => {
      return new Vector(i * chunkSize, 0.04, j * chunkSize);
    };

    const hasRoad = (i, j) => {
      if (i < 0 || i >= dataWidth || j < 0 || j >= dataHeight) {
        return false;
      }

      return data[flatIndex(i, j)] === 1;
    };

    const generateChunk = (i, j) => {
      const position = indicesToPosition(i, j);

      if (data[flatIndex(i, j)] === 2) {
        house.children[0].meshRenderer.addInstance(Matrix.translate(position));
        return;
      }

      if (!hasRoad(i, j)) {
        return;
      }

      let neighbours = 0;
      neighbours += hasRoad(i - 1, j);
      neighbours += hasRoad(i + 1, j);
      neighbours += hasRoad(i, j - 1);
      neighbours += hasRoad(i, j + 1);

      if (neighbours === 4) {
        generate4wayIntersection(position, { material, chunkSize });
        return;
      }

      if (neighbours === 3) {
        const isAEmpty = !hasRoad(i + 1, j);
        const isBEmpty = !hasRoad(i, j + 1);
        const isCEmpty = !hasRoad(i - 1, j);
        const isDEmpty = !hasRoad(i, j - 1);

        const piece = generate3wayIntersection(position, { material, chunkSize });
        if (isAEmpty)      piece.transform.rotation = Quaternion.euler(0, 0, 0);
        else if (isBEmpty) piece.transform.rotation = Quaternion.euler(0, -Math.PI * 0.5, 0);
        else if (isCEmpty) piece.transform.rotation = Quaternion.euler(0, -Math.PI, 0);
        else if (isDEmpty) piece.transform.rotation = Quaternion.euler(0, -Math.PI * 1.5, 0);

        return;
      }

      if (neighbours === 2) {
        const straightA = hasRoad(i - 1, j) && hasRoad(i + 1, j);
        const straightB = hasRoad(i, j - 1) && hasRoad(i, j + 1);
        const isStraight = straightA || straightB;

        if (isStraight) {
          const piece = generateStraightRoad(position, { material, chunkSize });
          if (straightB) {
            piece.transform.rotation = Quaternion.euler(0, Math.PI / 2, 0);
          }
        }
        else {
          const isTurnA = hasRoad(i, j - 1) && hasRoad(i - 1, j);
          const isTurnB = hasRoad(i, j - 1) && hasRoad(i + 1, j);
          const isTurnC = hasRoad(i, j + 1) && hasRoad(i + 1, j);
          const isTurnD = hasRoad(i, j + 1) && hasRoad(i - 1, j);

          const piece = generateTurn(position, { material, chunkSize });
          if (isTurnA)      piece.transform.rotation = Quaternion.euler(0, 0, 0);
          else if (isTurnB) piece.transform.rotation = Quaternion.euler(0, -Math.PI * 0.5, 0);
          else if (isTurnC) piece.transform.rotation = Quaternion.euler(0, -Math.PI, 0);
          else if (isTurnD) piece.transform.rotation = Quaternion.euler(0, -Math.PI * 1.5, 0);
        }

        return;
      }
    };

    for (let i = 0; i < dataWidth; i++) {
      for (let j = 0; j < dataHeight; j++) {
        generateChunk(i, j);
      }
    }
  }

  function generateTurn(position, settings = {}) {
    const gameObject = new GameObject("Turn");

    const indices = [];
    const vertices = [];
    const uvs = [];

    const material = settings.material ?? renderer.CreateLitMaterial();
    const chunkSize = settings.chunkSize ?? 20;
    const roadWidth = settings.roadWidth ?? 12;
    const cornerResolution = settings.cornerResolution ?? 15;

    const offset = new Vector(-chunkSize / 2, 0, -chunkSize / 2);

    for (let i = 0; i < cornerResolution; i++) {
      const angle = i / (cornerResolution - 1) * Math.PI / 2;
      const y = offset.y;

      let cornerRadius = (chunkSize - roadWidth) / 2;
      let x = offset.x + Math.cos(angle) * cornerRadius;
      let z = offset.z + Math.sin(angle) * cornerRadius;
      vertices.push(x, y, z);

      cornerRadius = (chunkSize - roadWidth) / 2 + roadWidth;
      x = offset.x + Math.cos(angle) * cornerRadius;
      z = offset.z + Math.sin(angle) * cornerRadius;
      vertices.push(x, y, z);

      const distanceAlongRoad = i / (cornerResolution - 1);
      uvs.push(0, distanceAlongRoad);
      uvs.push(1, distanceAlongRoad);
    }

    for (let i = 0; i < cornerResolution - 1; i++) {
      indices.push(
        i * 2 + 0,
        i * 2 + 2,
        i * 2 + 1,

        i * 2 + 2,
        i * 2 + 3,
        i * 2 + 1,
      );
    }

    const meshData = new renderer.MeshData({
      indices: {
        bufferData: new Uint32Array(indices),
        target: renderer.gl.ELEMENT_ARRAY_BUFFER
      },
      position: {
        bufferData: new Float32Array(vertices),
        size: 3
      },
      uv: {
        bufferData: new Float32Array(uvs),
        size: 2
      }
    });
    meshData.recalculateNormals();
    meshData.recalculateTangents();

    gameObject.transform.position = position;
    gameObject.meshRenderer = new renderer.MeshRenderer(material, meshData);
    gameObject.addComponent(new MeshCollider());

    scene.add(gameObject);

    return gameObject;
  }

  function generateStraightRoad(position, settings = {}) {
    const gameObject = new GameObject("Straight road");

    const indices = [];
    const vertices = [];
    const uvs = [];

    const material = settings.material ?? renderer.CreateLitMaterial();
    const chunkSize = settings.chunkSize ?? 20;
    const roadWidth = settings.roadWidth ?? 12;
    const uvStretch = Math.round(chunkSize / roadWidth);

    vertices.push(
      -chunkSize / 2,
      0,
      -roadWidth / 2
    );
    vertices.push(
      chunkSize / 2,
      0,
      -roadWidth / 2
    );
    vertices.push(
      chunkSize / 2,
      0,
      roadWidth / 2
    );
    vertices.push(
      -chunkSize / 2,
      0,
      roadWidth / 2
    );

    uvs.push(0, 0);
    uvs.push(0, 1 * uvStretch);
    uvs.push(1, 1 * uvStretch);
    uvs.push(1, 0);

    indices.push(
      0,
      2,
      1
    );
    indices.push(
      0,
      3,
      2
    );

    const meshData = new renderer.MeshData({
      indices: {
        bufferData: new Uint32Array(indices),
        target: renderer.gl.ELEMENT_ARRAY_BUFFER
      },
      position: {
        bufferData: new Float32Array(vertices),
        size: 3
      },
      uv: {
        bufferData: new Float32Array(uvs),
        size: 2
      }
    });
    meshData.recalculateNormals();
    meshData.recalculateTangents();

    gameObject.transform.position = position;
    gameObject.meshRenderer = new renderer.MeshRenderer(material, meshData);
    gameObject.addComponent(new MeshCollider());

    scene.add(gameObject);

    return gameObject;
  }

  function generate4wayIntersection(position, settings = {}) {
    const gameObject = new GameObject("4-way intersection");

    const indices = [];
    const vertices = [];
    const uvs = [];

    const material = settings.material ?? renderer.CreateLitMaterial();
    const chunkSize = settings.chunkSize ?? 20;
    const roadWidth = settings.roadWidth ?? 12;
    const cornerResolution = settings.cornerResolution ?? 15;
    const cornerRadius = (chunkSize - roadWidth) / 2;

    const createCorner = (position, angleOffset) => {
      const vertexOffset = vertices.length / 3;

      const angle = angleOffset + Math.PI / 4;
      const diagonal = Math.sqrt(2) * cornerRadius;
      const x = position.x + Math.cos(angle) * diagonal;
      const z = position.z + Math.sin(angle) * diagonal;
      vertices.push(
        x,
        position.y,
        z
      );
      uvs.push(x / roadWidth, z / roadWidth);

      for (let i = 0; i < cornerResolution; i++) {
        let angle = angleOffset + i / (cornerResolution - 1) * Math.PI / 2;
        let x = position.x + Math.cos(angle) * cornerRadius;
        let y = position.y;
        let z = position.z + Math.sin(angle) * cornerRadius;
        vertices.push(x, y, z);
        uvs.push(x / roadWidth, z / roadWidth);
      }

      for (let i = 0; i < cornerResolution - 1; i++) {
        indices.push(
          vertexOffset + 0,
          vertexOffset + i + 1,
          vertexOffset + i + 2
        );
      }
    };

    const createRoad = (a, b) => {
      const vertexOffset = vertices.length / 3;

      vertices.push(
        0 - a / 2,
        0,
        0 - b / 2
      );
      vertices.push(
        0 + a / 2,
        0,
        0 - b / 2
      );
      vertices.push(
        0 + a / 2,
        0,
        0 + b / 2
      );
      vertices.push(
        0 - a / 2,
        0,
        0 + b / 2
      );

      uvs.push(
        (0 - a / 2) / roadWidth,
        (0 - b / 2) / roadWidth
      );
      uvs.push(
        (0 + a / 2) / roadWidth,
        (0 - b / 2) / roadWidth
      );
      uvs.push(
        (0 + a / 2) / roadWidth,
        (0 + b / 2) / roadWidth
      );
      uvs.push(
        (0 - a / 2) / roadWidth,
        (0 + b / 2) / roadWidth
      );

      indices.push(
        vertexOffset + 0,
        vertexOffset + 2,
        vertexOffset + 1
      );
      indices.push(
        vertexOffset + 0,
        vertexOffset + 3,
        vertexOffset + 2
      );
    };

    createCorner(new Vector(-chunkSize / 2, 0, -chunkSize / 2), 0);
    createCorner(new Vector(-chunkSize / 2, 0, chunkSize / 2), -Math.PI / 2);
    createCorner(new Vector(chunkSize / 2, 0, -chunkSize / 2), Math.PI / 2);
    createCorner(new Vector(chunkSize / 2, 0, chunkSize / 2), Math.PI);

    createRoad(chunkSize, roadWidth);
    createRoad(roadWidth, chunkSize);

    const meshData = new renderer.MeshData({
      indices: {
        bufferData: new Uint32Array(indices),
        target: renderer.gl.ELEMENT_ARRAY_BUFFER
      },
      position: {
        bufferData: new Float32Array(vertices),
        size: 3
      },
      uv: {
        bufferData: new Float32Array(uvs),
        size: 2
      }
    });
    meshData.recalculateNormals();
    meshData.recalculateTangents();

    gameObject.transform.position = position;
    gameObject.meshRenderer = new renderer.MeshRenderer(material, meshData);
    gameObject.addComponent(new MeshCollider());

    scene.add(gameObject);

    return gameObject;
  }

  function generate3wayIntersection(position, settings = {}) {
    const gameObject = new GameObject("3-way intersection");

    const indices = [];
    const vertices = [];
    const uvs = [];

    const material = settings.material ?? renderer.CreateLitMaterial();
    const chunkSize = settings.chunkSize ?? 20;
    const roadWidth = settings.roadWidth ?? 12;
    const cornerResolution = settings.cornerResolution ?? 15;
    const cornerRadius = (chunkSize - roadWidth) / 2;

    const createCorner = (position, angleOffset) => {
      const vertexOffset = vertices.length / 3;

      const angle = angleOffset + Math.PI / 4;
      const diagonal = Math.sqrt(2) * cornerRadius;
      const x = position.x + Math.cos(angle) * diagonal;
      const z = position.z + Math.sin(angle) * diagonal;
      vertices.push(
        x,
        position.y,
        z
      );
      uvs.push(x / roadWidth, z / roadWidth);

      for (let i = 0; i < cornerResolution; i++) {
        let angle = angleOffset + i / (cornerResolution - 1) * Math.PI / 2;
        let x = position.x + Math.cos(angle) * cornerRadius;
        let y = position.y;
        let z = position.z + Math.sin(angle) * cornerRadius;
        vertices.push(x, y, z);
        uvs.push(x / roadWidth, z / roadWidth);
      }

      for (let i = 0; i < cornerResolution - 1; i++) {
        indices.push(
          vertexOffset + 0,
          vertexOffset + i + 1,
          vertexOffset + i + 2
        );
      }
    };

    const createMainRoad = () => {
      const vertexOffset = vertices.length / 3;

      vertices.push(
        0 - roadWidth / 2,
        0,
        0 - chunkSize / 2
      );
      vertices.push(
        0 + roadWidth / 2,
        0,
        0 - chunkSize / 2
      );
      vertices.push(
        0 + roadWidth / 2,
        0,
        0 + chunkSize / 2
      );
      vertices.push(
        0 - roadWidth / 2,
        0,
        0 + chunkSize / 2
      );

      uvs.push(0, 0);
      uvs.push(1, 0);
      uvs.push(1, 1);
      uvs.push(0, 1);

      indices.push(
        vertexOffset + 0,
        vertexOffset + 2,
        vertexOffset + 1
      );
      indices.push(
        vertexOffset + 0,
        vertexOffset + 3,
        vertexOffset + 2
      );
    };

    const createSmallRoad = () => {
      const vertexOffset = vertices.length / 3;

      vertices.push(
        0 - chunkSize / 2,
        0,
        0 - roadWidth / 2
      );
      vertices.push(
        0 - roadWidth / 2,
        0,
        0 - roadWidth / 2
      );
      vertices.push(
        0 - roadWidth / 2,
        0,
        0 + roadWidth / 2
      );
      vertices.push(
        0 - chunkSize / 2,
        0,
        0 + roadWidth / 2
      );

      uvs.push(0, 0);
      uvs.push(0, 1);
      uvs.push(1, 1);
      uvs.push(1, 0);

      indices.push(
        vertexOffset + 0,
        vertexOffset + 2,
        vertexOffset + 1
      );
      indices.push(
        vertexOffset + 0,
        vertexOffset + 3,
        vertexOffset + 2
      );
    };

    createCorner(new Vector(-chunkSize / 2, 0, -chunkSize / 2), 0);
    createCorner(new Vector(-chunkSize / 2, 0, chunkSize / 2), -Math.PI / 2);

    createMainRoad();
    createSmallRoad();

    const meshData = new renderer.MeshData({
      indices: {
        bufferData: new Uint32Array(indices),
        target: renderer.gl.ELEMENT_ARRAY_BUFFER
      },
      position: {
        bufferData: new Float32Array(vertices),
        size: 3
      },
      uv: {
        bufferData: new Float32Array(uvs),
        size: 2
      }
    });
    meshData.recalculateNormals();
    meshData.recalculateTangents();

    gameObject.transform.position = position;
    gameObject.meshRenderer = new renderer.MeshRenderer(material, meshData);
    gameObject.addComponent(new MeshCollider());

    scene.add(gameObject);

    return gameObject;
  }

  function generateCorner(position, settings = {}) {
    const gameObject = new GameObject("Corner");

    const indices = [];
    const vertices = [];
    const uvs = [];

    const material = settings.material ?? renderer.CreateLitMaterial();
    const res = settings.res ?? 15;
    const radius = settings.radius ?? 10;
    const angleOffset = settings.angleOffset ?? 0;

    const angle = angleOffset + Math.PI / 4;
    const diagonal = Math.sqrt(2) * radius;
    vertices.push(
      position.x + Math.cos(angle) * diagonal,
      position.y,
      position.z + Math.sin(angle) * diagonal
    );

    for (let i = 0; i < res; i++) {
      let angle = angleOffset + i / (res - 1) * Math.PI / 2;
      let x = position.x + Math.cos(angle) * radius;
      let y = position.y;
      let z = position.z + Math.sin(angle) * radius;
      vertices.push(x, y, z);
      uvs.push(x, z);
    }

    for (let i = 0; i < res - 1; i++) {
      indices.push(0, i + 1, i + 2);
    }

    const meshData = new renderer.MeshData({
      indices: {
        bufferData: new Uint32Array(indices),
        target: renderer.gl.ELEMENT_ARRAY_BUFFER
      },
      position: {
        bufferData: new Float32Array(vertices),
        size: 3
      },
      uv: {
        bufferData: new Float32Array(uvs),
        size: 2
      }
    });
    meshData.recalculateNormals();
    meshData.recalculateTangents();

    gameObject.meshRenderer = new renderer.MeshRenderer(material, meshData);
    gameObject.addComponent(new MeshCollider());

    scene.add(gameObject);

    return gameObject;
  }

  async function createChunks() {
    var chunkSize = 300;

    var leavesMaterial = renderer.CreateLitMaterial({
      albedoTexture: renderer.loadTexture("leaves5.png", { ...renderer.getSRGBFormats() }),
    });
    var leavesBase = renderer.CreateShape("plane", leavesMaterial);

    // var grassMaterial = renderer.CreateLitMaterial({
    //   albedo: [0.8, 0.8, 1, 1],
    //   albedoTexture: renderer.loadTexture("../assets/textures/Snow/albedo.jpg", { ...renderer.getSRGBFormats() }),
    //   normalTexture: renderer.loadTexture("../assets/textures/Snow/normal.jpg"),
    //   normalStrength: 2,
    // });
    // // var grassMaterial = renderer.CreateLitMaterial({
    // //   albedoTexture: renderer.loadTexture("../assets/textures/brown_mud_leaves_01_2k_jpg/brown_mud_leaves_01_diff_2k.jpg", { ...renderer.getSRGBFormats() }),
    // //   normalTexture: renderer.loadTexture("../assets/textures/brown_mud_leaves_01_2k_jpg/brown_mud_leaves_01_Nor_2k.jpg"),
    // // });
    // grassMaterial.setUniform("doNoTiling", true);

    var simpleFoliageProgram = new renderer.CustomProgram(simpleFoliage);
    var billboardTreesBase = await renderer.loadGLTF("../assets/models/trees/stylizedAutumnBillboard.glb");
    var treesBase = await renderer.loadGLTF("../assets/models/trees/stylizedAutumn.glb");

    // var dirtRoadMaterial = renderer.CreateLitMaterial({
    //   // albedo: [0.8, 0.8, 0.8, 1],
    //   albedoTexture: renderer.loadTexture("../assets/textures/aerial_mud_1_4k_jpg/aerial_mud_1_diff_4k.jpg", { ...renderer.getSRGBFormats() }),
    //   normalTexture: renderer.loadTexture("../assets/textures/aerial_mud_1_4k_jpg/normalWithWater.png"),
    //   metallicRoughnessTexture: renderer.loadMetalRoughness("../assets/textures/aerial_mud_1_4k_jpg/aerial_mud_1_ref_4k.jpg", "../assets/textures/aerial_mud_1_4k_jpg/aerial_mud_1_ref_4k.jpg")
    // });
    // dirtRoadMaterial.setUniform("roughness", 0.9);
    // dirtRoadMaterial.setUniform("normalStrength", 3);
    var dirtRoadMaterial = null;

    var asphaltRoadMaterial = renderer.CreateLitMaterial({
      albedo: [0.3, 0.3, 0.3, 1],
      albedoTexture: await renderer.loadTextureAsync("../assets/textures/road/albedo.png", { ...renderer.getSRGBFormats(), anisotropicFiltering: true }),
      normalTexture: await renderer.loadTextureAsync("../assets/textures/road/normal.png", { anisotropicFiltering: true }),
      metallicRoughnessTexture: await renderer.loadTextureAsync("../assets/textures/road/metallicRoughness.png", { anisotropicFiltering: true }),
      metallic: 0.5,
      // albedoTexture: renderer.loadTexture("../assets/textures/asphalt_01_1k/asphalt_01_diff_1k.jpg", { ...renderer.getSRGBFormats() }),
      // normalTexture: renderer.loadTexture("../assets/textures/asphalt_01_1k/asphalt_01_nor_gl_1k.png"),
    });
    // roadMaterial.setUniform("albedo", [1, 1, 1, 1]);
    // roadMaterial.setUniform("albedoTexture", renderer.loadTexture("./assets/textures/checkerboard2.png"));

    var roadSettings = {
      rally: { width: 10 / 2.5, material: dirtRoadMaterial, flipUV: true, uvScale: 0.75 },
      asphalt: { width: 10, material: asphaltRoadMaterial, flipUV: false, uvScale: 1 }
    };

    var roadKey = "asphalt";
    var roadWidth = roadSettings[roadKey].width;
    var roadMaterial = roadSettings[roadKey].material;
    var curveXMax = 0.3;
    var flipUV = roadSettings[roadKey].flipUV;
    var uvScale = roadSettings[roadKey].uvScale;
    // var treeDensity = 5;
    var treeDensity = 0.1;

    var points = [];
    var startY = 0;
    var yVel = 0;

    points.push(new Vector(0, startY, -chunkSize * 0.7));
    points.push(new Vector(0, startY, -chunkSize * 0.5));

    for (var i = 1; i < 9; i++) {
      points.push(new Vector(0, startY, -chunkSize / 2 + i * chunkSize / 3));
      points[points.length - 1].y = terrain.getHeight(points[points.length - 1].x, points[points.length - 1].z);
    }

    var chunks = [
      await createChunk(points.slice(0, 7)),
      await createChunk(points.slice(3, 10), new Vector(0, 0, 100)),
    ];

    setInterval(async function() {
      if (!car || !car.rb) return;

      for (let i = 0; i < chunks.length; i++) {
        var chunk = chunks[i];
        chunk.active = (Math.abs(i * chunkSize - car.rb.position.z) < chunkSize * 2);
      }

      if (car.rb.position.z > (chunks.length - 2) * chunkSize) {
        for (let i = 0; i < 3; i++) {
          yVel += (Math.random() - (0.5 + yVel * 0.02)) * 3.5;
          // yVel = clamp(yVel, -8, 8);
          // if (Math.abs(yVel) >= 8) {
          //   yVel *= -1;
          // }
          startY += yVel;
          points.push(new Vector((Math.random() - 0.5) * chunkSize * curveXMax, startY/*Math.random() * 3*/, -chunkSize / 2 + (points.length - 1) * chunkSize / 3));
          points[points.length - 1].y = terrain.getHeight(points[points.length - 1].x, points[points.length - 1].z) + 3;
        }

        chunks.push(await createChunk(points.slice(chunks.length * 3, chunks.length * 3 + 7), new Vector(0, 0, chunks.length * chunkSize)));
      }
    }, 400);

    async function createChunk(points, center = Vector.zero()) {
      var roadCurve = new CatmullRomCurve(points.map(p => Vector.subtract(p, center)));
      return await generateRoad(center, roadCurve, roadWidth, 100);
    }

    async function generateRoad(chunkCenter, crCurve, width = 12, segments = 100) {
      var container = new GameObject("Chunk");
      container.transform.position = chunkCenter;

      var isForest = true;//Math.random() > 0.25;

      // Trees
      // var trees = container.add(treesBase.copy());
      // trees.children[0].meshRenderer = trees.children[0].meshRenderer.getInstanceMeshRenderer();
      // var mr = trees.children[0].meshRenderer;

      // // mr.materials[0].programContainer = renderer.programContainers.unlitInstanced;
      // mr.materials[0].setUniform("albedo", [0.3, 0.3, 0.3, 1]);
      // mr.materials[0].setUniform("alphaCutoff", 0.5);

      // // mr.materials[0].programContainer = simpleFoliageProgram;
      // // mr.materials[0].doubleSided = false;

      // function addTree(origin) {
      //   mr.addInstance(Matrix.transform([
      //     ["translate", Vector.add(chunkCenter, origin)],
      //     ["scale", Vector.fill(1 + Math.random() * 1)],
      //     ["ry", Math.random() * 2 * Math.PI],
      //     ["rx", (Math.random() - 0.5) * 0.07],
      //     ["rz", (Math.random() - 0.5) * 0.07],
      //   ]));
      // }

      var instanceTrees = container.add(treesBase.copy());
      instanceTrees.children[0].meshRenderer = instanceTrees.children[0].meshRenderer.getInstanceMeshRenderer();
      instanceTrees.children[0].meshRenderer.materials[0].setUniform("albedo", [0.3, 0.3, 0.3, 1]);
      instanceTrees.children[0].meshRenderer.materials[0].setUniform("alphaCutoff", 0.5);
      // instanceTrees.children[0].meshRenderer.materials[0].programContainer = renderer.programContainers.unlitInstanced;
      instanceTrees.children[0].meshRenderer.materials[0].doubleSided = false;
      instanceTrees.children[0].meshRenderer.materials[0].doubleSidedShadows = false;

      var instanceBillboardTrees = container.add(billboardTreesBase.copy());
      instanceBillboardTrees.children[0].meshRenderer = instanceBillboardTrees.children[0].meshRenderer.getInstanceMeshRenderer();
      instanceBillboardTrees.children[0].meshRenderer.materials[0].setUniform("albedo", [0.1, 0.1, 0.1, 1]);
      instanceBillboardTrees.children[0].meshRenderer.materials[0].setUniform("alphaCutoff", 0.5);
      instanceBillboardTrees.setReceiveShadows(false);
      // instanceBillboardTrees.castShadows = false;

      // instanceBillboardTrees.children[0].meshRenderer.meshData[0].setAttribute("normal", {
      //   bufferData: new Float32Array([
      //     0, 0, 1,
      //     0, 0, 1,
      //     0, 0, 1,
      //     0, 0, 1,
      //   ])
      // });

      var trees = [];

      var treesContainer = container.addChild(new GameObject("Tree container"));
      treesContainer.visible = false;

      function addSimpleTree(origin) {
        return;
        // trees.push(origin);

        let p = Vector.add(chunkCenter, origin);
        let m = Matrix.transform([
          ["translate", Vector.add(p, new Vector(0, -Math.random() * 2, 0))],
          ["scale", Vector.fill(1 + Math.random() * 1)],
          ["ry", Math.random() * 2 * Math.PI],
          ["rx", (Math.random() - 0.5) * 0.07],
          ["rz", (Math.random() - 0.5) * 0.07],
        ]);
        let m2 = Matrix.copy(m);
        Matrix.transform([
          ["ry", Math.PI / 2]
        ], m2);
        instanceBillboardTrees.children[0].meshRenderer.addInstance(m);
        instanceBillboardTrees.children[0].meshRenderer.addInstance(m2);
      }

      var treesToAdd = [];

      function addTree(origin) {
        treesToAdd.push(origin);
        return;

        var lodTree = treesContainer.add(new GameObject("LOD Tree"));
        lodTree.visible = false;

        // lodTree.transform.matrix = Matrix.transform([
        //   ["translate", origin],
        //   // ["translate", Vector.add(chunkCenter, origin)], // Only add chunkCenter when instanced mesh
        //   ["scale", Vector.fill(1 + Math.random() * 1)],
        //   ["ry", Math.random() * 2 * Math.PI],
        //   ["rx", (Math.random() - 0.5) * 0.07],
        //   ["rz", (Math.random() - 0.5) * 0.07],
        // ]);
        // lodTree.addComponent(new LOD([
        //   { meshRenderer: treesBase.children[0].meshRenderer, upToDistance: 50 },
        //   { meshRenderer: billboardTreesBase.children[0].meshRenderer, upToDistance: 500 },
        // ]));

        function TreeLOD(matrix) {
          this.instanceMatrix = Matrix.copy(matrix);

          var levels = [
            { meshRenderer: instanceTrees.children[0].meshRenderer, upToDistance: 50 },
            { meshRenderer: instanceBillboardTrees.children[0].meshRenderer, upToDistance: 500 },
          ];
          var lastLevel = null;

          this.updateInterval = 20;
          var i = Math.floor(Math.random() * this.updateInterval);

          this.update = function() {
            if (car && i % this.updateInterval == 0) {
              var cameraPos = car.mainCamera.transform.position;
              var distanceToCenter = Vector.distanceSqr(Matrix.getPosition(this.instanceMatrix), cameraPos);
            
              var currentLevel = levels.find(l => distanceToCenter < l.upToDistance * l.upToDistance);

              if (currentLevel != lastLevel) {
                for (var level of levels) {
                  if (currentLevel == level) {
                    level.meshRenderer.addInstanceDontCopy(this.instanceMatrix);
                  }
                  else {
                    level.meshRenderer.removeInstance(this.instanceMatrix);
                  }
                }
              }

              lastLevel = currentLevel;
            }

            i++;
          };
        }

        lodTree.addComponent(new TreeLOD(Matrix.transform([
          // ["translate", origin],
          ["translate", Vector.add(chunkCenter, origin)], // Only add chunkCenter when instanced mesh
          ["scale", Vector.fill(1 + Math.random() * 1)],
          ["ry", Math.random() * 2 * Math.PI],
          ["rx", (Math.random() - 0.5) * 0.07],
          ["rz", (Math.random() - 0.5) * 0.07],
        ])));

        // trees.push(lodTree);
      }

      // Leaves
      var leaves = container.add(leavesBase.copy());
      leaves.castShadows = false;
      leaves.meshRenderer = leaves.meshRenderer.getInstanceMeshRenderer();
      var mrLeaves = leaves.meshRenderer;
      mrLeaves.castShadows = false;

      // mr.materials[0].programContainer = renderer.programContainers.unlitInstanced;
      mrLeaves.materials[0].setUniform("albedo", [0.3, 0.3, 0.3, 1]);
      mrLeaves.materials[0].setUniform("alphaCutoff", 0.7);
      // mr.materials[0].programContainer = simpleFoliageProgram;
      // mr.materials[0].doubleSided = false;

      function addLeaves(origin) {
        mrLeaves.addInstance(Matrix.transform([
          ["translate", Vector.add(chunkCenter, origin)],
          ["scale", Vector.fill(0.25 + Math.random() * 0.5)],
          ["ry", Math.random() * 2 * Math.PI],
          ["rx", -Math.PI / 2],
          // ["rx", (Math.random() - 0.5) * 0.07],
          // ["rz", (Math.random() - 0.5) * 0.07],
        ]));
      }

      // Road
      var road = new GameObject("Road");

      var distanceAlongPath = 0;

      var indices = [];
      var vertices = [];
      var uvs = [];

      var groundIndices = [];
      var groundVertices = [];
      var groundUVs = [];

      var groundCounter = 0;
      var step = 1 / segments;
      for (let s = 0; s < segments; s++) {
        let t = s / (segments - 1) * 0.75;
        let center = crCurve.getPoint(t);
        
        let diff = Vector.subtract(
          crCurve.getPoint(t + step),
          center
        );
        let tangent = Vector.normalize(diff);

        let normal = Quaternion.QxV(Quaternion.angleAxis(Math.PI / 2, tangent), Vector.up());
        
        var edge = Vector.multiply(normal, width / 2); // inner edge
        var margin = Vector.multiply(normal, width / 2 * 1.4); // outer edge

        var e1 = Vector.add(center, edge);
        var m1 = Vector.add(center, margin);
        m1.y -= width * 0.06;
        var e2 = Vector.subtract(center, edge);
        var m2 = Vector.subtract(center, margin);
        m2.y -= width * 0.06;

        // Shrinkwrap to terrain
        // center.y = terrain.getHeight(chunkCenter.x + center.x, chunkCenter.z + center.z);
        e1.y = terrain.getHeight(chunkCenter.x + e1.x, chunkCenter.z + e1.z) + 0.01;
        e2.y = terrain.getHeight(chunkCenter.x + e2.x, chunkCenter.z + e2.z) + 0.01;
        m1.y = terrain.getHeight(chunkCenter.x + m1.x, chunkCenter.z + m1.z) - 0.5;
        m2.y = terrain.getHeight(chunkCenter.x + m2.x, chunkCenter.z + m2.z) - 0.5;

        vertices.push(m1.x, m1.y, m1.z);
        vertices.push(e1.x, e1.y, e1.z);
        vertices.push(e1.x, e1.y, e1.z);
        vertices.push(e2.x, e2.y, e2.z);
        vertices.push(e2.x, e2.y, e2.z);
        vertices.push(m2.x, m2.y, m2.z);

        var v = distanceAlongPath / width;

        if (flipUV) {
          uvs.push(v * uvScale, -0.4 * uvScale);
          uvs.push(v * uvScale, 0 * uvScale);
          uvs.push(v * uvScale, 0 * uvScale);
          uvs.push(v * uvScale, 1 * uvScale);
          uvs.push(v * uvScale, 1 * uvScale);
          uvs.push(v * uvScale, 1.4 * uvScale);
        }
        else {
          uvs.push(-0.4 * uvScale, v * uvScale);
          uvs.push(0 * uvScale, v * uvScale);
          uvs.push(0 * uvScale, v * uvScale);
          uvs.push(1 * uvScale, v * uvScale);
          uvs.push(1 * uvScale, v * uvScale);
          uvs.push(1.4 * uvScale, v * uvScale);
        }
        
        var mountainHeight = (perlin.noise(0, 0, (chunkCenter.z + center.z) * 0.01) + 1) / 2;

        // var farEdge = Vector.multiply(normal, width * 2);
        var steepness = 1.6;//0.2 + (perlin.noise(0, 0, center.z * 0.07) + 1) / 2 * 4;
        var l1 = Vector.add(e1, new Vector(-width * steepness, width * 0.4 * mountainHeight, 0));
        var ll1 = Vector.add(e1, new Vector(-width * 8, width * 0.55 * mountainHeight, 0));
        var l2 = Vector.add(e2, new Vector(width * steepness, width * 0.4 * mountainHeight, 0));
        var ll2 = Vector.add(e2, new Vector(width * 8, width * 0.55 * 5 * mountainHeight, 0));

        if (groundCounter % 3 == 0) {
          groundVertices.push(ll1.x, ll1.y, ll1.z);
          groundVertices.push(l1.x, l1.y, l1.z);
          groundVertices.push(e1.x, e1.y, e1.z);
          groundVertices.push(e2.x, e2.y, e2.z);
          groundVertices.push(l2.x, l2.y, l2.z);
          groundVertices.push(ll2.x, ll2.y, ll2.z);

          groundUVs.push(-8 * 4, v * 4);
          groundUVs.push(-4 * 4, v * 4);
          groundUVs.push(0 * 4, v * 4);
          groundUVs.push(1 * 4, v * 4);
          groundUVs.push(3 * 4, v * 4);
          groundUVs.push(9 * 4, v * 4);
        }
        groundCounter++;

        distanceAlongPath += Vector.length(diff);

        // let plant = () => {
        //   addTree(
        //     Vector.add(
        //       Vector.add(center, Vector.multiply(normal, width * 0.6 + Math.random() * 3 * 15 / 0.2)),
        //       new Vector(0, -width * 0.06 + (Math.random() - 0.5) * width * 0, 0)
        //     )
        //   );
        //   addTree(
        //     Vector.add(
        //       Vector.subtract(center, Vector.multiply(normal, width * 0.6 + Math.random() * 3 * 15 / 0.2)),
        //       new Vector(0, -width * 0.06 + (Math.random() - 0.5) * width * 0, 0)
        //     )
        //   );
        // };
        // if (treeDensity >= 1) {
        //   for (let _i = 0; _i < treeDensity; _i++) {
        //     plant();
        //   }
        // }
        // else {
        //   if (Math.random() < treeDensity) {
        //     plant();
        //   }
        // }

        // for (let _i = 0; _i < 1; _i++) {
        //   addSimpleTree(
        //     Vector.add(
        //       Vector.add(center, Vector.multiply(normal, width * 0.6 + Math.random() * 3 * 15)),
        //       new Vector(0, -width * 0.06 + (Math.random() - 0.5) * width * 0, 0)
        //     )
        //   );
        //   addSimpleTree(
        //     Vector.add(
        //       Vector.subtract(center, Vector.multiply(normal, width * 0.6 + Math.random() * 3 * 15)),
        //       new Vector(0, -width * 0.06 + (Math.random() - 0.5) * width * 0, 0)
        //     )
        //   );
        // }

        let treePos = Vector.add(center, Vector.multiply(normal, width * 0.6 + Math.random() * 200));
        treePos.y = terrain.getHeight(chunkCenter.x + treePos.x, chunkCenter.z + treePos.z);
        addSimpleTree(treePos);

        treePos = Vector.subtract(center, Vector.multiply(normal, width * 0.6 + Math.random() * 200));
        treePos.y = terrain.getHeight(chunkCenter.x + treePos.x, chunkCenter.z + treePos.z);
        addSimpleTree(treePos);

        // addLeaves(Vector.add(Vector.add(center, Vector.multiply(normal, width / 2 - Math.random() * 2)), new Vector(0, 0.05 + Math.random() * 0.02, 0)));
        // addLeaves(Vector.add(Vector.subtract(center, Vector.multiply(normal, width / 2 - Math.random() * 2)), new Vector(0, 0.05 + Math.random() * 0.02, 0)));
      }

      for (var i = 0; i < (vertices.length / 3 / 6 - 1) * 6; i += 6) {
        // for (var i = 0; i < vertices.length / 3 * 3; i += 6) {
        var w = 10000000000;//vertices.length / 3;
        indices.push(
          (i + 0) % w,
          (i + 6) % w,
          (i + 1) % w,

          (i + 1) % w,
          (i + 6) % w,
          (i + 7) % w,

          (i + 2) % w,
          (i + 8) % w,
          (i + 3) % w,

          (i + 3) % w,
          (i + 8) % w,
          (i + 9) % w,

          (i + 4) % w,
          (i + 10) % w,
          (i + 5) % w,

          (i + 5) % w,
          (i + 10) % w,
          (i + 11) % w,
        );
      }

      for (let i = 0; i < (groundVertices.length / 3 / 6 - 1) * 6; i += 6) {
        let v = 6;
        for (let j = 0; j < 5; j++) {
          if (j == 2) continue;

          groundIndices.push(
            (i + 0 + j),
            (i + v + j),
            (i + 1 + j),
  
            (i + 1 + j),
            (i + v + j),
            (i + v + 1 + j),
          );
        }
      }

      var roadMeshData = new renderer.MeshData({
        indices: {
          bufferData: new Uint32Array(indices),
          target: renderer.gl.ELEMENT_ARRAY_BUFFER
        },
        position: {
          bufferData: new Float32Array(vertices),
          size: 3
        },
        uv: {
          bufferData: new Float32Array(uvs),
          size: 2
        }
      });
      roadMeshData.recalculateNormals();
      roadMeshData.recalculateTangents();

      road.meshRenderer = new renderer.MeshRenderer(roadMaterial, roadMeshData);
      road.addComponent(new MeshCollider());
      road.transform.position.y = 0.04;
      container.addChild(road);

      // // Terrain
      // var terrainMeshData = new renderer.MeshData({
      //   indices: {
      //     bufferData: new Uint32Array(groundIndices),
      //     target: renderer.gl.ELEMENT_ARRAY_BUFFER
      //   },
      //   position: {
      //     bufferData: new Float32Array(groundVertices),
      //     size: 3
      //   },
      //   uv: {
      //     bufferData: new Float32Array(groundUVs),
      //     size: 2
      //   }
      // });
      // terrainMeshData.recalculateNormals();
      // terrainMeshData.recalculateTangents();

      // var terrain = new GameObject("Terrain");
      // terrain.meshRenderer = new renderer.MeshRenderer(grassMaterial, terrainMeshData);
      // terrain.addComponent(new MeshCollider());
      // terrain.transform.position.y = 0;//-0.04;

      // terrain.customData.bumpiness = 0.08;
      // terrain.customData.friction = 0.5;
      // terrain.customData.offroad = 1;

      // container.addChild(terrain);

      scene.add(container);

      if (isForest) {
        for (let origin of trees) {
          let p = Vector.add(chunkCenter, origin);
          let hit = physicsEngine.Raycast(
            new Vector(p.x, p.y + 50, p.z),
            Vector.down()
          );
          if (hit && hit.firstHit) {
            // tree.transform.position.y = hit.firstHit.point.y;

            let m = Matrix.transform([
              ["translate", Vector.add(hit.firstHit.point, new Vector(0, -Math.random() * 2, 0))],
              ["scale", Vector.fill(1 + Math.random() * 1)],
              ["ry", Math.random() * 2 * Math.PI],
              ["rx", (Math.random() - 0.5) * 0.07],
              ["rz", (Math.random() - 0.5) * 0.07],
            ]);
            let m2 = Matrix.copy(m);
            Matrix.transform([
              ["ry", Math.PI / 2]
            ], m2);
            instanceBillboardTrees.children[0].meshRenderer.addInstance(m);
            instanceBillboardTrees.children[0].meshRenderer.addInstance(m2);
          }
        }

        for (let origin of treesToAdd) {
          let p = Vector.add(chunkCenter, origin);
          let hit = physicsEngine.Raycast(
            new Vector(p.x, p.y + 50, p.z),
            Vector.down()
          );
          if (hit && hit.firstHit) {
            let m = Matrix.transform([
              ["translate", Vector.add(hit.firstHit.point, new Vector(0, -Math.random() * 2, 0))],
              ["scale", Vector.fill(1 + Math.random() * 1)],
              ["ry", Math.random() * 2 * Math.PI],
              ["rx", (Math.random() - 0.5) * 0.07],
              ["rz", (Math.random() - 0.5) * 0.07],
            ]);
            instanceTrees.children[0].meshRenderer.addInstance(m);
          }
        }
      }

      return container;
    }
  }

  async function loadMap() {
    // const mapPath = "./touge.glb";
    // const colliderPath = "./tougeCollider.glb";
    // const mapPath = "../assets/models/brickPlane.glb";
    // const colliderPath = "../assets/models/brickPlane.glb";
    const mapPath = "../assets/models/test/staticColliderDetectObject.glb";
    const colliderPath = "";

    // var grassAlbedo = await renderer.loadTextureAsync("../assets/textures/GroundForest003/GroundForest003_COL_VAR1_3K.jpg", { ...renderer.getSRGBFormats() });
    // var grassNormal = await renderer.loadTextureAsync("../assets/textures/GroundForest003/GroundForest003_NRM_3K.jpg");
    // var stoneAlbedo = await renderer.loadTextureAsync("../assets/textures/rocks_ground_03_2k_jpg/rocks_ground_03_diff_2k.jpg", { ...renderer.getSRGBFormats() });
    // var stoneNormal = await renderer.loadTextureAsync("../assets/textures/rocks_ground_03_2k_jpg/rocks_ground_03_nor_2k.jpg");

    // var map = await renderer.loadGLTF(mapPath, { maxTextureSize: 1024 });
    // var mapBatched = scene.add(renderer.BatchGameObject(map));

    // var leaves = renderer.loadTexture("../assets/textures/leaves.png");
    // var foliage = new renderer.ProgramContainer(await renderer.createProgramFromFile("../assets/shaders/custom/webgl2/foliage"));
    // var foliageMat = new NewMaterial(foliage);
    // foliageMat.doubleSided = true;
    // foliageMat.setUniform("useTexture", 1);
    // foliageMat.setUniform("albedoTexture", leaves);

    // mapBatched.castShadows = false;
    // mapBatched.meshRenderer.materials[1].programContainer = terrainProgram;
    // mapBatched.meshRenderer.materials[1].setUniform("roughness", 1);
    // mapBatched.meshRenderer.materials[1].setUniform("albedoTextures[0]", [ grassAlbedo, stoneAlbedo ]);
    // mapBatched.meshRenderer.materials[1].setUniform("normalTextures[0]", [ grassNormal, stoneNormal ]);
    // // mapBatched.meshRenderer.materials[1].setUniform("albedo", [0.25, 0.25, 0.25, 1]);
    // mapBatched.meshRenderer.materials[2].setUniform("normalStrength", 2.5);
    // mapBatched.meshRenderer.materials[6].programContainer = renderer.programContainers.unlit;

    // if (colliderPath) {
    //   var collider = await renderer.loadGLTF(colliderPath, { loadMaterials: false, loadNormals: false, loadTangents: false });
    //   collider.transform.set(map.transform);
    //   physicsEngine.addMeshCollider(collider);
    // }

    // initSnow();
    // await initTrees();
  }

  async function loadGrass() {
    // var noTreeZone = scene.add(await renderer.loadGLTF("./noTreeZone.glb"), { loadMaterials: false, loadNormals: false, loadTangents: false });
    // noTreeZone.visible = false;
    // noTreeZone.transform.position.y = 500;
    // for (var child of noTreeZone.children) {
    //   child.addComponent(new MeshCollider());
    // }

    // var grass = scene.add(await renderer.loadGLTF("../assets/models/trees/stylizedAutumn.glb"));
    // // var grass = scene.add(await renderer.loadGLTF("./pine.glb"));
    // // var grass = scene.add(await renderer.loadGLTF("../assets/models/stylizedTree.glb"));
    // // var grass = scene.add(await renderer.loadGLTF("../cargame/grass.glb"));
    // // grass.castShadows = false;

    // var simpleFoliageProgram = new renderer.CustomProgram(simpleFoliage);
    // grass.children[0].meshRenderer = grass.children[0].meshRenderer.getInstanceMeshRenderer();
    // // grass.children[0].meshRenderer.materials[0].programContainer = renderer.programContainers.unlitInstanced;
    // // grass.children[0].meshRenderer.materials[0].setUniform("albedo", [2, 2, 2, 1]);

    // grass.children[0].meshRenderer.materials[0].programContainer = simpleFoliageProgram;

    // // var grassJson = [];

    // for (let i = 0; i < 1_000; i++) {
    //   var origin = new Vector((Math.random() - 0.5) * 500, 1000, (Math.random() - 0.5) * 500);

    //   var hit = physicsEngine.Raycast(origin, Vector.down());
    //   if (hit && hit.firstHit && hit.firstHit.point.y < 100) {
    //     origin.y = hit.firstHit.point.y;

    //     // grassJson.push(Vector.map(origin, c => roundToPlaces(c, 2)));

    //     grass.children[0].meshRenderer.addInstance(Matrix.transform([
    //       ["translate", origin],
    //       ["scale", Vector.fill(1 + Math.random() * 1)],
    //       // ["scale", Vector.fill(1.5 + Math.random() * 1.75)],
    //       ["ry", Math.random() * 2 * Math.PI],
    //       ["rx", (Math.random() - 0.5) * 0.07],
    //       ["rz", (Math.random() - 0.5) * 0.07],
    //     ]));
    //   }
    // }

    // noTreeZone.delete();
    
    // console.log(grassJson);
  }

  async function initTrees() {
    var tree = scene.add(await renderer.loadGLTF("../assets/models/treePbr.glb"));
    tree.children[0].meshRenderer = tree.children[0].meshRenderer.getInstanceMeshRenderer();

    for (var i = 0; i < 100; i++) {
      var pos = new Vector((Math.random() - 0.5) * 100, 0, (Math.random() - 0.5) * 100);
      pos.y = terrain.getHeight(pos.x, pos.z);
      
      tree.children[0].meshRenderer.addInstance(Matrix.transform([
        ["translate", pos],
        ["scale", Vector.fill(0.8 + Math.random() * 0.4)],
        ["ry", Math.random() * Math.PI * 2]
      ]));
    }
  }

  function initSnow() {
    var snow = new GameObject("Snow");
    var snowParticles = new renderer.ParticleSystem(5000);
    snowParticles.localParticles = false;
    
    var m = new NewMaterial(renderer.programContainers.particle);
    m.setUniform("albedoTexture", renderer.loadTexture("../assets/textures/snowParticle32x32.png"));
    snowParticles.material = m;

    snowParticles.alphaCurve = new LerpCurve();
    snowParticles.alphaCurve.addStage(0, 0);
    snowParticles.alphaCurve.addStage(0.15, 1);
    snowParticles.alphaCurve.addStage(0.9, 1);
    snowParticles.alphaCurve.addStage(1, 0);

    snowParticles.emitHealth = 9;
    snowParticles.orientation = "faceCamera";
    snowParticles.startSize = Vector.fill(0.05 + Math.random() * 0.07);

    snowParticles.emitPosition = () => {
      return Vector.add(car.mainCamera.transform.position, new Vector((Math.random() - 0.5) * 50, 10, (Math.random() - 0.5) * 50));
    }
    snowParticles.emitVelocity = () => {
      return new Vector(0, -4, 0);
    }

    snow.addComponent(snowParticles);
    scene.add(snow);

    setInterval(() => {
      snowParticles.emit(5);
    }, 20);
  }

  function bilinear(u, v, func) {
    var fu = Math.floor(u);
    var fv = Math.floor(v);

    var a = func(fu, fv);
    var b = func(fu + 1, fv);
    var c = func(fu, fv + 1);
    var d = func(fu + 1, fv + 1);

    var e = lerp(a, b, u % 1);
    var f = lerp(c, d, u % 1);
    var g = lerp(e, f, v % 1);

    return g;
  }

  function BezierCurve(points) {
    this.points = points;

    this.getPoint = function(t) {
      return bezierRecursive(this.points, t);
    };

    var bezierRecursive = (points, t) => {
      if (points.length <= 1) return points[0];

      var newPoints1 = [...points];
      var newPoints2 = [...points];
      newPoints1.pop();
      newPoints2.shift();
      
      var p1 = bezierRecursive(newPoints1, t);
      var p2 = bezierRecursive(newPoints2, t);

      return {
        x: (1 - t) * p1.x + t * p2.x,
        y: (1 - t) * p1.y + t * p2.y,
        z: (1 - t) * p1.z + t * p2.z
      };
    };
  }

  function CatmullRomCurve(points, alpha = 0.5, loop = false) {
    this.alpha = alpha;
    this.points = points;
    this.loop = loop;
    var segments = [];

    for (var i = 0; i < points.length - (this.loop ? 0 : 3); i++) {
      segments.push(new CatmullRomSegment(
        points[(i + 0) % points.length],
        points[(i + 1) % points.length],
        points[(i + 2) % points.length],
        points[(i + 3) % points.length],
        this.alpha
      ));
    }

    this.distanceToPoint = function(p) {
      var d = this.distanceSqrToPoint(p);
      return {
        distance: Math.sqrt(d.distance),
        point: d.point,
      };
    };

    this.distanceSqrToPoint = function(p) {
      var closestDistance = Infinity;
      var closestPoint;

      for (var segment of segments) {
        var d = segment.distanceSqrToPoint(p);
        if (d.distance < closestDistance) {
          closestDistance = d.distance;
          closestPoint = d.point;
        }
      }

      return {
        distance: closestDistance,
        point: closestPoint,
      };
    };

    this.getPoint = function(t) {
      if (this.loop) {
        t = wrap(t, 1);
      }
      else {
        if (t <= 0) {
          return segments[0].getPoint(t);
        }

        if (t >= 1) {
          return segments[segments.length - 1].getPoint(t);
        }
      }

      var segment = Math.floor(t * segments.length);
      return segments[segment].getPoint((t * segments.length) % 1);
    };
  }

  function CatmullRomSegment(p0, p1, p2, p3, alpha = 0.5) {
    this.p0 = p0;
    this.p1 = p1;
    this.p2 = p2;
    this.p3 = p3;
    this.alpha = alpha;

    this.distanceToPoint = function(p) {
      var d = this.distanceSqrToPoint(p);
      return {
        distance: Math.sqrt(d.distance),
        point: d.point
      };
    };

    this.distanceSqrToPoint = function(p) {
      // var closestDistance = Infinity;
      // var closestPoint;

      var projP = Vector.copy(p);
      projP.y = 0;

      var d;
      var step = 0.5;
      var start = 0;
      var end = 1;
      while (step >= 0.095) {
        d = this._getClosestDistanceInRange(projP, start, end, step);
        start = d.t - step;
        end = d.t + step;
        step /= 2;
      }

      return {
        distance: d.distance,
        point: d.point,
        t: d.t,
      };
    };

    this._getClosestDistanceInRange = function(projP, start, end, step) {
      var closestDistance = Infinity;
      var closestPoint;
      var closestT;

      start = Math.max(0, start);
      end = Math.min(1, end);

      for (var t = start; t <= end; t += step) {
        var curvePoint = this.getPoint(t);

        var d = Vector.distanceSqr(projP, new Vector(curvePoint.x, 0, curvePoint.z));
        if (d < closestDistance) {
          closestDistance = d;
          closestPoint = curvePoint;
          closestT = t;
        }
      }

      return {
        distance: closestDistance,
        point: closestPoint,
        t: closestT,
      };
    };

    this.getPoint = function(t) {
      var k0 = 0;
      var k1 = GetKnotInterval(this.p0, this.p1);
      var k2 = GetKnotInterval(this.p1, this.p2) + k1;
      var k3 = GetKnotInterval(this.p2, this.p3) + k2;

      var u = lerp(k1, k2, t);
      var A1 = Remap(k0, k1, this.p0, this.p1, u);
      var A2 = Remap(k1, k2, this.p1, this.p2, u);
      var A3 = Remap(k2, k3, this.p2, this.p3, u);
      var B1 = Remap(k0, k2, A1, A2, u);
      var B2 = Remap(k1, k3, A2, A3, u);

      return Remap(k1, k2, B1, B2, u);
    };

    function Remap(a, b, c, d, u) {
      return Vector.lerp(c, d, (u - a) / (b - a));
    }

    function GetKnotInterval(a, b) {
      return Math.pow(Vector.distanceSqr(a, b), alpha / 2);
    }
  }

  function SettingsManager() {
    const LS_LOCATIon = "com.tc5550.cardemo.settings";

    class SettingGroup {
      constructor(name) {
        this.name = name;
      }
    }

    class SliderSetting {
      constructor(name = "Setting", value = 0, onValueChange = () => {}, min = 0, max = 1, step = 0.1, displayAsPercent = false) {
        this.name = name;
        this.value = value;
        this.defaultValue = value;
        this.onValueChange = onValueChange;

        this.min = min;
        this.max = max;
        this.step = step;
        this.displayAsPercent = displayAsPercent;
      }

      formatValue(value) {
        if (this.displayAsPercent) {
          return `${Math.round(value * 100)}%`;
        }

        return value.toString();
      }

      createDOM() {
        var parent = document.createElement("div");

        this.valueSpan = parent.appendChild(document.createElement("span"));
        this.valueSpan.style.marginRight = "2em";
        this.valueSpan.textContent = this.formatValue(this.value);

        var minSpan = parent.appendChild(document.createElement("span"));
        minSpan.textContent = this.min;

        this.slider = parent.appendChild(document.createElement("input"));
        this.slider.type = "range";
        this.slider.min = this.min;
        this.slider.max = this.max;
        this.slider.step = this.step;
        this.slider.value = this.value;

        var maxSpan = parent.appendChild(document.createElement("span"));
        maxSpan.textContent = this.max;

        this.slider.addEventListener("input", () => {
          this.value = this.slider.value;
          this.valueSpan.textContent = this.formatValue(this.value);
          this.onValueChange(this.value);
        });

        return parent;
      }

      setValue(value) {
        this.value = value;
        this.onValueChange(this.value);

        this.slider.value = this.value;
        this.valueSpan.textContent = this.formatValue(this.value);
      }
    }

    class DropdownSetting {
      constructor(name = "Setting", value = 0, onValueChange = () => {}, labels, values) {
        this.name = name;
        this.value = value;
        this.defaultValue = value;
        this.onValueChange = onValueChange;

        this.labels = labels;
        this.values = values;
        
        if (this.labels.length != this.values.length) {
          console.error(this.labels, this.values);
          throw new Error("Labels and values must have same length!");
        }
      }

      createDOM() {
        var parent = document.createElement("div");
        
        this.select = parent.appendChild(document.createElement("select"));
        for (var i = 0; i < this.labels.length; i++) {
          var label = this.labels[i];
          var value = this.values[i];

          var option = this.select.appendChild(document.createElement("option"));
          option.value = value;
          option.textContent = label;
        }

        this.select.addEventListener("input", () => {
          this.value = this.select.value;
          this.onValueChange(this.value);
        });

        return parent;
      }

      setValue(value) {
        this.value = value;
        this.onValueChange(this.value);

        this.select.selectedIndex = [...this.select.options].findIndex(o => o.value == value);
      }

      onClick() {
        let len = this.select.options.length;
        this.select.setAttribute("size", len);

        let currentIndex = this.select.selectedIndex;
        currentIndex++;
        currentIndex %= this.select.options.length;

        this.setValue(this.select.options[currentIndex].value);
      }
    }

    class CheckboxSetting {
      constructor(name = "Setting", value = false, onValueChange = () => {}) {
        this.name = name;
        this.value = value;
        this.defaultValue = value;
        this.onValueChange = onValueChange;
      }

      createDOM() {
        var parent = document.createElement("div");
        
        this.checkbox = parent.appendChild(document.createElement("input"));
        this.checkbox.type = "checkbox";
        this.checkbox.checked = this.value;

        this.checkbox.addEventListener("click", () => {
          this.value = this.checkbox.checked;
          this.onValueChange(this.value);
        });

        return parent;
      }

      setValue(value) {
        this.value = value;
        this.onValueChange(this.value);

        this.checkbox.checked = value;
      }

      onClick() {
        this.setValue(!this.value);
      }
    }

    var settings = {
      _soundGroup: new SettingGroup("Sound"),

      masterVolume: new SliderSetting("Master volume", 1, value => {
        if (car) {
          car.mainGainNode.gain.value = value;
        }
        saveSettings();
      }, 0, 2, 0.01, true),

      _displayGroup: new SettingGroup("Graphics"),

      fps: new CheckboxSetting("Show FPS", false, value => {
        if (!stats && value) {
          stats = new Stats();
        }

        if (value) {
          document.body.appendChild(stats.dom);
        }
        else {
          stats?.dom.remove();
        }

        saveSettings();
      }),

      renderScale: new SliderSetting("Render scale", 1, value => {
        renderer.setRenderScale(value);
        saveSettings();
      }, 0.2, 2, 0.05),

      motionBlur: new SliderSetting("Motion blur", 0.15, value => {
        scene.postprocessing.motionBlurStrength = value;
        saveSettings();
      }, 0, 0.5, 0.01),

      bloom: new CheckboxSetting("Bloom", true, value => {
        scene.bloom.enabled = value;
        saveSettings();
      }),

      _gameplayGroup: new SettingGroup("Gameplay"),

      day: new CheckboxSetting("Daytime", true, value => {
        window.isDay(value);
        saveSettings();
      }),

      cameraFollowMode: new DropdownSetting("Camera follow mode", 1, value => {
        if (car) {
          car.followCamera.followMode = value;
        }
        saveSettings();
      }, [
        "Follow velocity",
        "Follow direction",
        "Follow inverse direction"
      ], [
        1,
        2,
        3
      ]),

      _assistGroup: new SettingGroup("Assists"),

      abs: new CheckboxSetting("ABS", true, value => {
        if (car) {
          car.ABS = value;
        }
        saveSettings();
      }),

      tcs: new CheckboxSetting("TCS", false, value => {
        if (car) {
          car.TCS = value;
        }
        saveSettings();
      }),

      steeringAssist: new CheckboxSetting("Steering assist", true, value => {
        if (car) {
          car.activateAutoCountersteer = value;
        }
        saveSettings();
      }),

      autoCountersteer: new SliderSetting("Auto countersteer", 0.25/*0.6*/, value => {
        if (car) {
          car.autoCountersteer = value;
        }
        saveSettings();
      }, 0, 1, 0.05),

      autoCountersteerVelocityMultiplier: new SliderSetting("Auto countersteer velocity", 0.15/*0.2*/, value => {
        if (car) {
          car.autoCountersteerVelocityMultiplier = value;
        }
        saveSettings();
      }, 0, 1, 0.05),
    };

    var settingsItems = document.querySelector(".settings > .settingsContainer > .items");
    var defaultGroup = document.createElement("div");
    defaultGroup.classList.add("group");

    var currentGroup = defaultGroup;

    for (let settingKey in settings) {
      let setting = settings[settingKey];

      if (setting instanceof SettingGroup) {
        var group = settingsItems.appendChild(document.createElement("div"));
        group.classList.add("group");

        var groupTitle = group.appendChild(document.createElement("span"));
        groupTitle.classList.add("title");
        groupTitle.textContent = setting.name;

        currentGroup = group;
      }
      else {
        let item = currentGroup.appendChild(document.createElement("div"));
        item.classList.add("item");
        item.classList.add("isSelectable");

        item.addEventListener("click", function() {
          setting.onClick?.();
        });

        var name = item.appendChild(document.createElement("span"));
        name.textContent = setting.name;

        item.appendChild(setting.createDOM());

        if (currentGroup == defaultGroup && !settingsItems.contains(defaultGroup)) {
          settingsItems.appendChild(defaultGroup);
        }
      }
    }

    this.getSettingValue = function(setting) {
      if (!(setting in settings)) {
        console.warn("Setting not defined: " + setting);
        return;
      }

      return settings[setting].value;
    };

    this.setSettingValue = function(setting, value) {
      if (!(setting in settings)) {
        console.warn("Setting not defined: " + setting);
        return;
      }

      settings[setting].setValue(value);
    };

    this.loadSaveData = function() {
      var saveData = getSaveData();
      for (let key in saveData) {
        settings[key].setValue(saveData[key]);
      }
    };

    function getSaveData() {
      var d = localStorage.getItem(LS_LOCATIon);
      if (d == null) {
        return {};
      }

      try {
        var parsed = JSON.parse(d);
        for (let key in parsed) {
          if (!Object.prototype.hasOwnProperty.call(settings, key)) {
            delete parsed[key];
          }
        }
        return parsed;
      }
      catch(e) {
        console.warn("Could not load settings");
        console.error(e);
      }

      return {};
    }

    function saveSettings() {
      var data = {};
      for (let key in settings) {
        data[key] = settings[key].value;
      }

      localStorage.setItem(LS_LOCATIon, JSON.stringify(data));
    }
  }

  function wsIsOpen(ws) {
    return ws && ws.readyState == ws.OPEN;
  }
  
  function sendMessage(type, data = null) {
    if (wsIsOpen(ws)) {
      ws.send(JSON.stringify({
        type: type,
        data: data,
        clientSendTime: new Date()
      }));
    }
  }

  function sendLog(message) {
    var div = document.createElement("div");
    div.classList.add("message");
    div.textContent = message;
    messagesContainer.prepend(div);
  }
});