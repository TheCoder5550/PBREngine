import Stats from "../statsModule.mjs";
import GameCanvas from "../gameCanvas-6.0-module.mjs";
import * as ENUMS from "../engine/constants.mjs";
import Renderer from "../engine/renderer.mjs";
import { Scene } from "../engine/scene.mjs";
import { GameObject } from "../engine/gameObject.mjs";
import { Camera } from "../engine/camera.mjs";
import Vector from "../engine/vector.mjs";
import Matrix from "../engine/matrix.mjs";
import Quaternion from "../engine/quaternion.mjs";
import { LerpCurve } from "../engine/curves.mjs";
import { lerp, mapValue, clamp, loadImage, hideElement, showElement, getAngleBetween, getDistanceBetween, sleep, smoothstep } from "../engine/helper.mjs";
import Perlin from "../engine/perlin.mjs";
import { GetMeshAABB, PhysicsEngine, MeshCollider } from "../engine/physics.mjs";
import { Car } from "../car.js";
import * as carSettings from "./carSettings.mjs";
import Keybindings from "../keybindingsController.mjs";
import GamepadManager, { quadraticCurve, deadZone } from "../gamepadManager.js";
import OrbitCamera from "../engine/orbitCamera.mjs";
import { NewMaterial } from "../engine/material.mjs";
import Terrain from "../engine/terrain.mjs";
import { CatmullRomCurve } from "../engine/curves.mjs";
import PRNG from "../PRNG.mjs";
import { getTriangleNormal } from "../engine/algebra.mjs";
import GLDebugger from "../engine/GLDebugger.mjs";

// import * as roadSource from "../assets/shaders/custom/road.glsl.mjs";
import * as carPaintShader from "../assets/shaders/custom/carPaint.glsl.mjs";
import * as litTerrainSource from "../assets/shaders/custom/litTerrain.glsl.mjs";
import * as terrainShader from "./terrain.glsl.mjs";
import * as simpleFoliage from "../assets/shaders/custom/simpleFoliage.glsl.mjs";
// import createInspector from "../engine/inspector/inspector.mjs";
import City from "./city.mjs";
import TreeHandler from "../engine/treeHandler.mjs";

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
      this.selectedElement.onSelect?.();
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
    const canvas = document.createElement( "canvas" );
    canvas.width = width;
    canvas.height = height;
  
    const context = canvas.getContext( "2d" );
    context.fillStyle = "rgb(127,127,255)";
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
  
      context.fillStyle = "rgb(" + ( nx * 127 + 127 ) + "," + ( ny * 127 + 127 ) + "," + ( nz * 255 ) + ")";
      context.beginPath();
      context.arc( x, y, r, 0, Math.PI * 2 );
      context.fill();
  
    }
  
    return canvas;
  }
}

document.addEventListener("DOMContentLoaded", async function () {
  const pauseOverlay = document.querySelector(".pauseOverlay");
  const garageOverlay = document.querySelector(".garage");
  const loadingOverlay = document.querySelector(".loading");
  const settingsOverlay = document.querySelector(".settings");
  const progressBar = loadingOverlay.querySelector(".progressBar");
  const progressStatus = loadingOverlay.querySelector(".progressStatus");
  let lastTextStatus;
  const messagesContainer = document.querySelector(".messages");
  const garageCarList = document.querySelector("#carList");

  const seed = "apples";
  const prng = new PRNG(seed);
  const perlin = new Perlin();
  let stats;

  const ui = new GameCanvas(undefined, { publicMethods: false });
  ui.canvas.classList.add("ingameUICanvas");
  ui.canvas.style.zIndex = 2;

  // var snowCamera;

  var settingsOpened = false;
  var paused = false;

  const spawnPosition = new Vector(0, 2, 0);
  const spawnRotation = Quaternion.identity();
  const allowedCars = [ "tocus", "myLowpolySportsCar", "lowpolyJeep" ];
  // const allowedCars = [
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
  //   "porscheCarreraGTConcept2000",
  // ];
  let selectedCar = 0;
  let loadedCar = 0;
  let carRotation = 0;
  let garageFOV = 30;

  const gamepadManager = new GamepadManager();
  const bindsLookup = {
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
      keyboard: "KeyF",
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

    shadowResolution: 1024 * 2,
    shadowSizes: [32 * 2, 256],
    shadowBiases: [1, 1],
  });
  renderer.disableContextMenu();
  renderer.canvas.style.position = "fixed";

  renderer.on("mousemove", () => {
    if (renderer.getActiveScene() !== garageScene) {
      return;
    }

    if (!renderer.mouse.left) {
      return;
    }

    carRotation += renderer.mouse.movement.x * 0.01;
  });

  renderer.on("scroll", () => {
    if (renderer.getActiveScene() !== garageScene) {
      return;
    }

    garageFOV += renderer.mouse.scroll.y * 0.01;
    garageFOV = clamp(garageFOV, 10, 40);
    garageCamera.setFOV(garageFOV);
  });

  window.isDay = isDay;
  const settingsManager = new SettingsManager();
  const keybindings = new Keybindings(renderer, gamepadManager, bindsLookup);
  const controllerUIInteraction = new ControllerUIInteraction(keybindings);

  // Scene
  setProgress(currentTask++, totalTasks, "Loading scene");
  const scene = new Scene("Playground");
  renderer.add(scene);

  scene.fogColor = [0.4, 0.4, 0.5, 1];
  scene.fogDensity = 0.001;
  scene.skyboxFogIntensity = 1;
  scene.environmentMinLight = 0.5;
  scene.skyboxAnimation.speed = 0.01;

  scene.postprocessing.exposure = -1;
  scene.postprocessing.vignette.amount = 0.3;
  scene.postprocessing.vignette.falloff = 0.3;
  // scene.postprocessing.saturation = 0.4;
  // scene.postprocessing.rainTexture = await renderer.loadTextureAsync("../assets/textures/rain-normal-map.jpg");

  renderer.shadowCascades.refreshRate = 0;

  isDay(true);

  // lowpolyDesert has artifacts in diffuse.hdr
  // await scene.loadEnvironment({ hdrFolder: "cubemaps/lowpolyDesert" });

  await scene.loadEnvironment({
    // hdr: "../assets/hdri/kloofendal_48d_partly_cloudy_puresky_4k.hdr",
    hdrFolder: "../assets/hdri/kloofendal_48d_partly_cloudy_puresky_1k_precomputed",
    // hdrFolder: "../assets/hdri/snowy_field_1k",
    // res: 1024
  });

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
  garageCamera.transform.matrix = Matrix.lookAt(new Vector(1.5, 1.5, 6), new Vector(1.5, 0.5, 0), Vector.up());
  var resizeEvent = () => {
    garageCamera.setAspect(renderer.aspect);
  };
  renderer.on("resize", resizeEvent);
  resizeEvent();

  // Debugger
  // setProgress(currentTask++, totalTasks, "Initializing debugger");
  window.Debug = new GLDebugger(scene, 1000);
  // window.Debug = {
  //   Bounds: () => {},
  //   Vector: () => {},
  //   Point: () => {}
  // };

  // Physics engine
  setProgress(currentTask++, totalTasks, "Initializing physics engine");
  const physicsEngine = new PhysicsEngine(scene, {
    // octreeLevels: 5,
    octreeLevels: 7, // Playground needs more levels because of areas with denser triangles (or maybe because of big baseplate area)
    multipleTimestepsPerFrame: false
  });

  // Road program
  // var roadProgram = new renderer.ProgramContainer(await renderer.createProgram(roadSource.webgl2.vertex, roadSource.webgl2.fragment));

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
    blue: new CarPaintMaterial(renderer, carPaintProgram, {
      flakesNormalTexture: flakes,
      flakeScale: 10_000,
      metallic: 1,
      roughness: 0.5,
      clearcoatRoughness: 0,
      clearcoatFactor: 0.5,
      twoTone: 0,
      color1: [0.1, 0.1, 0.9],
    }),
  };

  // Load all car models
  setProgress(currentTask++, totalTasks, "Loading car models");
  var models = {};
  var modelOffset = {};

  for (let i = 0; i < allowedCars.length; i++) {
    const key = allowedCars[i];

    setProgress(currentTask++, totalTasks, `Loading car number ${i + 1}: ${key}`);

    const settings = carSettings[key];

    const model = await renderer.loadGLTF(settings.model);
    models[key] = model;

    // Apply custom paint material
    model.traverse(gameObject => {
      if (gameObject.meshRenderer) {
        var mats = gameObject.meshRenderer.materials;
        for (var mat of mats) {
          if (mat.name.toLowerCase() == "carpaint") {
            var i = mats.indexOf(mat);
            mats[i] = paints.blue;
            mats[i].setUniform("flakeScale", 50);
          }
          // mat.uniforms["enableMotionBlur"] = 0;
        }
      }
    });

    const aabb = GetMeshAABB(model);
    modelOffset[key] = Vector.add(Vector.negate(aabb.getCenter()), new Vector(0, aabb.getSize().y / 2, 0));
    model.transform.position = Vector.add(new Vector(i * 5, 0.1, 0), modelOffset[key]);

    garageScene.add(model);

    // Add garage listing
    const item = garageCarList.appendChild(document.createElement("div"));
    item.classList.add("item", "isSelectable");

    const nameLabel = item.appendChild(document.createElement("span"));
    nameLabel.classList.add("name");
    nameLabel.textContent = settings.name;
    
    item.onSelect = () => {
      selectedCar = clamp(i, 0, Object.keys(models).length - 1);
      setCarName();
    };

    item.addEventListener("click", () => {
      if (selectedCar == i) {
        window.selectCar();
        return;
      }

      controllerUIInteraction.selectElement(item);
    });
  }

  // Load car
  setProgress(currentTask++, totalTasks, "Setting up car");
  var carKey = allowedCars[0];
  var carModel = scene.add(models[carKey].copy());
  let trailer;
  let car;
  car = await loadCar(carSettings[carKey].settings, carModel);

  // Load map
  setProgress(currentTask++, totalTasks, "Loading map");

  // const { terrain } = await generateCity();
  // const { terrain, checkChunks } = await generateLowpolyForest();
  const { terrain, checkChunks } = await generateForest();
  // const { terrain } = await generateTerrain();
  // const { terrain } = await generatePlayground();
  // const { terrain } = await generateTouge();

  // Re-set spawnpoint since maps changes it
  // Spawn position
  Vector.set(car.resetPosition, spawnPosition);
  car.resetPosition.y -= car.bottomOffset.y;

  const longestSuspension = Math.max(...car.wheels.map(w => w.suspensionTravel));
  car.resetPosition.y += longestSuspension * 0.5;

  Vector.set(car.rb.position, car.resetPosition);
  car.gameObject.transform.position = Vector.copy(car.rb.position);

  // Spawn rotation
  Quaternion.set(car.resetRotation, spawnRotation);
  Quaternion.set(car.rb.rotation, car.resetRotation);
  car.gameObject.transform.rotation = Quaternion.copy(car.rb.rotation);

  // // Reflection probe
  // await sleep(6000);
  // setProgress(currentTask++, totalTasks, "Generating cubemap");
  // var cubemap = renderer.captureReflectionCubemap(new Vector(0, 1, 0));
  // var oldSkybox = scene.skyboxCubemap;
  // await scene.loadEnvironment({ cubemap });
  // scene.skyboxCubemap = oldSkybox;
  // scene.environmentIntensity = 1;

  setProgress(currentTask++, totalTasks, "Finalizing physics colliders");
  physicsEngine.setupMeshCollider();

  // let m = scene.add(renderer.CreateShape("sphere")).meshRenderer.materials[0];
  // m.setUniform("roughness", 0);
  // m.setUniform("metallic", 1);

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
          steerInput: car.getRawSteerInput(),
          driveInput: car.getDriveInput(),
          ebrakeInput: car.getEbrakeInput(),
          brakeInput: car.getBrakeInput(),
          clutchInput: car.getClutchInput()
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

    if (
      Object.prototype.hasOwnProperty.call(parsed, "type") &&
      Object.prototype.hasOwnProperty.call(parsed, "data")
    ) {
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
            var otherModel = othersModels[parsed.data.clientID];
            if (otherModel) {
              otherModel.model.remove();
            }

            delete othersModels[parsed.data.clientID];

            console.log("Player has left!", parsed.data.clientID);
            sendLog(`${parsed.data.clientID} has left`);
            break;
        }
      }
      else if (parsed.type == "getAllPlayers") {
        for (let player of parsed.data) {
          let otherModel = othersModels[player.clientID];
          if (!otherModel) {
            let model = scene.add(models[allowedCars[0]].copy());
            let car = await loadCar(carSettings[allowedCars[0]].settings, model);
            // car.activateAutoCountersteer = false;
            // car.simulateFriction = false;
            car.update = () => {};

            othersModels[player.clientID] = otherModel = {
              model,
              car,
            };
          }

          const car = otherModel.car;
          const rb = car.rb;
          const d = player.data;
          rb.position = d.position;
          rb.rotation = d.rotation;
          rb.velocity = d.velocity;
          rb.angularVelocity = d.angularVelocity;
          car.setRawSteerInput(d.steerInput);
          car.setDriveInput(d.driveInput);
          car.setEbrakeInput(d.ebrakeInput);
          car.setBrakeInput(d.brakeInput);
          car.setClutchInput(d.clutchInput);
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

  settingsManager.loadSaveData();

  if (settingsManager.getSettingValue("Show FPS")) {
    stats = new Stats();
    document.body.appendChild(stats.dom);
  }

  // createInspector(renderer);

  setProgress(currentTask++, totalTasks, "Done!");
  hideElement(loadingOverlay);

  renderer.on("renderloop", function(frameTime) {
    ui.clearScreen();

    handleInput(frameTime);

    const activeScene = renderer.getActiveScene();
    if (activeScene == scene) {
      handleMainScene(frameTime);
    }
    else if (activeScene == garageScene) {
      handleGarageScene(frameTime);
    }

    stats?.update();
  });

  window.renderer = renderer;
  window.scene = scene;
  window.physicsEngine = physicsEngine;
  window.car = car;

  function handleMainScene(frameTime) {
    if (!paused) {
      let currentCamera = car ? car.mainCamera : fallbackCamera.camera;

      // scene.updateLights();

      // terrain.update();
      terrain?.update(currentCamera.transform);

      physicsEngine.update();
      if (car) {
        if (car.rb.position.y < -300) {
          car.resetGame();
        }

        car.update(frameTime);
        car.renderUI(ui);
      }

      renderer.update(frameTime); // scene.update(frameTime);
      renderer.render(currentCamera/*, [ snowCamera ]*/);
    }
  }

  function handleGarageScene(frameTime) {
    const carRotQuat = Quaternion.euler(0, carRotation, 0);

    garageScene.root.getChild("spin", true).transform.rotation = carRotQuat;

    let i = 0;
    for (const key in models) {
      const model = models[key];

      const target = Vector.add(new Vector((i - selectedCar) * 20, 0.1, 0), modelOffset[key]);
      Vector.addTo(model.transform.position, Vector.multiply(Vector.subtract(target, model.transform.position), 0.3));
    
      model.transform.rotation = carRotQuat;

      model.visible = selectedCar == i;

      i++;
    }

    if (!renderer.mouse.left) {
      carRotation += frameTime * 0.1;
    }

    renderer.update(frameTime);
    if (!paused) renderer.render(garageCamera);
  }

  function isDay(day) {
    if (day) {
      applyDaytimeEnvironment();
    }
    else {
      applyNighttimeEnvironment();
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

      loadedCar = selectedCar;
      
    }

    for (const child of garageCarList.children) {
      child.style.background = "";
    }
    garageCarList.children[loadedCar].style.background = "red";

    // selectCarButton.disabled = loadedCar == selectedCar;
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
    window.checkChunks?.();

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

    if (progressBar) {
      progressBar.querySelector(".progress").style.width = `${currentTask / totalTasks * 100}%`;
    }
    // progressStatus.textContent = `${textStatus} (${currentTask}/${totalTasks})`;
    progressStatus.textContent = `${textStatus} (${Math.floor(currentTask / totalTasks * 100)}%)`;
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
      // if (keybindings.getInputDown("garagePrev")) {
      //   garageChangeCar(-1);
      // }
      // if (keybindings.getInputDown("garageNext")) {
      //   garageChangeCar(1);
      // }
      // if (keybindings.getInputDown("menuSelect")) {
      //   window.selectCar();
      // }

      carRotation += -quadraticCurve(deadZone(gamepadManager.getAxis("RSHorizontal"), 0.08)) * frameTime * 5;
    }

    controllerUIInteraction.update(frameTime);
  }

  function garageChangeCar(dir = 1) {
    selectedCar += dir;
    selectedCar = clamp(selectedCar, 0, Object.keys(models).length - 1);

    // selectCarButton.disabled = loadedCar == selectedCar;
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
      controllerUIInteraction.selectElement(garageCarList.children[loadedCar]);

      for (const child of garageCarList.children) {
        child.style.background = "";
      }
      garageCarList.children[loadedCar].style.background = "red";
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
    garageOverlay.querySelectorAll(".stats .value")[4].textContent = `Friction: ${css.friction}` ?? "UNKNOWN";
    garageOverlay.querySelectorAll(".stats .value")[5].textContent = `${css.maxSteerAngle} deg` ?? "UNKNOWN";
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
            mats[i] = paints.blue;
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

    // // var resetPosition = Vector.copy(carResetPosition);
    // // resetPosition.y = terrain.getHeight(resetPosition.x, resetPosition.z) + 0.5;

    // // var spawnPoints = map.getChildren("SpawnPoint", true, false);
    // var spawnPoint = null;//randomFromArray(spawnPoints);
    // var carResetPosition = spawnPoint ? Vector.subtract(spawnPoint.transform.worldPosition, car.bottomOffset) : new Vector(0, 10, 0);
    // // carResetPosition = new Vector(0, terrain.getHeight(0, 0) + 3, 0);
    // // carResetPosition = track.curve.getPoint(0);
    // carResetPosition.y = terrain.getHeight(carResetPosition.x, carResetPosition.z) - car.bottomOffset.y + car.wheels[0].suspensionTravel + 5;

    // car.resetPosition = Vector.copy(carResetPosition);
    // car.rb.position = Vector.copy(carResetPosition);
    // car.gameObject.transform.position = Vector.copy(carResetPosition);

    // // let diff = Vector.subtract(track.curve.getPoint(0), track.curve.getPoint(0.001));
    // // let angle = -Math.atan2(diff.z, diff.x) + Math.PI / 2;
    // // car.resetRotation = Quaternion.angleAxis(angle, Vector.up());
    // // car.rb.rotation = Quaternion.angleAxis(angle, Vector.up());
    // // car.gameObject.transform.rotation = Quaternion.copy(car.rb.rotation);

    // Spawn position
    Vector.set(car.resetPosition, spawnPosition);
    car.resetPosition.y -= car.bottomOffset.y;

    const longestSuspension = Math.max(...car.wheels.map(w => w.suspensionTravel));
    car.resetPosition.y += longestSuspension * 0.5;

    Vector.set(car.rb.position, car.resetPosition);
    car.gameObject.transform.position = Vector.copy(car.rb.position);

    // Spawn rotation
    Quaternion.set(car.resetRotation, spawnRotation);
    Quaternion.set(car.rb.rotation, car.resetRotation);
    car.gameObject.transform.rotation = Quaternion.copy(car.rb.rotation);

    // Reset follow camera
    car.resetGame();

    car.mainCamera = new Camera({near: 0.1, far: 15000, fov: 35});
    car.mainCamera.setAspect(renderer.aspect);

    car.ABS = settingsManager.getSettingValue("abs");
    car.TCS = settingsManager.getSettingValue("tcs");
    car.activateAutoCountersteer = settingsManager.getSettingValue("steeringAssist");
    car.autoCountersteer = settingsManager.getSettingValue("autoCountersteer");
    car.autoCountersteerVelocityMultiplier = settingsManager.getSettingValue("autoCountersteerVelocityMultiplier");
    car.followCamera.followMode = settingsManager.getSettingValue("cameraFollowMode");
    car.mainGainNode.gain.value = settingsManager.getSettingValue("masterVolume");
    car.haptics = settingsManager.getSettingValue("haptics");

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

    // let m = scene.add(renderer.CreateShape("sphere"));

    // car.update = function() {
    //   const topSpeed = 70; // km/h

    //   const chunk = window.chunks[Math.max(0, Math.floor((car.rb.position.z + 150) / 300))];

    //   // console.log(chunk.roadCurve);

    //   if (!chunk) {
    //     this.setDriveInput(0);
    //     this.setBrakeInput(1);
    //     return;
    //   }

    //   const { point, t } = chunk.roadCurve.distanceSqrToPoint(Vector.subtract(car.rb.position, chunk.container.transform.position));
    //   Vector.addTo(point, chunk.container.transform.position);

    //   const target = chunk.roadCurve.getPoint(t + car.forwardVelocity * 3.6 / 1000);//Vector.add(point, Vector.multiply(chunk.roadCurve.getTangent(t), 10));
    //   Vector.addTo(target, chunk.container.transform.position);
      
    //   const flatTarget = Vector.copy(target);
    //   flatTarget.y = 0;

    //   const flatPosition = Vector.copy(car.rb.position);
    //   flatPosition.y = 0;

    //   const right = Matrix.getRight(car.gameObject.transform.worldMatrix);
    //   const toTarget = Vector.normalize(Vector.subtract(flatTarget, flatPosition));

    //   const rawSteerInput = Vector.dot(right, toTarget) * 5;

    //   // m.transform.worldPosition = target;

    //   const driveInput = topSpeed - car.forwardVelocity * 3.6;
    //   const brakeInput = car.forwardVelocity * 3.6 > topSpeed + 5 ? 1 : 0;

    //   this.setRawSteerInput(rawSteerInput);
    //   this.setDriveInput(driveInput);
    //   this.setBrakeInput(brakeInput);
    //   this.setClutchInput(1);
    //   this.setEbrakeInput(0);
    // };

    return car;
  }

  function applyDaytimeEnvironment() {
    scene.fogDensity = 0.001;
    scene.environmentIntensity = 1.25;
    scene.sunIntensity = {x: 30, y: 24, z: 18};

    // grass.children[0].meshRenderer.materials[0].setUniform("albedo", [2, 2, 2, 1]);
  }

  function applyNighttimeEnvironment() {
    scene.fogDensity = 0.005;
    scene.environmentIntensity = 0.01;
    scene.sunIntensity = Vector.fill(0.25);

    // grass.children[0].meshRenderer.materials[0].setUniform("albedo", [0.1, 0.1, 0.1, 1]);
  }

  // Maps
  // Touge road map
  async function generateTouge() {
    scene.postprocessing.exposure = -0.5;
    scene.environmentIntensity = 1;
    scene.environmentMinLight = 0.2;
    scene.sunIntensity = Vector.fill(10);

    const mapPath = "./touge.glb";
    const colliderPath = "./tougeCollider.glb";

    const terrainProgram = new renderer.CustomProgram(terrainShader);
    var grassAlbedo = await renderer.loadTextureAsync("../assets/textures/GroundForest003/GroundForest003_COL_VAR1_3K.jpg", { ...renderer.getSRGBFormats() });
    var grassNormal = await renderer.loadTextureAsync("../assets/textures/GroundForest003/GroundForest003_NRM_3K.jpg");
    var stoneAlbedo = await renderer.loadTextureAsync("../assets/textures/rocks_ground_03_2k_jpg/rocks_ground_03_diff_2k.jpg", { ...renderer.getSRGBFormats() });
    var stoneNormal = await renderer.loadTextureAsync("../assets/textures/rocks_ground_03_2k_jpg/rocks_ground_03_nor_2k.jpg");

    const map = await renderer.loadGLTF(mapPath, { maxTextureSize: 1024 });
    const mapBatched = scene.add(renderer.BatchGameObject(map));

    var leaves = renderer.loadTexture("../assets/textures/leaves.png");
    var foliage = new renderer.ProgramContainer(await renderer.createProgramFromFile("../assets/shaders/custom/webgl2/foliage"));
    var foliageMat = new NewMaterial(foliage);
    foliageMat.doubleSided = true;
    foliageMat.setUniform("useTexture", 1);
    foliageMat.setUniform("albedoTexture", leaves);

    mapBatched.castShadows = false;
    mapBatched.meshRenderer.materials[1].programContainer = terrainProgram;
    mapBatched.meshRenderer.materials[1].setUniform("roughness", 1);
    mapBatched.meshRenderer.materials[1].setUniform("albedoTextures[0]", [ grassAlbedo, stoneAlbedo ]);
    mapBatched.meshRenderer.materials[1].setUniform("normalTextures[0]", [ grassNormal, stoneNormal ]);
    // mapBatched.meshRenderer.materials[1].setUniform("albedo", [0.25, 0.25, 0.25, 1]);
    mapBatched.meshRenderer.materials[2].setUniform("normalStrength", 2.5);
    mapBatched.meshRenderer.materials[6].programContainer = renderer.programContainers.unlit;

    if (colliderPath) {
      var collider = await renderer.loadGLTF(colliderPath, { loadMaterials: false, loadNormals: false, loadTangents: false });
      collider.transform.set(map.transform);
      physicsEngine.addMeshCollider(collider);
    }

    // initSnow();
    // await initTrees();

    var spawnPoints = map.getChildren("SpawnPoint", true, false);
    var spawnPoint = spawnPoints[0];//randomFromArray(spawnPoints);
    Vector.add(spawnPoint.transform.worldPosition, new Vector(0, 2, 0), spawnPosition);

    return { terrain: null };
  }

  // Flat playground with jumps
  async function generatePlayground() {
    scene.postprocessing.exposure = -0.5;
    scene.environmentIntensity = 1;
    scene.environmentMinLight = 0.2;
    scene.sunIntensity = Vector.fill(10);

    const mapPath = "playground.glb";
    const colliderPath = "playground.glb";

    const map = await renderer.loadGLTF(mapPath, { maxTextureSize: 1024 });
    const mapBatched = scene.add(renderer.BatchGameObject(map));
    mapBatched.castShadows = false;

    if (colliderPath) {
      var collider = await renderer.loadGLTF(colliderPath, { loadMaterials: false, loadNormals: false, loadTangents: false });
      collider.visible = false;
      collider.transform.set(map.transform);
      scene.add(collider);

      physicsEngine.addMeshCollider(collider);

      console.log(collider);

      // for (const child of collider.children) {
      //   child.addComponent(new MeshCollider());
      // }

      collider.children[0].addComponent(new MeshCollider());
      collider.children[6].addComponent(new MeshCollider());
    }

    const roadSign = await renderer.loadGLTF("./varberg.glb");
    scene.add(roadSign);
    roadSign.transform.position.y = 1;
    roadSign.transform.position.z = -10;

    const treeHandler = new TreeHandler(scene, car.mainCamera, "../assets/models/trees/myFirstTreeLOD/myFirstTreeLOD.glb", [
      40,
      80,
      Infinity
    ]);
    await treeHandler.setup();
  
    const area = 500;
    for (let i = 0; i < 3_000; i++) {
      const x = (prng.random() - 0.5) * 2 * area;
      const z = (prng.random() - 0.5) * 2 * area;
      const y = 0;
  
      const position = { x, y, z };
      const scale = Vector.fill(2 + prng.random());
      const rotationY = prng.random() * Math.PI * 2;
  
      const instance = Matrix.identity();
      Matrix.applyTranslation(position, instance);
      Matrix.applyScale(scale, instance);
      Matrix.applyRotationY(rotationY, instance);
      
      treeHandler.addTree(instance);
    }

    // const simpleFoliageProgram = new renderer.CustomProgram(simpleFoliage.basic);

    // for (let i = 0; i < 4; i++) {
    //   const tree = scene.add(await renderer.loadGLTF("../assets/models/trees/jacaranda-lod0.glb"));
    //   tree.transform.position.x = i * 10;
    //   tree.transform.position.y = 0;
    //   tree.transform.position.z = -20;
    //   // tree.transform.scale = Vector.fill(0.5 + Math.random() * 0.6);

    //   tree.children[2].meshRenderer.materials[1].programContainer = simpleFoliageProgram;
    // }

    // const tree = scene.add(await renderer.loadGLTF("../assets/models/trees/jacaranda-lod1.glb"));
    // tree.transform.position.y = 0;
    // tree.transform.position.z = -40;
    // tree.children[2].meshRenderer.materials[0].programContainer = simpleFoliageProgram;

    // {
    //   const tree = scene.add(await renderer.loadGLTF("../assets/models/trees/myFirstTreeObj/myFirstTreeImposter.glb", { loadVertexColors: false }));
    //   tree.transform.position.y = 0;
    //   tree.transform.position.z = -60;
    //   tree.castShadows = false;
    //   tree.receiveShadows = false;
    //   // tree.children[2].meshRenderer.materials[0].programContainer = simpleFoliageProgram;
    // }

    new Vector(-3, 1, 0, spawnPosition);

    // new Vector(-3, 1, 0, spawnPosition);
    // Quaternion.euler(0, 0, Math.PI * 0.27, spawnRotation);

    // new Vector(-3, 0.3, 0, spawnPosition);
    // Quaternion.euler(0, 0, Math.PI * 0.3, spawnRotation);

    // initSnow();

    return { terrain: null }; 
  }

  // Large savanna-like landscape without roads
  async function generateTerrain() {
    const terrain = new Terrain(scene, {
      terrainSize: 10_000,
      colliderDepthThreshold: 6,
    });
    terrain.chunkRes = 25;

    terrain.getHeight = function(i, j) {
      var power = 2.5;
      var noiseLayers = 3;
      var noiseScale = 0.001;
      const amplitude = 200;

      var elevation = Math.pow(Math.abs(LayeredNoise(i * noiseScale, j * noiseScale, noiseLayers)), power) * amplitude;
      return elevation;
    };

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

    const litTerrain = new renderer.CustomProgram(litTerrainSource);
    const terrainMat = renderer.CreateLitMaterial({}, litTerrain);
    terrainMat.setUniform("roughness", 1);
    terrainMat.setUniform("albedoTextures[0]", [ grassAlbedo, stoneAlbedo, snowAlbedo ]);
    terrainMat.setUniform("normalTextures[0]", [ grassNormal, stoneNormal, snowNormal ]);

    await terrain.loadMaterials(terrainMat);

    let grass = await renderer.loadGLTF("grass1.glb");
    grass.castShadows = false;
    grass.children[0].meshRenderer.materials[0].setUniform("albedo", [6, 8, 6, 1]);
    let grassScatter = terrain.addScatter(grass);
    grass.children[0].meshRenderer.materials[0].programContainer = renderer.programContainers.unlitInstanced;
    grassScatter.spawnProbability = (origin) => {
      let p = 1 - smoothstep(origin.y, 80, 100);
      return p;
    };

    let tree = await renderer.loadGLTF("../assets/models/trees/wideTreeBillboard.glb");
    tree.children[0].meshRenderer.materials[0].setUniform("alphaCutoff", 0.5);
    let treeScatter = terrain.addScatter(tree, 4, 100, 10 * 10);
    tree.children[0].meshRenderer.materials[0].programContainer = renderer.programContainers.unlitInstanced;
    treeScatter.minScale = 1 * 4;
    treeScatter.maxScale = 1.8 * 4;
    treeScatter.cross = true;
    treeScatter.spawnProbability = (origin) => {
      let p = 1 - clamp(mapValue(origin.y, 10, 50, 1, 0), 0, 0.95);
      p *= 1 - smoothstep(origin.y, 60, 100);
      return p;
    };

    let pebbles = await renderer.loadGLTF("../assets/models/rock.glb");
    pebbles.castShadows = false;
    let pebblesScatter = terrain.addScatter(pebbles, 2, 20);
    pebblesScatter.minScale = 0.1;
    pebblesScatter.maxScale = 0.15;
    pebbles.children[0].meshRenderer.materials[0].doubleSided = false;
    pebblesScatter.spawnProbability = (origin) => {
      return smoothstep(origin.y, 10, 20);
    };

    let rocks = await renderer.loadGLTF("../assets/models/rock.glb");
    let rocksScatter = terrain.addScatter(rocks, 2, 220, 10);
    rocksScatter.minScale = 2;
    rocksScatter.maxScale = 6;
    rocks.children[0].meshRenderer.materials[0].doubleSided = false;

    // Spawn in everything all at once
    terrain.chunkUpdatesPerFrame = 1e6;
    terrain.update();
    await sleep(5000);
    terrain.chunkUpdatesPerFrame = 1;

    const tutorialSign = scene.add(await renderer.loadGLTF("tutorialSign.glb"));
    tutorialSign.transform.position = new Vector(-2.7, 0, 3);
    tutorialSign.transform.rotation = Quaternion.euler(0, Math.PI * 0.65, 0);

    return { terrain };
  }

  // Infinite small winding road in autumn forest
  async function generateForest() {
    const { checkChunks } = await createChunks();

    const tutorialSign = scene.add(await renderer.loadGLTF("tutorialSign.glb"));
    tutorialSign.transform.position = new Vector(-2.7, 0, 3);
    tutorialSign.transform.rotation = Quaternion.euler(0, Math.PI * 0.65, 0);

    new Vector(0, 0, 0, spawnPosition);

    return { checkChunks, terrain: null };
  }

  async function generateLowpolyForest() {
    new Vector(0, 0, -25, spawnPosition);

    scene.postprocessing.exposure = -0.5;
    scene.environmentIntensity = 1;
    scene.environmentMinLight = 0.2;
    scene.sunIntensity = Vector.fill(20);

    // const plane = scene.add(renderer.CreateShape("plane"));
    // plane.meshRenderer.materials[0].setUniform("albedo", [0.05, 0.05, 0.05, 1]);
    // plane.transform.rotation = Quaternion.euler(-Math.PI / 2, 0, 0);
    // plane.transform.scale = Vector.fill(100);
    // plane.addComponent(new MeshCollider());

    const solidColorInstanceProgram = new renderer.ProgramContainer(await renderer.createProgramFromFile("../assets/shaders/custom/webgl2/solidColor"));
    const aabbVis = scene.add(new GameObject("AABB", {
      meshRenderer: new renderer.MeshInstanceRenderer([new NewMaterial(solidColorInstanceProgram)], [new renderer.MeshData(renderer.getLineCubeData())], {drawMode: renderer.gl.LINES}),
      castShadows: false
    }));
    aabbVis.disableFrustumCulling = true;

    const rockBase = await renderer.loadGLTF("lowpolyRock.glb");
    const cactusBase = await renderer.loadGLTF("lowpolyCactus.glb");
    const signBase = await renderer.loadGLTF("70sign.glb");

    const sandMaterial = renderer.CreateLitMaterial({
      albedo: [0.1225, 0.0692, 0.035, 1],//[0.95 * 0.15, 0.84 * 0.13, 0.6 * 0.1, 1],
      roughness: 0.5,
      // metallicRoughnessTexture: flakes,
      // normalTexture: flakes,
      // normalStrength: 2
    });
    const roadMaterial = renderer.CreateLitMaterial({
      albedoTexture: await renderer.loadTextureAsync("lowpolyRoad.png", { ...renderer.getSRGBFormats(), generateMipmap: false }),
      albedo: [ 0.3, 0.2, 0.2, 1 ],
      // albedo: [ 0.01, 0.01, 0.01, 1 ],
      // metallic: 0.5
    });

    const parkinglotBase = scene.add(renderer.CreateShape("cube", roadMaterial));
    parkinglotBase.transform.scale = new Vector(20, 1, 120);
    parkinglotBase.transform.position = new Vector(0, -0.95, -120);
    parkinglotBase.addComponent(new MeshCollider());

    const chunkSize = 300;
    const roadWidth = 10;
    const uvScale = 1;
    const rotateUV = false;

    const curveXMax = 0.3;
    const hillyness = 7 * 1.5;

    const points = [];
    let startY = 0;
    let yVel = 0;

    points.push(new Vector(0, startY, -chunkSize * 0.5));
    points.push(new Vector(0, startY, -chunkSize * 0.2));

    for (var i = 1; i < 9; i++) {
      points.push(new Vector(0, startY, -chunkSize * 0.5 + i * chunkSize / 3));
      // points[points.length - 1].y = terrain.getHeight(points[points.length - 1].x, points[points.length - 1].z);
    }

    const worker = new Worker("./generateLowpolyTerrainWorker.js", { type: "module" });
    worker.onmessage = e => {
      const id = e.data.id;
      const meshDataData = e.data.meshData;
      meshDataData.indices.target = renderer.gl.ELEMENT_ARRAY_BUFFER;

      const terrain = new GameObject("Lowpoly Terrain");

      const meshData = new renderer.MeshData(meshDataData);
      meshData.recalculateTangents();

      terrain.meshRenderer = new renderer.MeshRenderer(sandMaterial, meshData);
      terrain.addComponent(new MeshCollider());

      const container = chunks[id].container;
      container.add(terrain);
      terrain.transform.worldPosition = Vector.zero();

      {
        const rocks = container.add(rockBase.copy());
        const ir = rocks.children[0].meshRenderer = rocks.children[0].meshRenderer.getInstanceMeshRenderer();
        
        for (let i = 0; i < 100; i++) {
          const origin = new Vector(
            (Math.random() - 0.5) * chunkSize,
            100,
            (Math.random() - 0.5) * chunkSize
          );
          Vector.addTo(origin, container.transform.position);
          const hit = physicsEngine.Raycast(origin, Vector.down());
          if (!hit || hit.gameObject != terrain) continue;

          const matrix = Matrix.identity();
          Matrix.applyTranslation(hit.point, matrix);
          Matrix.applyRotationY(Math.random() * 2 * Math.PI, matrix);
          Matrix.applyScale(Vector.fill(Math.random() * 0.5 + 1), matrix);

          ir.addInstance(matrix);
        }
      }

      {
        const cactus = container.add(cactusBase.copy());
        const ir = cactus.children[0].meshRenderer = cactus.children[0].meshRenderer.getInstanceMeshRenderer();
        
        for (let i = 0; i < 100; i++) {
          const origin = new Vector(
            (Math.random() - 0.5) * chunkSize,
            100,
            (Math.random() - 0.5) * chunkSize
          );
          Vector.addTo(origin, container.transform.position);
          const hit = physicsEngine.Raycast(origin, Vector.down());
          if (!hit || hit.gameObject != terrain) continue;

          const matrix = Matrix.identity();
          Matrix.applyTranslation(hit.point, matrix);
          Matrix.applyRotationY(Math.random() * 2 * Math.PI, matrix);
          Matrix.applyScale(Vector.fill(Math.random() * 0.5 + 0.5), matrix);

          ir.addInstance(matrix);
        }
      }
    };

    const chunks = [];
    window.chunks = chunks;
    chunks.push(await createChunk(points.slice(0, 7)));
    chunks.push(await createChunk(points.slice(3, 10), new Vector(0, 0, chunkSize)));

    const checkChunks = async function() {
      if (typeof car === "undefined" || !car || !car.rb) return;

      for (let i = 0; i < chunks.length; i++) {
        let chunk = chunks[i];
        chunk.container.active = (Math.abs(i * chunkSize - car.rb.position.z) < chunkSize * 3);
      }

      if (car.rb.position.z > (chunks.length - 3) * chunkSize) {
        for (let i = 0; i < 3; i++) {
          yVel += (prng.random() - (0.5 + yVel * 0.02 + startY * 0.1)) * hillyness;
          startY += yVel;

          points.push(new Vector(
            (prng.random() - 0.5) * chunkSize * curveXMax,
            startY,
            -chunkSize / 2 + (points.length - 1) * chunkSize / 3
          ));
        }

        chunks.push(await createChunk(
          points.slice(chunks.length * 3, chunks.length * 3 + 7),
          new Vector(0, 0, chunks.length * chunkSize),
          points.slice(chunks.length * 3 - 3, chunks.length * 3 + 7)
        ));
      }
    };
    
    setInterval(checkChunks, 400);

    return { checkChunks, terrain: null };

    async function createChunk(points, center = Vector.zero(), pointsToCheckDistance) {
      pointsToCheckDistance = pointsToCheckDistance || points;
      const distanceCurve = new CatmullRomCurve(pointsToCheckDistance.map(p => Vector.subtract(p, center)));

      const roadCurve = new CatmullRomCurve(points.map(p => Vector.subtract(p, center)));
      const container = await generateRoad(center, roadCurve, distanceCurve, roadWidth, 100);

      return {
        container,
        roadCurve,
      };
    }

    async function generateRoad(chunkCenter, crCurve, distanceCurve, width = 12, segments = 100) {
      var container = new GameObject("Chunk");
      container.transform.position = Vector.copy(chunkCenter);

      const signs = container.add(signBase.copy());
      const ir = signs.children[0].meshRenderer = signs.children[0].meshRenderer.getInstanceMeshRenderer();

      // Road
      var road = new GameObject("Road");

      var distanceAlongPath = 0;

      var indices = [];
      var vertices = [];
      var uvs = [];

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

        // // Shrinkwrap to terrain
        // // center.y = terrain.getHeight(chunkCenter.x + center.x, chunkCenter.z + center.z);
        // e1.y = terrain.getHeight(chunkCenter.x + e1.x, chunkCenter.z + e1.z) + 0.01;
        // e2.y = terrain.getHeight(chunkCenter.x + e2.x, chunkCenter.z + e2.z) + 0.01;
        // m1.y = terrain.getHeight(chunkCenter.x + m1.x, chunkCenter.z + m1.z) - 0.5;
        // m2.y = terrain.getHeight(chunkCenter.x + m2.x, chunkCenter.z + m2.z) - 0.5;

        vertices.push(m1.x, m1.y, m1.z);
        vertices.push(e1.x, e1.y, e1.z);
        vertices.push(e1.x, e1.y, e1.z);
        vertices.push(e2.x, e2.y, e2.z);
        vertices.push(e2.x, e2.y, e2.z);
        vertices.push(m2.x, m2.y, m2.z);

        var v = distanceAlongPath / width;

        if (rotateUV) {
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

        distanceAlongPath += Vector.length(diff);

        if (Math.random() < 0.02) {
          {
            const matrix = Matrix.identity();
            Matrix.applyTranslation(m1, matrix);
            Matrix.applyTranslation(chunkCenter, matrix);
            ir.addInstance(matrix);
          }

          {
            const matrix = Matrix.identity();
            Matrix.applyTranslation(m2, matrix);
            Matrix.applyTranslation(chunkCenter, matrix);
            ir.addInstance(matrix);
          }
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

      // const terrain = container.add(generateTerrain(chunkCenter, crCurve));
      // terrain.transform.worldPosition = Vector.zero();

      worker.postMessage({
        id: chunks.length,
        offset: chunkCenter,
        curvePoints: distanceCurve.points//crCurve.points
      });

      return container;
    }

    function generateTerrain(offset, curve) {
      const gameObject = new GameObject("Extruded curve");
      const material = renderer.CreateLitMaterial({
        albedo: [0.93, 0.84, 0.6, 1]
      });

      const indices = [];
      const vertices = [];
      const uvs = [];
      const normals = [];

      const getHeight = (x, z) => {
        // const hit = physicsEngine.Raycast(new Vector(x, 100, z), Vector.down());
        // if (hit) {
        //   return hit.point.y - 0.1;
        // }

        const height = perlin.noise(x * 0.01, z * 0.01) * 30;

        if (Math.abs(x) > chunkSize * curveXMax / 2 + roadWidth / 2 + 30) {
          return height;
        }

        const { distance, point } = curve.distanceSqrToPoint(new Vector(x - offset.x, 0, z - offset.z));

        return lerp(point.y - 1, height, clamp((distance - roadWidth * roadWidth) / 900, 0, 1));
      };

      const size = chunkSize;
      const res = 50 * 2;
      const s = size / res;
      
      const v1 = new Vector();
      const v2 = new Vector();
      const v3 = new Vector();
      const _normal = new Vector();

      for (let i = 0; i < res; i++) {
        for (let j = 0; j < res; j++) {
          {
            const vertexOffset = vertices.length / 3;

            new Vector((i - (res - 1) / 2) * s + offset.x, 0, (j - (res - 1) / 2) * s + offset.z, v1);
            v1.y = getHeight(v1.x, v1.z) + offset.y;

            new Vector((i + 1 - (res - 1) / 2) * s + offset.x, 0, (j - (res - 1) / 2) * s + offset.z, v2);
            v2.y = getHeight(v2.x, v2.z) + offset.y;

            new Vector((i + 1 - (res - 1) / 2) * s + offset.x, 0, (j + 1 - (res - 1) / 2) * s + offset.z, v3);
            v3.y = getHeight(v3.x, v3.z) + offset.y;

            getTriangleNormal([ v1, v3, v2 ], _normal);
            normals.push(_normal.x, _normal.y, _normal.z);
            normals.push(_normal.x, _normal.y, _normal.z);
            normals.push(_normal.x, _normal.y, _normal.z);

            vertices.push(v1.x, v1.y, v1.z);
            vertices.push(v2.x, v2.y, v2.z);
            vertices.push(v3.x, v3.y, v3.z);
            
            indices.push(vertexOffset + 0);
            indices.push(vertexOffset + 2);
            indices.push(vertexOffset + 1);
          }

          {
            const vertexOffset = vertices.length / 3;

            new Vector((i - (res - 1) / 2) * s + offset.x, 0, (j - (res - 1) / 2) * s + offset.z, v1);
            v1.y = getHeight(v1.x, v1.z) + offset.y;

            new Vector((i + 1 - (res - 1) / 2) * s + offset.x, 0, (j + 1 - (res - 1) / 2) * s + offset.z, v2);
            v2.y = getHeight(v2.x, v2.z) + offset.y;

            new Vector((i - (res - 1) / 2) * s + offset.x, 0, (j + 1 - (res - 1) / 2) * s + offset.z, v3);
            v3.y = getHeight(v3.x, v3.z) + offset.y;

            getTriangleNormal([ v1, v3, v2 ], _normal);
            normals.push(_normal.x, _normal.y, _normal.z);
            normals.push(_normal.x, _normal.y, _normal.z);
            normals.push(_normal.x, _normal.y, _normal.z);

            vertices.push(v1.x, v1.y, v1.z);
            vertices.push(v2.x, v2.y, v2.z);
            vertices.push(v3.x, v3.y, v3.z);
            
            indices.push(vertexOffset + 0);
            indices.push(vertexOffset + 2);
            indices.push(vertexOffset + 1);
          }
        }
      }

      console.log(vertices.length / 3, indices.length / 3);

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
        },
        normal: {
          bufferData: new Float32Array(normals),
          size: 3
        },
      });
      // meshData.recalculateNormals();
      meshData.recalculateTangents();

      gameObject.meshRenderer = new renderer.MeshRenderer(material, meshData);
      gameObject.addComponent(new MeshCollider());

      return gameObject;
    }
  }

  // Small city surrounded by dense forest
  async function generateCity() {
    const terrain = new Terrain(scene, {
      terrainSize: 1_000,
      colliderDepthThreshold: 6,
      // enableCollision: false,
    });
    terrain.chunkRes = 5;
  
    terrain.getHeight = () => 0;
  
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
  
    const litTerrain = new renderer.CustomProgram(litTerrainSource);
    let terrainMat = renderer.CreateLitMaterial({}, litTerrain);
    terrainMat.setUniform("roughness", 1);
    terrainMat.setUniform("albedoTextures[0]", [ grassAlbedo, stoneAlbedo, snowAlbedo ]);
    terrainMat.setUniform("normalTextures[0]", [ grassNormal, stoneNormal, snowNormal ]);
  
    await terrain.loadMaterials(terrainMat);
  
    const { roadMaterial, asphaltMaterial } = await createRoadMaterials();
  
    const house = scene.add(await renderer.loadGLTF("./house.glb"));
    house.children[0].meshRenderer = house.children[0].meshRenderer.getInstanceMeshRenderer();
  
    const cityData = [
      1, 1, 1, 1, 1, 1, 1, 1,
      1, 2, 1, 0, 2, 0, 2, 1,
      1, 2, 1, 0, 0, 0, 0, 1,
      1, 1, 1, 1, 1, 1, 0, 1,
      1, 0, 1, 0, 2, 1, 2, 1,
      1, 0, 1, 0, 0, 1, 1, 1,
      1, 0, 1, 0, 2, 0, 0, 1,
      1, 1, 1, 1, 1, 1, 1, 1,
    ];
    const city = new City(scene, house.children[0].meshRenderer);
    city.generate(cityData, 8, 8, { material: roadMaterial, asphaltMaterial });
  
    const getTreeDensity = (position) => {
      let i = Math.floor(position.x / 25 + 0.5);
      let j = Math.floor(position.z / 25 + 0.5);
  
      if (i < 0 || j < 0 || i >= 8 || j >= 8) {
        return 1;
      }
  
      if (cityData[i * 8 + j] !== 0) {
        return 0;
      }
  
      return 0.1;
    };

    const getGrassDensity = (position) => {
      let i = Math.floor(position.x / 25 + 0.5);
      let j = Math.floor(position.z / 25 + 0.5);
  
      if (i < 0 || j < 0 || i >= 8 || j >= 8) {
        return 1;
      }
  
      if (cityData[i * 8 + j] !== 0) {
        return 0;
      }
  
      return 1;
    };
  
    let grass = await renderer.loadGLTF("grass1.glb");
    grass.castShadows = false;
    grass.children[0].meshRenderer.materials[0].setUniform("albedo", [6, 8, 6, 1]);
    let grassScatter = terrain.addScatter(grass, 2, 60, 150);
    grassScatter.spawnProbability = getGrassDensity;
    grass.children[0].meshRenderer.materials[0].programContainer = renderer.programContainers.unlitInstanced;
    
    let tree = await renderer.loadGLTF("../assets/models/trees/wideTreeBillboard.glb");
    tree.children[0].meshRenderer.materials[0].setUniform("alphaCutoff", 0.5);
    let treeScatter = terrain.addScatter(tree, 2, 100, 500);
    tree.children[0].meshRenderer.materials[0].programContainer = renderer.programContainers.unlitInstanced;
    treeScatter.minScale = 1 * 3;
    treeScatter.maxScale = 1.8 * 3;
    treeScatter.cross = true;
    treeScatter.spawnProbability = getTreeDensity;

    // Spawn in everything all at once
    terrain.chunkUpdatesPerFrame = 1e6;
    terrain.update();
    await sleep(5000);
    terrain.chunkUpdatesPerFrame = 1;

    const tutorialSign = scene.add(await renderer.loadGLTF("tutorialSign.glb"));
    tutorialSign.transform.position = new Vector(5, 0, 55);
    tutorialSign.transform.rotation = Quaternion.euler(0, -Math.PI * 0.65, 0);
  
    // Set spawn point
    new Vector(0, 0.8, 50, spawnPosition);
    Quaternion.euler(0, Math.PI / 2, 0, spawnRotation);

    return {
      terrain
    };
  }
  //
  
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

  async function createRoadMaterials() {
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

    [
      albedoImage,
      normalImage,
      metallicRoughnessImage
    ] = await Promise.all([
      loadImage("../assets/textures/roadNoLines/albedo.png"),
      loadImage("../assets/textures/roadNoLines/normal.png"),
      loadImage("../assets/textures/roadNoLines/metallicRoughness.png")
    ]);

    let asphaltMaterial = renderer.CreateLitMaterial({
      albedo: [0.3, 0.3, 0.3, 1],
      albedoTexture: await renderer.loadTexture(albedoImage, { ...renderer.getSRGBFormats(), anisotropicFiltering: true }),
      normalTexture: await renderer.loadTexture(normalImage, { anisotropicFiltering: true }),
      metallicRoughnessTexture: await renderer.loadTexture(metallicRoughnessImage, { anisotropicFiltering: true }),
      metallic: 0.5,
      // roughness: 2,
      // albedoTexture: renderer.loadTexture("../assets/textures/asphalt_01_1k/asphalt_01_diff_1k.jpg", { ...renderer.getSRGBFormats() }),
      // normalTexture: renderer.loadTexture("../assets/textures/asphalt_01_1k/asphalt_01_nor_gl_1k.png"),
    });

    return {
      roadMaterial,
      asphaltMaterial
    };
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

      road.meshRenderer = new renderer.MeshRenderer(material, roadMeshData);
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
    const terrain = settings.terrain;

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
        if (terrain) {
          worldOffset.y = terrain.getHeight(worldOffset.x, worldOffset.z) + 0.01;
        }

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

  async function createChunks() {
    var chunkSize = 300;

    // const simpleFoliageProgram = new renderer.CustomProgram(simpleFoliage);

    const [
      leavesAlbedo,
      grassAlbedo,
      grassNormal,
      asphaltAlbedo,
      asphaltNormal,
      asphaltMetallicRoughness
    ] = await Promise.all([
      loadImage("leaves5.png"),
      loadImage("../assets/textures/brown_mud_leaves_01_512_jpg/brown_mud_leaves_01_diff_2k.jpg"),
      loadImage("../assets/textures/brown_mud_leaves_01_512_jpg/brown_mud_leaves_01_Nor_2k.jpg"),
      loadImage("../assets/textures/road512/albedo.png"),
      loadImage("../assets/textures/road512/normal.png"),
      loadImage("../assets/textures/road512/metallicRoughness.png"),
    ]);

    // var dirtRoadMaterial = renderer.CreateLitMaterial({
    //   // albedo: [0.8, 0.8, 0.8, 1],
    //   albedoTexture: renderer.loadTexture("../assets/textures/aerial_mud_1_4k_jpg/aerial_mud_1_diff_4k.jpg", { ...renderer.getSRGBFormats() }),
    //   normalTexture: renderer.loadTexture("../assets/textures/aerial_mud_1_4k_jpg/normalWithWater.png"),
    //   metallicRoughnessTexture: renderer.loadMetalRoughness("../assets/textures/aerial_mud_1_4k_jpg/aerial_mud_1_ref_4k.jpg", "../assets/textures/aerial_mud_1_4k_jpg/aerial_mud_1_ref_4k.jpg")
    // });
    // dirtRoadMaterial.setUniform("roughness", 0.9);
    // dirtRoadMaterial.setUniform("normalStrength", 3);
    const dirtRoadMaterial = null;

    const asphaltRoadMaterial = renderer.CreateLitMaterial({
      albedo: [0.3, 0.3, 0.3, 1],
      albedoTexture: renderer.loadTexture(asphaltAlbedo, { ...renderer.getSRGBFormats(), anisotropicFiltering: true }),
      normalTexture: renderer.loadTexture(asphaltNormal, { anisotropicFiltering: true }),
      metallicRoughnessTexture: renderer.loadTexture(asphaltMetallicRoughness, { anisotropicFiltering: true }),
      metallic: 0.5,
    });

    // const grassMaterial = renderer.CreateLitMaterial({
    //   albedo: [0.8, 0.8, 1, 1],
    //   albedoTexture: renderer.loadTexture("../assets/textures/Snow/albedo.jpg", { ...renderer.getSRGBFormats() }),
    //   normalTexture: renderer.loadTexture("../assets/textures/Snow/normal.jpg"),
    //   normalStrength: 2,
    // });
    const grassMaterial = renderer.CreateLitMaterial({
      albedoTexture: renderer.loadTexture(grassAlbedo, { ...renderer.getSRGBFormats() }),
      normalTexture: renderer.loadTexture(grassNormal),
    });
    grassMaterial.setUniform("doNoTiling", true);

    const leavesMaterial = renderer.CreateLitMaterial({
      albedoTexture: renderer.loadTexture(leavesAlbedo, { ...renderer.getSRGBFormats() }),
    });

    const leavesBase = renderer.CreateShape("plane", leavesMaterial);
    // var billboardTreesBase = await renderer.loadGLTF("../assets/models/trees/stylizedAutumnBillboard.glb");
    const billboardTreesBase = await renderer.loadGLTF("../assets/models/trees/wideTreeBillboard.glb");
    // const treesBase = await renderer.loadGLTF("../assets/models/trees/stylizedAutumn.glb");

    const grassBase = await renderer.loadGLTF("grass1.glb");
    grassBase.castShadows = false;
    grassBase.children[0].meshRenderer.materials[0].setUniform("albedo", [6 * 0.5, 8 * 0.4, 6 * 0.5, 1]);

    var roadSettings = {
      rally: { width: 10 / 2.5, material: dirtRoadMaterial, flipUV: true, uvScale: 0.75 },
      asphalt: { width: 10, material: asphaltRoadMaterial, flipUV: false, uvScale: 1 }
    };

    var roadKey = "asphalt";
    var roadWidth = roadSettings[roadKey].width;
    var roadMaterial = roadSettings[roadKey].material;
    var flipUV = roadSettings[roadKey].flipUV;
    var uvScale = roadSettings[roadKey].uvScale;
    var treeDensity = 5;
    // var treeDensity = 0.1;
    const curveXMax = 0.3;
    const hillyness = 7;

    var points = [];
    var startY = 0;
    var yVel = 0;

    points.push(new Vector(0, startY, -chunkSize * 0.7));
    points.push(new Vector(0, startY, -chunkSize * 0.5));

    for (var i = 1; i < 9; i++) {
      points.push(new Vector(0, startY, -chunkSize / 2 + i * chunkSize / 3));
      // points[points.length - 1].y = terrain.getHeight(points[points.length - 1].x, points[points.length - 1].z);
    }

    var chunks = [
      await createChunk(points.slice(0, 7)),
      await createChunk(points.slice(3, 10), new Vector(0, 0, 100)),
    ];

    const checkChunks = async function() {
      if (typeof car === "undefined" || !car || !car.rb) return;

      for (let i = 0; i < chunks.length; i++) {
        var chunk = chunks[i];
        chunk.active = (Math.abs(i * chunkSize - car.rb.position.z) < chunkSize * 2);
      }

      if (car.rb.position.z > (chunks.length - 2) * chunkSize) {
        for (let i = 0; i < 3; i++) {
          yVel += (Math.random() - (0.5 + yVel * 0.02)) * hillyness;
          // yVel = clamp(yVel, -8, 8);
          // if (Math.abs(yVel) >= 8) {
          //   yVel *= -1;
          // }
          startY += yVel;
          points.push(new Vector((Math.random() - 0.5) * chunkSize * curveXMax, startY/*Math.random() * 3*/, -chunkSize / 2 + (points.length - 1) * chunkSize / 3));
          // points[points.length - 1].y = terrain.getHeight(points[points.length - 1].x, points[points.length - 1].z) + 3;
        }

        chunks.push(await createChunk(points.slice(chunks.length * 3, chunks.length * 3 + 7), new Vector(0, 0, chunks.length * chunkSize)));
      }
    };
    
    setInterval(checkChunks, 400);

    return {
      checkChunks
    };

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

      // var instanceTrees = container.add(treesBase.copy());
      // instanceTrees.children[0].meshRenderer = instanceTrees.children[0].meshRenderer.getInstanceMeshRenderer();
      // instanceTrees.children[0].meshRenderer.materials[0].setUniform("albedo", [0.3, 0.3, 0.3, 1]);
      // instanceTrees.children[0].meshRenderer.materials[0].setUniform("alphaCutoff", 0.5);
      // // instanceTrees.children[0].meshRenderer.materials[0].programContainer = renderer.programContainers.unlitInstanced;
      // instanceTrees.children[0].meshRenderer.materials[0].doubleSided = false;
      // instanceTrees.children[0].meshRenderer.materials[0].doubleSidedShadows = false;

      var instanceBillboardTrees = container.add(billboardTreesBase.copy());
      instanceBillboardTrees.children[0].meshRenderer = instanceBillboardTrees.children[0].meshRenderer.getInstanceMeshRenderer(renderer.programContainers.unlitInstanced);
      // instanceBillboardTrees.children[0].meshRenderer.materials[0].setUniform("albedo", [0.1, 0.1, 0.1, 1]);
      // instanceBillboardTrees.children[0].meshRenderer.materials[0].setUniform("alphaCutoff", 0.5);
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

      // const instanceGrass = container.add(grassBase.copy());
      // instanceGrass.children[0].meshRenderer = instanceGrass.children[0].meshRenderer.getInstanceMeshRenderer(renderer.programContainers.unlitInstanced);

      const grass = [];
      var trees = [];

      var treesContainer = container.addChild(new GameObject("Tree container"));
      treesContainer.visible = false;

      function addSimpleTree(origin) {
        // return;
        trees.push(origin);

        // let p = Vector.add(chunkCenter, origin);
        // let m = Matrix.transform([
        //   ["translate", Vector.add(p, new Vector(0, -Math.random() * 2, 0))],
        //   ["scale", Vector.fill(1 + Math.random() * 1)],
        //   ["ry", Math.random() * 2 * Math.PI],
        //   ["rx", (Math.random() - 0.5) * 0.07],
        //   ["rz", (Math.random() - 0.5) * 0.07],
        // ]);
        // let m2 = Matrix.copy(m);
        // Matrix.transform([
        //   ["ry", Math.PI / 2]
        // ], m2);
        // instanceBillboardTrees.children[0].meshRenderer.addInstance(m);
        // instanceBillboardTrees.children[0].meshRenderer.addInstance(m2);
      }

      var treesToAdd = [];

      function addTree(origin) {
        treesToAdd.push(origin);
        return;

        // var lodTree = treesContainer.add(new GameObject("LOD Tree"));
        // lodTree.visible = false;

        // // lodTree.transform.matrix = Matrix.transform([
        // //   ["translate", origin],
        // //   // ["translate", Vector.add(chunkCenter, origin)], // Only add chunkCenter when instanced mesh
        // //   ["scale", Vector.fill(1 + Math.random() * 1)],
        // //   ["ry", Math.random() * 2 * Math.PI],
        // //   ["rx", (Math.random() - 0.5) * 0.07],
        // //   ["rz", (Math.random() - 0.5) * 0.07],
        // // ]);
        // // lodTree.addComponent(new LOD([
        // //   { meshRenderer: treesBase.children[0].meshRenderer, upToDistance: 50 },
        // //   { meshRenderer: billboardTreesBase.children[0].meshRenderer, upToDistance: 500 },
        // // ]));

        // function TreeLOD(matrix) {
        //   this.instanceMatrix = Matrix.copy(matrix);

        //   var levels = [
        //     { meshRenderer: instanceTrees.children[0].meshRenderer, upToDistance: 50 },
        //     { meshRenderer: instanceBillboardTrees.children[0].meshRenderer, upToDistance: 500 },
        //   ];
        //   var lastLevel = null;

        //   this.updateInterval = 20;
        //   var i = Math.floor(Math.random() * this.updateInterval);

        //   this.update = function() {
        //     if (car && i % this.updateInterval == 0) {
        //       var cameraPos = car.mainCamera.transform.position;
        //       var distanceToCenter = Vector.distanceSqr(Matrix.getPosition(this.instanceMatrix), cameraPos);
            
        //       var currentLevel = levels.find(l => distanceToCenter < l.upToDistance * l.upToDistance);

        //       if (currentLevel != lastLevel) {
        //         for (var level of levels) {
        //           if (currentLevel == level) {
        //             level.meshRenderer.addInstanceDontCopy(this.instanceMatrix);
        //           }
        //           else {
        //             level.meshRenderer.removeInstance(this.instanceMatrix);
        //           }
        //         }
        //       }

        //       lastLevel = currentLevel;
        //     }

        //     i++;
        //   };
        // }

        // lodTree.addComponent(new TreeLOD(Matrix.transform([
        //   // ["translate", origin],
        //   ["translate", Vector.add(chunkCenter, origin)], // Only add chunkCenter when instanced mesh
        //   ["scale", Vector.fill(1 + Math.random() * 1)],
        //   ["ry", Math.random() * 2 * Math.PI],
        //   ["rx", (Math.random() - 0.5) * 0.07],
        //   ["rz", (Math.random() - 0.5) * 0.07],
        // ])));

        // // trees.push(lodTree);
      }

      // Leaves
      var leaves = container.add(leavesBase.copy());
      leaves.castShadows = false;
      leaves.meshRenderer = leaves.meshRenderer.getInstanceMeshRenderer(renderer.programContainers.unlitInstanced);
      var mrLeaves = leaves.meshRenderer;
      mrLeaves.castShadows = false;

      // mr.materials[0].programContainer = renderer.programContainers.unlitInstanced;
      // mrLeaves.materials[0].setUniform("albedo", [0.3, 0.3, 0.3, 1]);
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

        // // Shrinkwrap to terrain
        // // center.y = terrain.getHeight(chunkCenter.x + center.x, chunkCenter.z + center.z);
        // e1.y = terrain.getHeight(chunkCenter.x + e1.x, chunkCenter.z + e1.z) + 0.01;
        // e2.y = terrain.getHeight(chunkCenter.x + e2.x, chunkCenter.z + e2.z) + 0.01;
        // m1.y = terrain.getHeight(chunkCenter.x + m1.x, chunkCenter.z + m1.z) - 0.5;
        // m2.y = terrain.getHeight(chunkCenter.x + m2.x, chunkCenter.z + m2.z) - 0.5;

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

        let plant = () => {
          let xOffset = Math.random() * 100;
          addSimpleTree(
            Vector.add(
              Vector.add(center, Vector.multiply(normal, width * 0.6 + xOffset)),
              new Vector(0, Math.min(5, xOffset * 0.15) - Math.max(0, (xOffset - 50) * 0.1)/*-width * 0.06 + (Math.random() - 0.5) * width * 0*/, 0)
            )
          );

          xOffset = Math.random() * 100;
          addSimpleTree(
            Vector.add(
              Vector.subtract(center, Vector.multiply(normal, width * 0.6 + xOffset)),
              new Vector(0, Math.min(5, xOffset * 0.15) - Math.max(0, (xOffset - 50) * 0.1)/*-width * 0.06 + (Math.random() - 0.5) * width * 0*/, 0)
            )
          );
        };
        if (treeDensity >= 1) {
          for (let _i = 0; _i < treeDensity; _i++) {
            plant();
          }
        }
        else {
          if (Math.random() < treeDensity) {
            plant();
          }
        }

        // // Grass
        // for (let _i = 0; _i < 50; _i++) {
        //   let xOffset = Math.random() * 40;
        //   grass.push(
        //     Vector.add(
        //       Vector.add(center, Vector.multiply(normal, width * 0.5 + xOffset)),
        //       Vector.multiply(tangent, (Math.random() - 0.5) * 10)
        //     )
        //   );

        //   xOffset = Math.random() * 40;
        //   grass.push(
        //     Vector.add(
        //       Vector.subtract(center, Vector.multiply(normal, width * 0.5 + xOffset)),
        //       Vector.multiply(tangent, (Math.random() - 0.5) * 10)
        //     )
        //   );
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

        // let treePos = Vector.add(center, Vector.multiply(normal, width * 0.6 + Math.random() * 200));
        // // treePos.y = terrain.getHeight(chunkCenter.x + treePos.x, chunkCenter.z + treePos.z);
        // addSimpleTree(treePos);

        // treePos = Vector.subtract(center, Vector.multiply(normal, width * 0.6 + Math.random() * 200));
        // // treePos.y = terrain.getHeight(chunkCenter.x + treePos.x, chunkCenter.z + treePos.z);
        // addSimpleTree(treePos);

        // addLeaves(Vector.add(Vector.add(center, Vector.multiply(normal, width / 2 - Math.random() * 2)), new Vector(0, 0.05 + Math.random() * 0.02, 0)));
        // addLeaves(Vector.add(Vector.subtract(center, Vector.multiply(normal, width / 2 - Math.random() * 2)), new Vector(0, 0.05 + Math.random() * 0.02, 0)));
      
        for (let i = 0; i < 10; i++) {
          addLeaves(Vector.add(Vector.add(center, Vector.multiply(normal, width / 2 - Math.random() * 2)), new Vector(0, 0.05 + Math.random() * 0.02, (Math.random() - 0.5) * 3)));
          addLeaves(Vector.add(Vector.subtract(center, Vector.multiply(normal, width / 2 - Math.random() * 2)), new Vector(0, 0.05 + Math.random() * 0.02, (Math.random() - 0.5) * 3)));
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
      terrain.transform.position.y = 0;//-0.04;

      terrain.customData.bumpiness = 0.08;
      terrain.customData.friction = 0.9;
      terrain.customData.offroad = 1;

      container.addChild(terrain);

      scene.add(container);

      if (isForest) {
        // for (let origin of grass) {
        //   const p = Vector.add(chunkCenter, origin);
        //   const hit = physicsEngine.Raycast(
        //     new Vector(p.x, p.y + 50, p.z),
        //     Vector.down()
        //   );
        //   // const hit = { firstHit: { point: p } };

        //   if (hit) {
        //     Vector.set(p, hit.point);
        //   }

        //   const minScale = 1;
        //   const maxScale = 1.5;

        //   let m = Matrix.transform([
        //     ["translate", Vector.add(p, new Vector(0, -0.2, 0))],
        //     ["scale", Vector.fill(minScale + Math.random() * (maxScale - minScale))],
        //     ["ry", Math.random() * 2 * Math.PI],
        //     ["rx", (Math.random() - 0.5) * 0.07],
        //     ["rz", (Math.random() - 0.5) * 0.07],
        //   ]);
        //   instanceGrass.children[0].meshRenderer.addInstance(m);
        // }

        for (let origin of trees) {
          const p = Vector.add(chunkCenter, origin);
          const hit = physicsEngine.Raycast(
            new Vector(p.x, p.y + 50, p.z),
            Vector.down()
          );
          // const hit = { firstHit: { point: p } };

          if (hit) {
            Vector.set(p, hit.point);
          }

          const minScale = 1 * 3;
          const maxScale = 2 * 3;

          let m = Matrix.transform([
            ["translate", Vector.add(p, new Vector(0, -Math.random() * 2 * -0.1, 0))],
            ["scale", Vector.fill(minScale + Math.random() * (maxScale - minScale))],
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

        // for (let origin of treesToAdd) {
        //   let p = Vector.add(chunkCenter, origin);
        //   let hit = physicsEngine.Raycast(
        //     new Vector(p.x, p.y + 50, p.z),
        //     Vector.down()
        //   );
        //   if (hit && hit.firstHit) {
        //     let m = Matrix.transform([
        //       ["translate", Vector.add(hit.firstHit.point, new Vector(0, -Math.random() * 2, 0))],
        //       ["scale", Vector.fill(1 + Math.random() * 1)],
        //       ["ry", Math.random() * 2 * Math.PI],
        //       ["rx", (Math.random() - 0.5) * 0.07],
        //       ["rz", (Math.random() - 0.5) * 0.07],
        //     ]);
        //     instanceTrees.children[0].meshRenderer.addInstance(m);
        //   }
        // }
      }

      return container;
    }
  }

  // async function loadMap() {
  //   // const mapPath = "./touge.glb";
  //   // const colliderPath = "./tougeCollider.glb";
  //   // const mapPath = "../assets/models/brickPlane.glb";
  //   // const colliderPath = "../assets/models/brickPlane.glb";
  //   const mapPath = "../assets/models/test/staticColliderDetectObject.glb";
  //   const colliderPath = "../assets/models/test/staticColliderDetectObject.glb";

  //   // var grassAlbedo = await renderer.loadTextureAsync("../assets/textures/GroundForest003/GroundForest003_COL_VAR1_3K.jpg", { ...renderer.getSRGBFormats() });
  //   // var grassNormal = await renderer.loadTextureAsync("../assets/textures/GroundForest003/GroundForest003_NRM_3K.jpg");
  //   // var stoneAlbedo = await renderer.loadTextureAsync("../assets/textures/rocks_ground_03_2k_jpg/rocks_ground_03_diff_2k.jpg", { ...renderer.getSRGBFormats() });
  //   // var stoneNormal = await renderer.loadTextureAsync("../assets/textures/rocks_ground_03_2k_jpg/rocks_ground_03_nor_2k.jpg");

  //   const map = await renderer.loadGLTF(mapPath, { maxTextureSize: 1024 });
  //   const mapBatched = scene.add(renderer.BatchGameObject(map));

  //   // var leaves = renderer.loadTexture("../assets/textures/leaves.png");
  //   // var foliage = new renderer.ProgramContainer(await renderer.createProgramFromFile("../assets/shaders/custom/webgl2/foliage"));
  //   // var foliageMat = new NewMaterial(foliage);
  //   // foliageMat.doubleSided = true;
  //   // foliageMat.setUniform("useTexture", 1);
  //   // foliageMat.setUniform("albedoTexture", leaves);

  //   // mapBatched.castShadows = false;
  //   // mapBatched.meshRenderer.materials[1].programContainer = terrainProgram;
  //   // mapBatched.meshRenderer.materials[1].setUniform("roughness", 1);
  //   // mapBatched.meshRenderer.materials[1].setUniform("albedoTextures[0]", [ grassAlbedo, stoneAlbedo ]);
  //   // mapBatched.meshRenderer.materials[1].setUniform("normalTextures[0]", [ grassNormal, stoneNormal ]);
  //   // // mapBatched.meshRenderer.materials[1].setUniform("albedo", [0.25, 0.25, 0.25, 1]);
  //   // mapBatched.meshRenderer.materials[2].setUniform("normalStrength", 2.5);
  //   // mapBatched.meshRenderer.materials[6].programContainer = renderer.programContainers.unlit;

  //   if (colliderPath) {
  //     var collider = await renderer.loadGLTF(colliderPath, { loadMaterials: false, loadNormals: false, loadTangents: false });
  //     collider.transform.set(map.transform);
  //     physicsEngine.addMeshCollider(collider);
  //   }

  //   // initSnow();
  //   // await initTrees();
  // }

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
    snowParticles.startSize = dst => Vector.fill(0.05 + Math.random() * 0.07, dst);

    snowParticles.emitPosition = dst => {
      return Vector.add(car.mainCamera.transform.position, new Vector((Math.random() - 0.5) * 50, 10, (Math.random() - 0.5) * 50), dst);
    };
    snowParticles.emitVelocity = dst => {
      return new Vector(0, -4, 0, dst);
    };

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
        if (car && car.mainGainNode) {
          car.mainGainNode.gain.value = value;
        }
        saveSettings();
      }, 0, 2, 0.01, true),

      haptics: new CheckboxSetting("Haptics", true, value => {
        if (car) {
          car.haptics = value;
        }
        saveSettings();
      }),

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
        // window.isDay(value);
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

      tcs: new CheckboxSetting("TCS", true, value => {
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

      autoCountersteer: new SliderSetting("Auto countersteer", 0.4, value => {
        if (car) {
          car.autoCountersteer = value;
        }
        saveSettings();
      }, 0, 1, 0.05),

      autoCountersteerVelocityMultiplier: new SliderSetting("Auto countersteer velocity", 0.25, value => {
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