import Stats from "../statsModule.mjs";
import GameCanvas from "../gameCanvas-6.0-module.mjs";
import * as ENUMS from "../engine/constants.mjs";
import Renderer, { Scene, GameObject, Camera } from "../engine/renderer.mjs";
import Vector from "../engine/vector.mjs";
import Matrix from "../engine/matrix.mjs";
import Quaternion from "../engine/quaternion.mjs";
import { clamp, hideElement, showElement, getAngleBetween, getDistanceBetween } from "../engine/helper.mjs";
import { GetMeshAABB, PhysicsEngine, MeshCollider } from "../engine/physics.mjs";
import { Car } from "../car.js";
import * as carSettings from "./carSettings.mjs";
import Keybindings from "../keybindingsController.mjs";
import GamepadManager, { quadraticCurve, deadZone } from "../gamepadManager.js";
import OrbitCamera from "../engine/orbitCamera.mjs";
import { NewMaterial } from "../engine/material.mjs";
import { CatmullRomCurve } from "../engine/curves.mjs";
import PRNG from "../PRNG.mjs";
import GLDebugger from "../engine/GLDebugger.mjs";

import * as carPaintShader from "../assets/shaders/custom/carPaint.glsl.mjs";

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
  const selectCarButton = garageOverlay.querySelector(".selectCar");
  const progressBar = loadingOverlay.querySelector(".progressBar");
  const progressStatus = loadingOverlay.querySelector(".progressStatus");
  let lastTextStatus;
  const messagesContainer = document.querySelector(".messages");

  const seed = "apples";
  const prng = new PRNG(seed);
  let stats;

  const ui = new GameCanvas(undefined, { publicMethods: false });
  ui.canvas.classList.add("ingameUICanvas");
  ui.canvas.style.zIndex = 2;

  // var snowCamera;

  var settingsOpened = false;
  var paused = false;

  const spawnPosition = new Vector(0, 2, 0);
  const spawnRotation = Quaternion.identity();
  const allowedCars = [ "myLowpolySportsCar" ];
  let selectedCar = 0;
  let loadedCar = 0;
  let carRotation = 0;

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
    shadowBiases: [-0.0003, -0.001],
  });
  renderer.disableContextMenu();
  renderer.canvas.style.position = "fixed";

  window.isDay = isDay;
  const settingsManager = new SettingsManager();
  keybindings = new Keybindings(renderer, gamepadManager, bindsLookup);
  controllerUIInteraction = new ControllerUIInteraction(keybindings);

  // Scene
  setProgress(currentTask++, totalTasks, "Loading scene");
  const scene = new Scene("Playground");
  renderer.add(scene);

  scene.fogColor = [0.4, 0.4, 0.5, 1];
  scene.fogDensity = 0.001;
  scene.skyboxFogIntensity = 1;
  scene.environmentMinLight = 0.5;
  scene.skyboxAnimation.speed = 0.01;

  scene.postprocessing.exposure = -5;//-1;
  scene.postprocessing.vignette.amount = 0.3;
  scene.postprocessing.vignette.falloff = 0.3;
  // scene.postprocessing.saturation = 0.4;
  // scene.postprocessing.rainTexture = await renderer.loadTextureAsync("../assets/textures/rain-normal-map.jpg");

  renderer.shadowCascades.refreshRate = 0;

  isDay(true);

  await scene.loadEnvironment({ hdrFolder: "cubemaps/lowpolyDesert" });

  // await scene.loadEnvironment({
  //   // hdr: "../assets/hdri/kloofendal_48d_partly_cloudy_puresky_4k.hdr",
  //   hdrFolder: "../assets/hdri/kloofendal_48d_partly_cloudy_puresky_1k_precomputed",
  //   // hdrFolder: "../assets/hdri/snowy_field_1k",
  //   // res: 1024
  // });

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

  const { terrain, checkChunks } = await generateLowpolyForest();
  window.checkChunks = checkChunks;

  // // Reflection probe
  // await sleep(6000);
  // setProgress(currentTask++, totalTasks, "Generating cubemap");
  // var cubemap = renderer.captureReflectionCubemap(new Vector(0, 1, 0));
  // var oldSkybox = scene.skyboxCubemap;
  // await scene.loadEnvironment({ cubemap });
  // scene.skyboxCubemap = oldSkybox;
  // scene.environmentIntensity = 1;

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
  let car;
  car = await loadCar(carSettings[carKey].settings, carModel);

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

    carRotation += frameTime * 0.1;

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

      day: new CheckboxSetting("Daytime", true, () => {
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