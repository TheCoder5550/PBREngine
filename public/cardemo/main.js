import Renderer, { Scene, GameObject, Camera, Light } from "../engine/renderer.mjs";
import Vector from "../engine/vector.mjs";
import Matrix from "../engine/matrix.mjs";
import Quaternion from "../engine/quaternion.mjs";
import GLDebugger from "../engine/GLDebugger.mjs";
import Terrain from "../engine/terrain.mjs";
import { LerpCurve } from "../engine/curves.mjs";
import { lerp, mapValue, clamp, loadImage, getImagePixelData, hideElement, showElement, roundNearest, roundToPlaces, randomFromArray, getAngleBetween, getDistanceBetween } from "../engine/helper.mjs";
import Perlin from "../engine/perlin.mjs";
import { GetMeshAABB, PhysicsEngine, MeshCollider, Rigidbody } from "../engine/physics.mjs";
import { Car } from "../car.js";
import * as carSettings from "./carSettings.mjs";
import Keybindings from "../keybindingsController.mjs";
import GamepadManager, { quadraticCurve, deadZone } from "../gamepadManager.js";

import * as roadSource from "../assets/shaders/custom/road.glsl.mjs";
import * as carPaintShader from "../assets/shaders/custom/carPaint.glsl.mjs";
import * as terrainShader from "./terrain.glsl.mjs";
import * as simpleFoliage from "../assets/shaders/custom/simpleFoliage.glsl.mjs";

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

document.addEventListener("DOMContentLoaded", function () {
  var pauseOverlay = document.querySelector(".pauseOverlay");
  var garageOverlay = document.querySelector(".garage");
  var loadingOverlay = document.querySelector(".loading");
  var settingsOverlay = document.querySelector(".settings");
  var selectCarButton = garageOverlay.querySelector(".selectCar");
  var progressBar = loadingOverlay.querySelector(".progressBar");
  var progressStatus = loadingOverlay.querySelector(".progressStatus");

  var stats;

  var ui = new GameCanvas({publicMethods: false});
  ui.canvas.classList.add("ingameUICanvas");
  ui.canvas.style.zIndex = 2;

  var renderer;
  var scene;
  var garageScene;
  var physicsEngine;
  var camera;
  var garageCamera;
  // var snowCamera;

  var settingsManager;
  var settingsOpened = false;
  var paused = false;

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

  (async function() {
    var totalTasks = 13;

    settingsManager = new SettingsManager();

    // Renderer
    setProgress(0, totalTasks, "Initializing renderer");
    renderer = new Renderer({
      path: "../",
      renderScale: 1,
      debug: true,

      shadowResolution: 256 * 8,
      shadowSizes: [4, 48],
    });
    renderer.canvas.style.position = "fixed";

    // Keybindings
    keybindings = new Keybindings(renderer, gamepadManager, bindsLookup);
    controllerUIInteraction = new ControllerUIInteraction(keybindings);

    // Scene
    setProgress(1, totalTasks, "Loading scene");
    console.time("Scene");
    scene = new Scene("Playground");
    scene.environmentIntensity = 1.1;//1.5 * 1.2;
    scene.sunIntensity = Vector.fromArray(Light.kelvinToRgb(5500, 27));
    renderer.postprocessing.exposure.value = -1;
    // renderer.postprocessing.saturation.value = 0.4;
    // renderer.settings.enableShadows = false;
    renderer.postprocessing.rainTexture = await renderer.loadTextureAsync("../assets/textures/rain-normal-map.jpg");
    renderer.postprocessing.vignette.amount.value = 0.3;
    renderer.postprocessing.vignette.falloff.value = 0.3;
    renderer.add(scene);

    await scene.loadEnvironment({
      // hdr: "../assets/hdri/kloofendal_48d_partly_cloudy_puresky_4k.hdr",
      hdrFolder: "../assets/hdri/kloofendal_48d_partly_cloudy_puresky_4k_precomputed",
      // res: 1024
    });
    console.timeEnd("Scene");

    // Garage scene
    setProgress(2, totalTasks, "Generating garage");
    console.time("Garage");
    garageScene = new Scene("Garage");
    garageScene.sunIntensity = Vector.zero();
    renderer.add(garageScene);
    await garageScene.loadEnvironment({
      // hdr: "../assets/hdri/studio_small_09_1k.hdr",
      hdrFolder: "../assets/hdri/studio_small_09_1k_precomputed",
      res: 512
    });
    console.timeEnd("Garage");

    garageScene.add(await renderer.loadGLTF("./garage.glb"));

    garageCamera = new Camera({ fov: 30 });
    garageCamera.transform.matrix = Matrix.lookAt(new Vector(0, 1.5, 6), new Vector(0, 0.5, 0), Vector.up());
    var resizeEvent = () => {
      garageCamera.setAspect(renderer.aspect);
    };
    renderer.on("resize", resizeEvent);
    resizeEvent();

    // Debugger
    // setProgress(3, totalTasks, "Initializing debugger");
    // window.Debug = new GLDebugger(scene);

    // Physics engine
    setProgress(4, totalTasks, "Initializing physics engine");
    physicsEngine = new PhysicsEngine(scene, {
      octreeLevels: 5,
      multipleTimestepsPerFrame: false
    });

    // Road program
    var roadProgram = new renderer.ProgramContainer(await renderer.createProgram(roadSource.webgl2.vertex, roadSource.webgl2.fragment));
    var terrainProgram = new renderer.CustomProgram(terrainShader);

    // Car paint
    setProgress(5, totalTasks, "Initializing car paint material");
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

    // // Snow heightmap
    // var snowRenderTexture = new renderer.RenderTexture(512, 512, {
    //   clearFlags: renderer.gl.DEPTH_BUFFER_BIT,
    // });
    // snowCamera = new Camera({
    //   type: Camera.Type.Orthographic,
    //   renderTexture: snowRenderTexture,
    //   layer: 0b10,
    //   size: 50,
    //   near: 0.1,
    //   far: 100,
    // });
    // snowCamera.transform.matrix = Matrix.lookAt(new Vector(0, 40, 0), Vector.zero(), new Vector(0, 0, -1));

    // Terrain
    // var terrain = new Terrain(scene);

    // var maxHeight = 400;
    // var imageRes = 1024;
    // const imageData = getImagePixelData(await loadImage("../assets/textures/terrainHeightmap.png"), imageRes, imageRes);

    // terrain.getHeight = (i, j) => {
    //   var u = mapValue(i, -500, 500, 0, imageRes - 1);
    //   var v = mapValue(j, -500, 500, 0, imageRes - 1);

    //   return bilinear(u, v, (a, b) => getHeightFromImage(a, b, imageData, imageRes, maxHeight));
    // }

    // terrain.chunkRes = 21//101;
    // terrain.chunkUpdatesPerFrame = 100;
    // await terrain.loadMaterials();
    // // terrain.terrainMat.setUniform("maxHeight", 0.3);
    // // terrain.terrainMat.setUniform("cameraSize", 50);
    // // terrain.terrainMat.setUniform("heightmap", snowRenderTexture.colorTexture);
    // terrain.update();

    // Load map
    setProgress(6, totalTasks, "Loading map");
    // const mapPath = "./touge.glb";
    // const colliderPath = "./tougeCollider.glb";
    // const mapPath = "../assets/models/brickPlane.glb";
    // const colliderPath = "../assets/models/brickPlane.glb";
    const mapPath = "../assets/models/test/staticColliderDetectObject.glb";
    const colliderPath = "";

    var grassAlbedo = await renderer.loadTextureAsync("../assets/textures/GroundForest003/GroundForest003_COL_VAR1_3K.jpg", { ...renderer.getSRGBFormats() });
    var grassNormal = await renderer.loadTextureAsync("../assets/textures/GroundForest003/GroundForest003_NRM_3K.jpg");
    var stoneAlbedo = await renderer.loadTextureAsync("../assets/textures/rocks_ground_03_2k_jpg/rocks_ground_03_diff_2k.jpg", { ...renderer.getSRGBFormats() });
    var stoneNormal = await renderer.loadTextureAsync("../assets/textures/rocks_ground_03_2k_jpg/rocks_ground_03_nor_2k.jpg");

    var map = await renderer.loadGLTF(mapPath, { maxTextureSize: 1024 });
    // var mapBatched = scene.add(renderer.BatchGameObject(map));

    await createChunks();

    // var dirtRoad = scene.add(await renderer.loadGLTF("../assets/models/dirtRoad.glb"));
    // dirtRoad.transform.position.y = 0.05;

    // var leaves = renderer.loadTexture("../assets/textures/leaves.png");
    // var foliage = new renderer.ProgramContainer(await renderer.createProgramFromFile("../assets/shaders/custom/webgl2/foliage"));
    // var foliageMat = new renderer.Material(foliage);
    // foliageMat.doubleSided = true;
    // foliageMat.setUniform("useTexture", 1);
    // foliageMat.setUniform("albedoTexture", leaves);

    // var tree = scene.add(await renderer.loadGLTF("../assets/models/tree.glb"));
    // tree.children[0].children[0].meshRenderer.materials[0] = tree.children[0].children[1].meshRenderer.materials[0] = foliageMat;

    // mapBatched.castShadows = false;
    // mapBatched.meshRenderer.materials[1].programContainer = terrainProgram;
    // mapBatched.meshRenderer.materials[1].setUniform("roughness", 1);
    // mapBatched.meshRenderer.materials[1].setUniform("albedoTextures[0]", [ grassAlbedo, stoneAlbedo ]);
    // mapBatched.meshRenderer.materials[1].setUniform("normalTextures[0]", [ grassNormal, stoneNormal ]);
    // // mapBatched.meshRenderer.materials[1].setUniform("albedo", [0.25, 0.25, 0.25, 1]);
    // mapBatched.meshRenderer.materials[2].setUniform("normalStrength", 2.5);
    // mapBatched.meshRenderer.materials[6].programContainer = renderer.programContainers.unlit;

    if (colliderPath) {
      var collider = await renderer.loadGLTF(colliderPath, { loadMaterials: false, loadNormals: false, loadTangents: false });
      collider.transform.set(map.transform);
      physicsEngine.addMeshCollider(collider);
    }

    // Load all car models
    setProgress(7, totalTasks, "Loading car models");
    var models = {};
    var modelOffset = {};
    var allowedCars = [ "skyline", "bus" ];

    var i = 0;
    for (var key of allowedCars) {
      var settings = carSettings[key];

      var model = await renderer.loadGLTF(settings.model);
      models[key] = model;

      var aabb = GetMeshAABB(model);
      modelOffset[key] = Vector.add(Vector.negate(aabb.getCenter()), new Vector(0, aabb.getSize().y / 2, 0));
      model.transform.position = Vector.add(new Vector(i * 5, 0, 0), modelOffset[key]);

      // model.transform.position = new Vector(i * 5, -1, 0);

      garageScene.add(model);

      i++;
    }

    // Setup car
    // var currentCarSettings = carSettings.drift;
    // var car = new Car(scene, physicsEngine, {
    //   path: renderer.path,
    //   keybindings,

    //   ...currentCarSettings.settings
    // });

    // var carModel = scene.add(models["drift"].copy());
    // carModel.transform.matrix = Matrix.identity();
    // await car.setup(carModel);

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

    // car.wheels.map(w => {
    //   w.model.setLayer(0b10, true);
    // });

    // initSnow();
    // await initTrees();

    // Load car
    setProgress(8, totalTasks, "Setting up car");
    var carKey = allowedCars[0];//"drift";
    var carModel = scene.add(models[carKey].copy());
    var car = await loadCar(carSettings[carKey].settings, carModel);

    // var controlPoints = JSON.parse('[{"x":238.9905803198908,"y":11.010891524613218,"z":0},{"x":248.35707929750777,"y":12.723226116925797,"z":180.44198024083917},{"x":86.43430472565373,"y":2.3016814664524694,"z":266.0174367013337},{"x":-68.42980023211553,"y":0.19100462446428695,"z":210.60526962657337},{"x":-291.0143147923255,"y":11.280076252913517,"z":211.43427595496414},{"x":-367.37847338756524,"y":44.89847560608845,"z":4.4990887150972286e-14},{"x":-244.37662920532279,"y":21.023621965313925,"z":-177.55001396826387},{"x":-88.49153796618087,"y":6.502505256081859,"z":-272.34894957783365},{"x":75.79755225098485,"y":0.26559658178005546,"z":-233.28087872103728},{"x":209.2681935881474,"y":11.838977337235947,"z":-152.04224240064795}]');
    // var crCurve = new CatmullRomCurve(controlPoints, 0.5);
    // initRoad(crCurve);

    setProgress(9, totalTasks, "Finalizing physics colliders");
    physicsEngine.setupMeshCollider();

    // var noTreeZone = scene.add(await renderer.loadGLTF("./noTreeZone.glb"), { loadMaterials: false, loadNormals: false, loadTangents: false });
    // noTreeZone.visible = false;
    // noTreeZone.transform.position.y = 500;
    // for (var child of noTreeZone.children) {
    //   child.addComponent(new MeshCollider());
    // }

    // Grass
    setProgress(10, totalTasks, "Planting trees");
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

    // Reflection probe
    // setProgress(11, totalTasks, "Generating cubemap");
    // var cubemap = renderer.captureReflectionCubemap(Vector.add(car.rb.position, new Vector(0, 6, 0)));
    // var oldSkybox = scene.skyboxCubemap;
    // await scene.loadEnvironment({ cubemap });
    // scene.skyboxCubemap = oldSkybox;
    // scene.environmentIntensity = 1;

    var meModel = scene.add(models["skyline"].copy());
    var meRb = meModel.addComponent(new Rigidbody());
    meRb.gravityScale = 0;

    ws = new WebSocket(`wss://${location.hostname}:8080`);
    ws.onopen = function() {
      console.log("Connected to server!");

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
    ws.onmessage = function(msg) {
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
              break;
            case "leave":
              console.log("Player has left!", parsed.data.clientID);
              break;
          }
        }
        else if (parsed.type == "getAllPlayers") {
          var p = parsed.data[0].data;
          meRb.position = p.position;
          meRb.rotation = p.rotation;
          meRb.velocity = p.velocity;
          meRb.angularVelocity = p.angularVelocity;
        }
      }
    }

    document.addEventListener("visibilitychange", function() {
      if (document.hidden) {
        paused = true;
      }

      handlePauseChange();
    }, false);

    setProgress(12, totalTasks, "Done!");

    settingsManager.loadSaveData();
    hideElement(loadingOverlay);
    stats = new Stats();
    document.body.appendChild(stats.dom);

    renderer.on("renderloop", function(frameTime, totalTime) {
      ui.clearScreen();

      handleInput(frameTime);

      if (renderer.activeScene() == scene) {
        // terrain.update(car.mainCamera.transform);
        // terrain.update();

        if (!paused) {
          // scene.updateLights();

          physicsEngine.update();
          car.update(frameTime);
          car.renderUI(ui);

          renderer.update(frameTime); // scene.update(frameTime);
          renderer.render(car.mainCamera/*, [ snowCamera ]*/);
        }
      }
      else {
        var carRotQuat = Quaternion.euler(0, carRotation, 0);

        garageScene.root.getChild("spin", true).transform.rotation = carRotQuat;

        var i = 0;
        for (var key in models) {
          var model = models[key];

          var target = Vector.add(new Vector((i - selectedCar) * 20, 0, 0), modelOffset[key]);
          Vector.addTo(model.transform.position, Vector.multiply(Vector.subtract(target, model.transform.position), 0.3));
        
          model.transform.rotation = carRotQuat;

          i++;
        }

        carRotation += frameTime * 0.1;

        renderer.update(frameTime);
        if (!paused) renderer.render(garageCamera);
      }

      // scene.root.traverse(o => {
      //   o.prevModelMatrix = Matrix.copy(o.transform.worldMatrix);
      // });

      stats.update();
    });

    window.renderer = renderer;
    window.scene = scene;
    window.physicsEngine = physicsEngine;
    window.camera = camera;
    // window.terrain = terrain;
    window.car = car;

    window.isDay = function(day) {
      if (day) {
        scene.environmentIntensity = 1;
        scene.sunIntensity = Vector.fromArray(Light.kelvinToRgb(5500, 27));
        grass.children[0].meshRenderer.materials[0].setUniform("albedo", [2, 2, 2, 1]);
      }
      else {
        scene.environmentIntensity = 0;
        scene.sunIntensity = Vector.fill(0.25);
        grass.children[0].meshRenderer.materials[0].setUniform("albedo", [0.1, 0.1, 0.1, 1]);
      }
    }

    window.selectCar = async function() {
      if (loadedCar !== selectedCar) {
        var oldPosition = Vector.copy(car.rb.position);
        oldPosition.y = 0;

        car.destroy();

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
      car.reset();
      car.rb.position = Vector.copy(car.resetPosition);
      // car.rb.position.y = terrain.getHeight(car.rb.position.x, car.rb.position.z) + 1;

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

    function setProgress(currentTask, totalTasks, textStatus) {
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

      if (!paused && renderer.activeScene() == garageScene) {
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

    function setCarName() {
      garageOverlay.querySelector(".carName").textContent = carSettings[Object.keys(models)[selectedCar]].name;
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
          if (renderer.activeScene() != scene) {
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

      car.gameObject.traverse(gameObject => {
        if (gameObject.meshRenderer) {
          var mats = gameObject.meshRenderer.materials;
          for (var mat of mats) {
            if (mat.name.toLowerCase() == "carpaint") {
              var i = mats.indexOf(mat);
              mats[i] = paints.darkgray;
              mats[i].setUniform("flakeScale", 50);
            }

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
      var spawnPoints = map.getChildren("SpawnPoint", true, false);
      var spawnPoint = randomFromArray(spawnPoints);
      var carResetPosition = spawnPoint ? Vector.subtract(spawnPoint.transform.worldPosition, car.bottomOffset) : new Vector(0, 5, 0);
      car.resetPosition = Vector.copy(carResetPosition);
      car.rb.position = car.gameObject.transform.position = Vector.copy(carResetPosition);

      // car.rb.rotation = Quaternion.euler(0, Math.PI, 0);

      car.mainCamera = new Camera({near: 0.1, far: 15000, fov: 35});
      car.mainCamera.setAspect(renderer.aspect);

      car.ABS = settingsManager.getSettingValue("abs");
      car.TCS = settingsManager.getSettingValue("tcs");
      car.activateAutoCountersteer = settingsManager.getSettingValue("steeringAssist");
      car.autoCountersteer = settingsManager.getSettingValue("autoCountersteer");
      car.autoCountersteerVelocityMultiplier = settingsManager.getSettingValue("autoCountersteerVelocityMultiplier");
      car.followCamera.followMode = settingsManager.getSettingValue("cameraFollowMode");
      car.mainGainNode.gain.value = settingsManager.getSettingValue("masterVolume");

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

    async function createChunks() {
      var chunkSize = 100;

      var grassMaterial = renderer.CreateLitMaterial({
        albedoTexture: renderer.loadTexture("../assets/textures/brown_mud_leaves_01_2k_jpg/brown_mud_leaves_01_diff_2k.jpg", { ...renderer.getSRGBFormats() }),
        normalTexture: renderer.loadTexture("../assets/textures/brown_mud_leaves_01_2k_jpg/brown_mud_leaves_01_Nor_2k.jpg"),
      });

      var simpleFoliageProgram = new renderer.CustomProgram(simpleFoliage);
      var treesBase = await renderer.loadGLTF("../assets/models/trees/stylizedAutumn.glb");

      var roadMaterial = renderer.CreateLitMaterial({
        albedoColor: [0.3, 0.3, 0.3, 1],
        albedoTexture: renderer.loadTexture("../assets/textures/roadNoCenterLine/albedo.png", { ...renderer.getSRGBFormats() }),
        normalTexture: renderer.loadTexture("../assets/textures/roadNoCenterLine/normal.png"),
        metallicRoughness: renderer.loadTexture("../assets/textures/roadNoCenterLine/metallicRoughness.png"),
        // albedoTexture: renderer.loadTexture("../assets/textures/asphalt_01_1k/asphalt_01_diff_1k.jpg", { ...renderer.getSRGBFormats() }),
        // normalTexture: renderer.loadTexture("../assets/textures/asphalt_01_1k/asphalt_01_nor_gl_1k.png"),
      }/*, roadProgram*/);
      // roadMaterial.setUniform("albedo", [1, 1, 1, 1]);
      // roadMaterial.setUniform("albedoTexture", renderer.loadTexture("./assets/textures/checkerboard2.png"));

      var points = [];
      var startY = 0;
      var yVel = 0;

      points.push(new Vector(0, startY, -chunkSize * 0.7));
      points.push(new Vector(0, startY, -chunkSize * 0.5));

      for (var i = 1; i < 9; i++) {
        points.push(new Vector(0, startY/*Math.random() * 5*/, -chunkSize / 2 + i * chunkSize / 3));
      }

      var chunks = [
        await createChunk(points.slice(0, 7)),
        await createChunk(points.slice(3, 10), new Vector(0, 0, 100)),
        // await createChunk(points.slice(6, 13), new Vector(0, 0, 200)),
        // await createChunk(points.slice(9, 16), new Vector(0, 0, 300)),
      ];

      setInterval(async function() {
        for (let i = 0; i < chunks.length; i++) {
          var chunk = chunks[i];

          chunk.visible = (Math.abs(i * chunkSize - car.rb.position.z) < chunkSize * 2);

          // if (i * chunkSize < car.rb.position.z - chunkSize * 2 || i * chunkSize > car.rb.position.z + chunkSize * 2) {
          //   chunk.visible = false;
          // }
          // else {
          //   chunk.visible = true;
          // }
        }

        if (car.rb.position.z > (chunks.length - 2) * chunkSize) {
          for (let i = 0; i < 3; i++) {
            yVel += (Math.random() - 0.55) * 2;
            yVel = clamp(yVel, -8, 8);
            startY += yVel;
            points.push(new Vector((Math.random() - 0.5) * chunkSize * 0.3, startY/*Math.random() * 3*/, -chunkSize / 2 + (points.length - 1) * chunkSize / 3));
          }

          chunks.push(await createChunk(points.slice(chunks.length * 3, chunks.length * 3 + 7), new Vector(0, 0, chunks.length * chunkSize)));
        }
      }, 1000);

      async function createChunk(points, center = Vector.zero()) {
        var roadCurve = new CatmullRomCurve(points.map(p => Vector.subtract(p, center)));
        return await generateRoad(center, roadCurve, 10, 100);
      }
  
      async function generateRoad(chunkCenter, crCurve, width = 12, segments = 100) {
        var container = new GameObject("Chunk");
        container.transform.position = chunkCenter;
  
        // // Ground
        // var plane = renderer.CreateShape("plane", grassMaterial);
  
        // var uvScale = 50;
        // plane.meshRenderer.meshData[0].setAttribute("uv", { bufferData: new Float32Array([
        //   uvScale, uvScale,
        //   0, uvScale,
        //   0, 0,
        //   uvScale, 0
        // ]) });
  
        // plane.transform.rotation = Quaternion.euler(-Math.PI / 2, 0, 0);
        // plane.transform.scale = Vector.fill(50);
        // plane.addComponent(new MeshCollider());
        
        // plane.customData.bumpiness = 0.03;
        // plane.customData.friction = 0.5;
        // plane.customData.offroad = 1;
  
        // container.addChild(plane);
  
        // Trees
        var trees = container.add(treesBase.copy());
        trees.children[0].meshRenderer = trees.children[0].meshRenderer.getInstanceMeshRenderer();
        var mr = trees.children[0].meshRenderer;
        mr.materials[0].programContainer = simpleFoliageProgram;
        mr.materials[0].doubleSided = false;
  
        function addTree(origin) {
          mr.addInstance(Matrix.transform([
            ["translate", Vector.add(chunkCenter, origin)],
            ["scale", Vector.fill(1 + Math.random() * 1)],
            ["ry", Math.random() * 2 * Math.PI],
            ["rx", (Math.random() - 0.5) * 0.07],
            ["rz", (Math.random() - 0.5) * 0.07],
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
          var t = s / (segments - 1) * 0.75;
          var center = crCurve.getPoint(t);
          
          var diff;
          // if (t + step >= 1) {
          //   diff = Vector.subtract(
          //     center,
          //     crCurve.getPoint(t - step),
          //   );
          // }
          // else {
            diff = Vector.subtract(
              crCurve.getPoint(t + step),
              center
            );
            // console.log(diff);
          // }
          var tangent = Vector.normalize(diff);
  
          var normal = Quaternion.QxV(Quaternion.angleAxis(Math.PI / 2, tangent), Vector.up());
          
          var edge = Vector.multiply(normal, width / 2); // inner edge
          var margin = Vector.multiply(normal, width / 2 * 1.4); // outer edge
  
          var e1 = Vector.add(center, edge);
          var m1 = Vector.add(center, margin);
          m1.y -= width * 0.06;
          var e2 = Vector.subtract(center, edge);
          var m2 = Vector.subtract(center, margin);
          m2.y -= width * 0.06;
  
          vertices.push(m1.x, m1.y, m1.z);
          vertices.push(e1.x, e1.y, e1.z);
          vertices.push(e1.x, e1.y, e1.z);
          vertices.push(e2.x, e2.y, e2.z);
          vertices.push(e2.x, e2.y, e2.z);
          vertices.push(m2.x, m2.y, m2.z);
  
          var v = distanceAlongPath / width;
          uvs.push(-0.4, v);
          uvs.push(0, v);
          uvs.push(0, v);
          uvs.push(1, v);
          uvs.push(1, v);
          uvs.push(1.4, v);

          // var farEdge = Vector.multiply(normal, width * 2);
          var l1 = Vector.add(e1, new Vector(-width * 4, width * 0.3, 0));
          var ll1 = Vector.add(e1, new Vector(-width * 8, width * 0.4, 0));
          var l2 = Vector.add(e2, new Vector(width * 4, width * 0.3, 0));
          var ll2 = Vector.add(e2, new Vector(width * 8, width * 0.4, 0));

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
  
          if (Math.random() > 0.6) {
            addTree(Vector.add(Vector.add(center, Vector.multiply(normal, width / 2 * 1.6 + Math.random() * 3 * 15)), new Vector(0, -width * 0.06, 0)));
            addTree(Vector.add(Vector.subtract(center, Vector.multiply(normal, width / 2 * 1.6 + Math.random() * 3 * 15)), new Vector(0, -width * 0.06, 0)));
          }
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

        // Terrain
        var terrainMeshData = new renderer.MeshData({
          indices: {
            bufferData: new Uint32Array(groundIndices),
            target: renderer.gl.ELEMENT_ARRAY_BUFFER
          },
          position: {
            bufferData: new Float32Array(groundVertices),
            size: 3
          },
          uv: {
            bufferData: new Float32Array(groundUVs),
            size: 2
          }
        });
        terrainMeshData.recalculateNormals();
        terrainMeshData.recalculateTangents();

        var terrain = new GameObject("Terrain");
        terrain.meshRenderer = new renderer.MeshRenderer(grassMaterial, terrainMeshData);
        terrain.addComponent(new MeshCollider());
        terrain.transform.position.y = -0.04;

        terrain.customData.bumpiness = 0.08;
        terrain.customData.friction = 0.5;
        terrain.customData.offroad = 1;

        container.addChild(terrain);
  
        // Export
        scene.add(container);
        return container;
      }
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
      
      var m = new renderer.Material(renderer.programContainers.particle);
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
      }

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
      }

      this.getPoint = function(t) {
        // t = clamp(t, 0, 1);

        if (t >= 1) {
          return segments[segments.length - 1].getPoint(t);
        }

        var segment = Math.floor(t * segments.length);
        return segments[segment].getPoint((t * segments.length) % 1);
      }
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
      }

      this.distanceSqrToPoint = function(p) {
        // var closestDistance = Infinity;
        // var closestPoint;

        var projP = Vector.copy(p);
        projP.y = 0;

        var d;
        var step = 0.5;
        var start = 0;
        var end = 1;
        while (step >= 0.005) {
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
      }

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
      }

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
      }

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
          car.mainGainNode.gain.value = value;
          saveSettings();
        }, 0, 2, 0.01, true),

        _displayGroup: new SettingGroup("Graphics"),

        renderScale: new SliderSetting("Render scale", 1, value => {
          renderer.setRenderScale(value);
          saveSettings();
        }, 0.2, 2, 0.05),

        motionBlur: new SliderSetting("Motion blur", 0.15, value => {
          renderer.postprocessing.motionBlurStrength.value = value;
          saveSettings();
        }, 0, 0.5, 0.01),

        _gameplayGroup: new SettingGroup("Gameplay"),

        cameraFollowMode: new DropdownSetting("Camera follow mode", 1, value => {
          car.followCamera.followMode = value;
          saveSettings();
        }, [
          "Follow velocity",
          "Follow direction"
        ], [
          1,
          2
        ]),

        _assistGroup: new SettingGroup("Assists"),

        abs: new CheckboxSetting("ABS", true, value => {
          car.ABS = value;
          saveSettings();
        }),

        tcs: new CheckboxSetting("TCS", false, value => {
          car.TCS = value;
          saveSettings();
        }),

        steeringAssist: new CheckboxSetting("Steering assist", true, value => {
          car.activateAutoCountersteer = value;
          saveSettings();
        }),

        autoCountersteer: new SliderSetting("Auto countersteer", 0.25/*0.6*/, value => {
          car.autoCountersteer = value;
          saveSettings();
        }, 0, 1, 0.05),

        autoCountersteerVelocityMultiplier: new SliderSetting("Auto countersteer velocity", 0.15/*0.2*/, value => {
          car.autoCountersteerVelocityMultiplier = value;
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
      }

      this.setSettingValue = function(setting, value) {
        if (!(setting in settings)) {
          console.warn("Setting not defined: " + setting);
          return;
        }

        settings[setting].setValue(value);
      }

      this.loadSaveData = function() {
        var saveData = getSaveData();
        for (let key in saveData) {
          settings[key].setValue(saveData[key]);
        }
      }

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

  })();

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
});