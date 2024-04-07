import * as ENUMS from "../engine/constants.mjs";
import Renderer from "../engine/renderer.mjs";
import { Scene } from "../engine/scene.mjs";
import { GameObject } from "../engine/gameObject.mjs";
import { AudioListener3D } from "../engine/audioListener3D.mjs";
import { Camera } from "../engine/camera.mjs";
import { Light } from "../engine/light.mjs";
import { AnimationController } from "../engine/animationController.mjs";
import { AnimationBlend } from "../engine/animationBlend.mjs";
import { 
  AABB,
  PhysicsEngine,
  GetMeshAABB,
  MeshCollider,
} from "../engine/physics.mjs";
import Vector from "../engine/vector.mjs";
import Quaternion from "../engine/quaternion.mjs";
import Matrix from "../engine/matrix.mjs";
import {
  roundToPlaces,
  clamp,
  lerp,
  inverseLerp,
  fadeOutElement,
  hideElement,
  showElement,
  roundNearest,
  resetAnimations,
  cloneTemplate,
  removeChildren,
  wrap,
  clamp01
} from "../engine/helper.mjs";
import { WEAPONENUMS, updateBulletTrails, Weapon, Scope, BulletTrail, bulletTrails } from "./weapon.js";
import OrbitCamera from "../engine/orbitCamera.mjs";
// import FlyCamera from "../engine/flyCamera.mjs";
import PlayerPhysicsBase from "../playerPhysicsBase.mjs";
import * as brokenPlasterSource from "../assets/shaders/custom/brokenPlaster.glsl.mjs";
import * as waterSource from "../assets/shaders/custom/water.glsl.mjs";
import Keybindings from "../keybindingsController.mjs";
import GamepadManager, { deadZone } from "../gamepadManager.js";
import { NewMaterial } from "../engine/material.mjs";
import { LerpCurve } from "../engine/curves.mjs";
import Bloom from "../engine/postprocessing-effects/bloom.mjs";
import Tonemapper from "../engine/postprocessing-effects/tonemapper.mjs";
import FXAA from "../engine/postprocessing-effects/fxaa.mjs";
import Vignette from "../engine/postprocessing-effects/vignette.mjs";
import SniperScopeEffect from "./postprocessingEffects/sniperScope.mjs";
import GameCanvas from "../gameCanvas-6.0-module.mjs";
import { IK } from "../engine/IK.mjs";
import GLDebugger from "../engine/GLDebugger.mjs";
import createInspector from "../engine/inspector/inspector.mjs";
import { generateName } from "./randomName.mjs";

// import * as carSettings from "../cardemo/carSettings.mjs";
// import { Car } from "../car.js";
import { AudioSource3D } from "../engine/audioSource3D.mjs";

/*

Physics:
https://wickedengine.net/2020/04/26/capsule-collision-detection/

Multiplayer:
https://github.com/MFatihMAR/Game-Networking-Resources
https://developer.valvesoftware.com/wiki/Source_Multiplayer_Networking
https://www.gabrielgambetta.com/client-side-prediction-server-reconciliation.html
https://www.codersblock.org/blog/client-side-prediction-in-unity-2018
https://github.com/spectre1989/unity_physics_csp/blob/d0a1f2e5642e5833d373d8b2c1ce2ac5eb438b3b/Assets/Logic.cs#L314
https://gafferongames.com/post/networked_physics_2004/

Database security:
https://www.vaadata.com/blog/how-to-securely-store-passwords-in-database/

Inspiration:
https://www.youtube.com/watch?v=flf20FZHT3M&t=8s

*/

// Fog settings
// scene.sunIntensity = {x: 6, y: 4, z: 4}
// scene.skyboxFogBlendFactor = 2
// scene.skyboxFogHeight = 0.5
// scene.environmentIntensity = 0.8
// scene.fogDensity = 0.03

// Bullets appear before player character
// Get kills/death to leaderboard when joining
// Heal over time
// See through wall when dead
// Health bar for enemies
// Falldamage

(async function() {
  /*
    Local storage locations
  */
  const LS_BASE = "com.tc5550.webgl";
  const LS_USERNAME = LS_BASE + ".username";
  const LS_SELECTEDCLASS = LS_BASE + ".selectedClass";
  const LS_SETTINGS = LS_BASE + ".settings";

  /*
    Multiplayer settings
  */
  const LERP_DELAY = 200;
  const SERVER_SEND_FPS = 15;
  const SIMULATED_PING = () => 0;//Math.random() * 50 + 50;

  /*
    Misc. vars
  */
  var running = true;
  
  var ws;
  var stateBuffer = [];
  var inputBuffer = [];
  var inputsToSend = [];
  var tick = 0;
  var wsSendTime = 0;
  var multiplayerCharacters = {};
  var latencies = [];
  // var actionQueue = [];
  // var oldActionQueues = [];
  // var sendDataInterval;
  
  var mouse = { movementX: 0, movementY: 0 };
  
  var defaultFov = 40;//45;//37;
  let targetFov = defaultFov;
  var currentFov = defaultFov;
  
  var classes;
  var selectedClass;
  
  var time = 0;
  var fpsHistory = new Array(20).fill(0);

  const totalLoadingStatus = 0;
  let currentLoadingStatus = 0;

  let updateOffset = 0;

  /*
    HTML elements
  */
  const lobbyTabs = document.querySelectorAll(".lobbyUI input[type='radio']");

  const lobbyUI = document.querySelector(".lobbyUI");
  const deployButton = lobbyUI.querySelector("#deploy");
  deployButton.addEventListener("click", deploy);
  
  const usernameInput = lobbyUI.querySelector("#username");
  usernameInput.addEventListener("change", function() {
    const name = usernameInput.value;
    localStorage.setItem(LS_USERNAME, name);
  });
  let name = localStorage.getItem(LS_USERNAME);
  if (name == null || name.trim().length === 0) {
    name = generateName();
  }
  localStorage.setItem(LS_USERNAME, name);
  usernameInput.value = name;
  
  const loadoutUI = document.querySelector(".loadout");
  const selectClassButton = loadoutUI.querySelector(".selectClass");
  selectClassButton.addEventListener("click", function() {
    const c = selectClassButton.getAttribute("data-targetClass");
    if (c) {
      selectClass(c);
    }
  });
  
  const gameUI = document.querySelector(".gameUI");
  
  const ammoCounter = document.querySelector(".gameUI .bottomRight .ammo");
  const currentAmmoSpan = ammoCounter.querySelector(".current");
  const maxAmmoSpan = ammoCounter.querySelector(".max");
  
  const healthBarReal = document.querySelector(".gameUI .bottomLeft .healthContainer .currentHealth");
  const healthBarAnimation = document.querySelector(".gameUI .bottomLeft .healthContainer .healthAnimation");

  const killAlert = document.querySelector(".gameUI .killAlert");
  const killAlertSpecial = document.querySelector(".gameUI .killAlert .special");
  const killAlertPlayer = document.querySelector(".gameUI .killAlert .player");

  const killsSpans = [
    document.querySelector(".gameUI .killAlert .kills"),
    document.querySelector(".gameUI .topRight .kills")
  ];

  const aliveScreen = document.querySelector(".aliveScreen");
  const deathScreen = document.querySelector(".deathScreen");
  const loadingScreen = document.getElementsByClassName("loading")[0];
  const loadingTitle = loadingScreen.querySelector(".loader");
  const loadingStatus = document.getElementById("loadingStatus");

  const leaderboardDOM = document.querySelector(".leaderboard");

  /*
    Create classes
  */
  class Player extends PlayerPhysicsBase {
    constructor(pos = Vector.zero()) {
      super(pos);
  
      this.id = null;
      this.name = null;
  
      this.visualHeight = this.standHeight;
  
      this.weapons = [];
      this.currentWeapon = 0;
  
      this.handRotation = this.rotation;
  
      this.handOffset = {x: 0.3, y: -0.25, z: -0.5};
      this.handRotOffset = {x: 0, y: 0.1 * 0, z: 0};
  
      // Head bobbing
      this.headBobStrength = 0.06;
      this.headBobSpeed = 0.25;
      this.walkTime = 0;
  
      this.killedBy = null;
      this.killcamDir = null;
  
      this.killTimer = 0;
      this.streakNames = ["", "Doublekill", "Triplekill", "Quadkill", "Megakill"];
  
      this.leaderboardEntry = null;
  
      this.maxHealth = 100;
      var _health = this.maxHealth;
      Object.defineProperty(this, "health", {
        get: function() {
          return _health;
        },
        set: function(val) {
          _health = val;
          _health = clamp(_health, 0, this.maxHealth);
          setHealth(_health / this.maxHealth);
        }
      });
      this.health = _health; // Update UI
  
      var _state = this.STATES.IN_LOBBY;
      Object.defineProperty(this, "state", {
        get: () => {
          return _state;
        },
        set: (val) => {
          _state = val;
  
          if (this.state == this.STATES.IN_LOBBY) {
            showElement(lobbyUI);
            lobbyUI.querySelector("#deploy").classList.remove("flashButton");
            lobbyUI.querySelector(".navigation").classList.remove("slideOut");
  
            hideElement(gameUI);
            hideElement(deathScreen);
  
            renderer.setActiveScene(menuScene);
            // renderer.currentScene = 1;
            // scene.skyboxVisible = false;
  
            var t = this.getCurrentWeapon()?.weaponObject?.transform;
            if (t) {
              t.position = Vector.zero();
              t.rotation = Quaternion.identity();
            }

            renderer.unlockPointer();
          }
          else if (this.state == this.STATES.PLAYING) {
            showElement(gameUI);
            showElement(aliveScreen);
            hideElement(lobbyUI);
            // hideElement(loadoutUI);
  
            renderer.setActiveScene(scene);
            // scene.skyboxVisible = true;
  
            applySettings();

            renderer.lockPointer();
          }
          else if (this.state == this.STATES.DEAD) {
            showElement(gameUI);
            hideElement(aliveScreen);
            showElement(deathScreen);
            hideElement(lobbyUI);

            this.getCurrentWeapon().unADS();
            renderer.unlockPointer();
  
            // scene.skyboxVisible = true;
          }
        }
      });
  
      Object.defineProperty(this, "isPlaying", {
        get: () => {
          return this.state == this.STATES.PLAYING;
        }
      });
    }

    setName(name) {
      this.name = name;
      leaderboard.setItem(this.leaderboardEntry, ".name", this.name);
      document.querySelectorAll("*[data-myname]").forEach(e => e.textContent = this.name);
    }
  
    loginResponse(data) {
      this.id = data.id;
  
      this.leaderboardEntry = leaderboard.addPlayer();
      this.setName(data.name);
    }
  
    die() {
      this.state = this.STATES.DEAD;
      this.health = 0;
      Vector.zero(this.velocity);
  
      this.killcamDir = Matrix.getForward(Matrix.fromQuaternion(Quaternion.eulerVector(Vector.negate(this.getHeadRotation()))));
  
      deathScreen.querySelector(".player").innerText = getPlayerNameByID(this.killedBy);
  
      // setTimeout(() => {
      //   this.respawn();
      // }, 3000);
    }
  
    gotoLobby() {
      this.state = this.STATES.IN_LOBBY;
      this.health = this.maxHealth;
    }
  
    enemyKilled(enemy) {
      this.killStreak++;
      this.killTimer = 3;
      this.kills++;
      showKillAlert(enemy.name, this.streakNames[Math.min(this.streakNames.length - 1, this.killStreak - 1)]);
  
      // if (leaderboardEntry) leaderboard.setItem(leaderboardEntry, ".kills", this.kills);
      killsSpans[0].innerText = this.kills + " kills";
      killsSpans[1].innerText = this.kills + " kills";

      killSoundPlayer.currentTime = 0;
      killSoundPlayer.play();
    }
  
    setWeapons(weapons) {
      for (let weapon of this.weapons) {
        if (weapon.weaponObject) {
          weapon.weaponObject.visible = false;
        }
      }
  
      this.weapons = weapons;
  
      for (let weapon of this.weapons) {
        weapon.onFire = (data) => {
          // Trails look slow from 3rd person perspective
          const trailVelocity = Vector.multiply(data.trailVelocity, 2);
          const trailHealth = data.trailHealth / 2;

          sendMessage("playerAction", {
            action: "fireWeapon",
            trailOrigin: data.origin,
            trailDirection: data.trailDirection,
            trailVelocity,
            trailHealth,
          });
        };

        weapon.onHit = (data) => {
          // Remove "gameObject" from hit to prevent circular JSON
          const hit = {
            distance: data.hit.distance,
            normal: data.hit.normal,
            point: data.hit.point,
          };

          sendMessage("playerAction", {
            action: "hitEffect",
            hit,
          });
        };
      }
  
      if (this.getCurrentWeapon()) {
        this.getCurrentWeapon().weaponObject.visible = true;
      }
    }
  
    getCurrentWeapon() {
      return this.weapons[this.currentWeapon];
    }
  
    switchWeapon(index) {
      if (!this.isPlaying) {
        return;
      }
  
      if (index >= 0 && index < this.weapons.length && index != this.currentWeapon) {
        window.muzzleFlashEnabled = false;
  
        var oldWeapon = this.weapons[this.currentWeapon];
        this.rotation = Vector.add(this.rotation, oldWeapon.recoilOffset);
        oldWeapon.unequip();
        
        var newWeapon = this.weapons[index];
        newWeapon.equip();
        crosshair.type = newWeapon.crosshairType;
  
        this.currentWeapon = index;
      }
    }
  
    getHeadPos() {
      return Vector.add(this.position, {x: 0, y: this.standHeight / 2 + this.visualHeight / 2 - 0.1 + Math.sin(this.walkTime) * this.headBobStrength, z: 0});
    }
  
    // Fire() {
    //   if (this.isPlaying && this.getCurrentWeapon()) {
    //     this.weapons[this.currentWeapon].fire();
    //   }
    // }
  
    update(dt) {
      if (this.state == this.STATES.IN_LOBBY) {
        // this.getCurrentWeapon().weaponObject.transform.rotation = Quaternion.euler(0, physicsEngine.time, 0);
        // weaponCamera.transform.position = new Vector(0, 0, -2);
        // weaponCamera.transform.rotation = Quaternion.euler(0, Math.PI, 0);
  
        // var a = physicsEngine.time * 0.1 + Math.PI;
        // var r = 40;
        // mainCamera.setFOV(30);
        // mainCamera.transform.matrix = Matrix.lookAt(new Vector(Math.cos(a) * r, 20, Math.sin(a) * r), Vector.zero());
      }
      else if (this.state == this.STATES.DEAD) {
        const m = multiplayerCharacters[this.killedBy];
        if (m && m.gameObject) {
          let matrix = Matrix.lookAt(this.getHeadPos(), Vector.add(m.gameObject.transform.position, new Vector(0, 1.8, 0)), Vector.up());
          this.killcamDir = Vector.slerp(this.killcamDir, Matrix.getForward(matrix), 0.1);
          mainCamera.transform.matrix = Matrix.lookAt(this.getHeadPos(), Vector.add(this.getHeadPos(), this.killcamDir));

          const distance = Vector.distance(this.getHeadPos(), m.gameObject.transform.position);
          let fov = 100 / Math.max(0, distance - 5) ** 0.7;
          fov = clamp(fov, 6, 35);
          mainCamera.setFOV(fov);
        }
      }
      else if (this.state == this.STATES.PLAYING) {
        this.visualHeight += (this.height - this.visualHeight) * 0.4;
  
        const currentWeapon = this.getCurrentWeapon();

        if (currentWeapon) {
          currentWeapon.update(dt);
        }

        {
          const armsVisible = !(
            currentWeapon.scope.sniperScope &&
            currentWeapon.mode === currentWeapon.GunModes.ADS
          );
          playerArms.gameObject.visible = armsVisible;

          // const m = Matrix.copy(currentWeapon.weaponObject.transform.worldMatrix);
          // Matrix.setScale(m, Vector.fill(1));
          // Matrix.applyRotationY(Math.PI, m);
          // Matrix.applyTranslation(new Vector(0, 0, -0.15), m);
          
          const m = Matrix.translate(this.getHeadPos());
          const rot = this.handRotation;
          Matrix.applyRotationY(-rot.y + Math.PI, m);
          Matrix.applyRotationX(rot.x, m);
          Matrix.applyTranslation(new Vector(0, -0.2, 0.1), m);
          
          playerArms.gameObject.transform.matrix = m;
          
          if (!currentWeapon.isReloading) {
            const leftHandTarget = currentWeapon.weaponObject.getChild("LeftHandOffset", true);
            const rightHandTarget = currentWeapon.weaponObject.getChild("RightHandOffset", true);

            if (leftHandTarget) {
              const m = Matrix.copy(leftHandTarget.transform.worldMatrix);
              Matrix.setScale(m, Vector.fill(1));
              Matrix.applyRotationX(Math.PI, m);

              const isVerticalGrip = leftHandTarget.customData.handGripType == 1;
              if (isVerticalGrip) {
                Matrix.applyRotationX(Math.PI / 2, m);
                Matrix.applyRotationZ(Math.PI / 2, m);
              }
              else {
                Matrix.applyRotationX(Math.PI * 0.1, m);
                Matrix.applyRotationY(-Math.PI * 0.15, m);
              }

              const handBone = playerArms.leftArmIK.bones[2];
              const holdOffsetObject = handBone.getChild(/HoldOffset/, true);
              const holdOffset = Matrix.inverse(holdOffsetObject.transform.getWorldMatrix(handBone));
              Matrix.multiply(m, holdOffset, m);

              playerArms.leftArmIK.endObject.transform.worldMatrix = m;
            }

            if (rightHandTarget) {
              const m = Matrix.copy(rightHandTarget.transform.worldMatrix);
              Matrix.setScale(m, Vector.fill(1));
              Matrix.applyRotationX(Math.PI, m);

              const isVerticalGrip = rightHandTarget.customData.handGripType == 1;
              if (isVerticalGrip) {
                Matrix.applyRotationX(Math.PI / 2, m);
                Matrix.applyRotationZ(-Math.PI / 2, m);
              }
              else {
                Matrix.applyRotationX(Math.PI * 0.1, m);
                Matrix.applyRotationY(-Math.PI * 0.15, m);
              }

              const handBone = playerArms.rightArmIK.bones[2];
              const holdOffsetObject = handBone.getChild(/HoldOffset/, true);
              const holdOffset = Matrix.inverse(holdOffsetObject.transform.getWorldMatrix(handBone));
              Matrix.multiply(m, holdOffset, m);

              playerArms.rightArmIK.endObject.transform.worldMatrix = m;
            }
          }
          else {
            playerArms.leftArmIK.endObject.transform.worldMatrix = m;
            playerArms.rightArmIK.endObject.transform.worldMatrix = m;
          }
        }
  
        this.clampRotation();
  
        mainCamera.setFOV(currentFov);
        weaponCamera.setFOV(this.getCurrentWeapon().getWeaponFov());
  
        let rot = this.getHeadRotation();
        let m = Matrix.transform([
          ["translate", this.getHeadPos()],
          ["ry", -rot.y],
          ["rx", -rot.x],
          ["rz", -rot.z],
        ]);
        mainCamera.transform.matrix = m;
        weaponCamera.transform.matrix = m;
  
        // mainCamera.transform.rotation = Quaternion.eulerVector(Vector.negate(this.getHeadRotation()));
        // mainCamera.transform.position = this.getHeadPos();//Vector.add(this.position, {x: 0, y: this.height - 0.1, z: 0});
  
        // weaponCamera.transform.position = mainCamera.transform.position;
        // weaponCamera.transform.rotation = mainCamera.transform.rotation;
  
        // var rot = this.getHeadRotation();
        // var m = Matrix.transform([
        //   ["translate", this.getHeadPos()],
        //   ["rz", -rot.z],
        //   ["ry", -rot.y],
        //   ["rx", -rot.x]
        // ]);

        const forward = Matrix.getForward(m);
        if (!Vector.isNaN(forward)) {
          audioListener.setDirection(Matrix.getForward(m), Vector.up());
        }
        if (!Vector.isNaN(this.position)) {
          audioListener.setPosition(this.position);
        }
  
        this.killTimer -= dt;
        if (this.killTimer <= 0) {
          this.killStreak = 0;
        }
      }
    }
  
    fixedUpdate(dt) {
      if (this.state == this.STATES.PLAYING) {
        const currentWeapon = this.getCurrentWeapon();

        const inputs = {
          forward: deadZone(clamp(-keybindings.getInput("vertical"), 0, 1)),
          back: deadZone(clamp(keybindings.getInput("vertical"), 0, 1)),
          left: deadZone(clamp(-keybindings.getInput("horizontal"), 0, 1)),
          right: deadZone(clamp(keybindings.getInput("horizontal"), 0, 1)),
          jump: keybindings.getInput("jump"),
          crouching: keybindings.getInput("crouch"),
          _fireDown: renderer.mouse.left,
          fire: renderer.mouse.left && !(inputBuffer[tick - 1]?.inputs?._fireDown ?? false),
          ads: renderer.isPointerLocked() && renderer.mouse.right,
          currentWeaponName: currentWeapon.name,
        };
  
        this.handRotOffset = Vector.lerp(
          this.handRotOffset,
          new Vector(
            clamp(mouse.movementY * 0.005, -0.2, 0.2),
            clamp(mouse.movementX * 0.005, -0.2, 0.2),
            0
          ),
          0.05
        );
        mouse.movementX *= 0.3;
        mouse.movementY *= 0.3;
  
        if (currentWeapon) {
          currentWeapon.fixedUpdate(dt);
        }
  
        this.handRotation = this.getHeadRotation();
        // this.handRotation = Vector.lerp(this.handRotation, this.getHeadRotation(), 0.7);
  
        const oldPosition = Vector.copy(this.position);
  
        this.applyInputs(inputs, dt);
        this.simulatePhysicsStep(dt);
  
        // if (this.getCurrentWeapon()) {
        //   this.getCurrentWeapon().fixedUpdate(dt);
        // }
  
        if (this.grounded && (inputs.forward || inputs.back || inputs.left || inputs.right)) {
          let deltaPosition = Vector.distance(oldPosition, this.position);
          deltaPosition = clamp(deltaPosition / dt, 0, 1);
  
          let currentAcceleration = this.runningAcceleration;
          currentAcceleration *= (this.grounded ? this.crouching ? 0.5 : 1 : 0.1);
          if (this.getCurrentWeapon()) {
            currentAcceleration *= this.getCurrentWeapon().getSpeed();
          }
  
          this.walkTime += deltaPosition * currentAcceleration * this.headBobSpeed * dt;
        }
        else {
          this.walkTime += (roundNearest(this.walkTime, Math.PI) - this.walkTime) * 0.1;
        }
  
        targetFov = currentWeapon.mode === currentWeapon.GunModes.ADS ?
          currentWeapon.scope.ADSFOV :
          defaultFov;
        currentFov += (targetFov - currentFov) * currentWeapon.ADSSpeed;
  
        // ADS weapon
        if (this.isPlaying) {
          if (inputs.ads && currentWeapon.mode !== currentWeapon.GunModes.ADS) {
            currentWeapon.ADS();
          }
          if (!inputs.ads && currentWeapon.mode === currentWeapon.GunModes.ADS) {
            currentWeapon.unADS();
          }
        }

        // Fire weapon
        if (this.isPlaying && currentWeapon && inputs.fire) {
          currentWeapon.fire();
        }

        /*
          Send to server
        */
        inputBuffer[tick] = {
          localTime: syncedClock.getCurrentTime(),
          tick,
          inputs,
          rotation: this.handRotation,
        };
      }
      else {
        inputBuffer[tick] = {
          localTime: syncedClock.getCurrentTime(),
          tick
        };
      }
  
      stateBuffer[tick] = {
        position: this.position,
        velocity: this.velocity
      };
      inputsToSend.push({...inputBuffer[tick]});
  
      tick++;
    }
  
    clampRotation() {
      var w = this.getCurrentWeapon();
      var ro = w ? w.recoilOffset : 0;
      this.rotation.x = clamp(this.rotation.x, -Math.PI / 2 - ro.x, Math.PI / 2 - ro.x);
    }
  }

  /*
    Begin loading
  */
  showElement(loadingScreen);

  // const stats = new Stats();
  // document.body.appendChild(stats.dom);

  const ui = new GameCanvas(undefined, {publicMethods: false});
  ui.canvas.classList.add("ingameUI");

  const syncedClock = new SyncedClock();
  const audioHandler = new AudioHandler();
  const audioListener = new AudioListener3D();
  const leaderboard = new Leaderboard(leaderboardDOM);
  const killfeed = window.killfeed = new Killfeed();
  const settings = new Settings();
  const captureZoneManager = new CaptureZoneManager();
  const crosshair = new Crosshair();
  const hitmarker = window.hitmarker = new Hitmarker();

  /*
    Weapon inspector
  */
  setLoadingStatus("Creating weapon inspector");
  const { switchWeapon: switchInspectedWeapon } = await createWeaponInspectCanvas();

  setLoadingStatus("Setting up renderer");
  console.time("renderer.setup");

  const renderer = window.renderer = new Renderer({
    version: 2,
    clearColor: [0.02, 0.02, 0.02, 1],
    shadowSizes: [24, 48],
    renderScale: 1,
    path: "../",
    renderpipeline: ENUMS.RENDERPIPELINE.FORWARD,
  });

  renderer.on("error", function() {
    loadingStatus.innerText = "WebGL not supported";
  });
  renderer.on("contextlost", function() {
    displayError("WebGL context lost");
  });

  console.timeEnd("renderer.setup");

  setLoadingStatus("Init gamepad manager");
  const gamepadManager = new GamepadManager();
  const keybindings = new Keybindings(renderer, gamepadManager);
  keybindings.setBinding("jump", {
    keyboard: "Space",
    controller: "A"
  });
  keybindings.setBinding("crouch", {
    keyboard: "ShiftLeft",
    controller: "X"
  });

  /*
    Post processing
  */
  setLoadingStatus("Post processing");
  const pp = renderer.postprocessing;

  // Bloom
  const bloomEffect = pp.addEffect(new Bloom());
  const lensDirtTexture = await renderer.loadTextureAsync(renderer.path + "assets/textures/lensDirt.webp");
  bloomEffect.lensDirtTexture = lensDirtTexture;
  bloomEffect.lensDirtTextureWidth = 1280;
  bloomEffect.lensDirtTextureHeight = 720;
  bloomEffect.lensDirtIntensity = 5;

  // Tonemapper
  pp.addEffect(new Tonemapper()).exposure = -0.5;

  // Sniper scope effect
  const sniperScopeEffect = pp.addEffect(new SniperScopeEffect());
  sniperScopeEffect.enabled = false;

  // FXAA
  const fxaaEffect = pp.addEffect(new FXAA());
  
  // Vignette
  pp.addEffect(new Vignette());

  /*
    Create scenes
  */
  setLoadingStatus("Creating scenes");
  const scene = new Scene("Main scene");
  renderer.add(scene);

  const menuScene = new Scene("Menu scene");
  renderer.add(menuScene);

  /*
    Debug
  */
  setLoadingStatus("Creating debugger");
  window.glDebugger = new GLDebugger(scene);

  /*
    Physics
  */
  setLoadingStatus("Creating physics engine");
  const physicsEngine = new PhysicsEngine(scene);

  /*
    Environment (main scene)
  */
  setLoadingStatus("Loading environment");
  console.time("loadEnvironment");

  scene.fogColor = [0.5, 0.5, 0.7, 1];
  scene.skyboxFogIntensity = 1;
  scene.environmentIntensity = 0.8;
  scene.sunIntensity = Vector.fill(4);

  // await scene.loadEnvironment();
  await scene.loadEnvironment({ hdrFolder: "../assets/hdri/kloofendal_48d_partly_cloudy_puresky_1k_precomputed" });
  // var oldSkybox = scene.skyboxCubemap;
  // await scene.loadEnvironment({ hdrFolder: "../assets/hdri/wide_street_01_1k_precomputed" });
  // await scene.loadEnvironment({ hdrFolder: "../assets/hdri/fouriesburg_mountain_cloudy_1k" });
  // scene.skyboxCubemap = oldSkybox;

  console.timeEnd("loadEnvironment");

  /*
    Environment (menu)
  */
  menuScene.copyEnvironment(scene);
  menuScene.sunIntensity = Vector.fill(3);
  menuScene.environmentIntensity = 0.35;
  menuScene.sunDirection.z *= -1;

  /*
    Cameras
  */
  setLoadingStatus("Creating cameras");
  // const debugFlyCamera = new FlyCamera(renderer, {near: 0.01, far: 1000});
  // debugFlyCamera.baseSpeed = 8;
  // debugFlyCamera.sprintSpeed = 50;

  // const orbitCamera = new OrbitCamera(renderer, {position: new Vector(0, 0, -3), near: 0.1, far: 300, fov: 23});

  const mainCamera = new Camera({position: new Vector(0, 0, -3), near: 0.1, far: 300, layer: 0b1});
  const weaponCamera = new Camera({near: 0.005, far: 20, layer: 0b10, fov: 23});

  const lobbyCamera = new OrbitCamera(renderer, {near: 0.01, far: 100, fov: 15}, { rotate: false, translate: false, scale: false, stylePointer: false });
  lobbyCamera.distance = 4;
  lobbyCamera.setCenter(new Vector(0, 0.9, 0));

  const resizeEvent = function() {
    mainCamera.setAspect(renderer.aspect);
    weaponCamera.setAspect(renderer.aspect);
  };
  renderer.on("resize", resizeEvent);
  resizeEvent();

  /*
    Materials
  */
  setLoadingStatus("Custom material shaders");
  const reddotMaterial = await createReddotMaterial();
  const foliageMaterial = await createFoliageMaterial();
  // const waterMaterial = await createWaterMaterial();

  /*
    Objects
  */
  // AABB visualizer
  setLoadingStatus("AABB visualiser");
  const solidColorInstanceProgram = new renderer.ProgramContainer(await renderer.createProgramFromFile(renderer.path + "assets/shaders/custom/webgl2/solidColor"));
  scene.add(new GameObject("AABB", {
    meshRenderer: new renderer.MeshInstanceRenderer([new NewMaterial(solidColorInstanceProgram)], [new renderer.MeshData(renderer.getLineCubeData())], {drawMode: renderer.gl.LINES}),
    castShadows: false
  }));

  // Bullet holes
  setLoadingStatus("Bullet holes");
  const bulletHoleTexture = renderer.loadTexture(renderer.path + "assets/textures/bullethole.png");
  // const bulletHoles = scene.add(new GameObject("HitObject", {
  //   meshRenderer: new renderer.MeshInstanceRenderer([renderer.CreateLitMaterial({opaque: 0, albedoTexture: bulletHole}, renderer.programContainers.litInstanced)], [await renderer.loadObj(renderer.path + "assets/models/plane.obj")]),
  //   castShadows: false
  // }));
  const bulletHoles = scene.add(renderer.CreatePlane());
  bulletHoles.meshRenderer = bulletHoles.meshRenderer.getInstanceMeshRenderer();
  bulletHoles.meshRenderer.materials[0] = renderer.CreateLitMaterial({opaque: 0, albedoTexture: bulletHoleTexture}, renderer.programContainers.litInstanced);
  bulletHoles.castShadows = false;

  // Bullet trails
  setLoadingStatus("Bullet trails");
  const bulletTrailTexture = renderer.loadTexture(renderer.path + "assets/textures/bulletTrail.png");

  const bulletTrailMaterial = renderer.CreateLitMaterial(
    {
      opaque: 0,
      emissiveFactor: [40, 5, 5],
      emissiveTexture: bulletTrailTexture,
      albedo: [0, 0, 0, 1],
      albedoTexture: bulletTrailTexture
    },
    renderer.programContainers.litInstanced
  );
  bulletTrailMaterial.doubleSided = true;

  const bulletTrail = scene.add(new GameObject("BulletTrail", {
    meshRenderer: new renderer.MeshInstanceRenderer([
      bulletTrailMaterial
    ], [
      await renderer.loadObj("../assets/models/bulletTrail.obj")
    ]),
    castShadows: false
  }));
  bulletTrail.disableFrustumCulling = true;

  // Bullet hit effect
  setLoadingStatus("Hit effect");
  const hitEffectObject = new GameObject("Spark particles");
  scene.add(hitEffectObject);

  // Rocks
  const rockMeshData = (await renderer.loadGLTF(renderer.path + "assets/models/bulletHitRockSmooth.glb")).children[0].meshRenderer.meshData[0];
  const rocks = new renderer.ParticleSystem(200, rockMeshData);
  rocks.orientation = "faceCamera";
  rocks.emitHealth = 1.5;
  rocks.startSize = (dst) => Vector.fill(0.035 * Math.random(), dst);
  rocks.endSize = (dst) => Vector.fill(0, dst);

  const rockMaterial = renderer.CreateLitMaterial({ albedo: [0.18, 0.08, 0.05, 1], useVertexColor: false }, renderer.programContainers.litInstanced);
  rocks.material = rockMaterial;

  hitEffectObject.addComponent(rocks);

  // Smoke
  const sparks = new renderer.ParticleSystem();
  sparks.orientation = "faceCamera";
  sparks.gravityScale = 0.05;
  sparks.drag = 2;
  sparks.startSize = (dst) => Vector.fill(0.02, dst);
  sparks.endSize = (dst) => Vector.fill(0.25, dst);
  let curve = new LerpCurve();
  curve.addStage(0, 1);
  curve.addStage(0.5, 0.2);
  curve.addStage(1, 0);
  sparks.alphaCurve = curve;

  const smokeMaterial = renderer.CreateLitMaterial({
    albedoTexture: renderer.loadTexture(renderer.path + "assets/textures/smoke.png"),
    albedo: [1, 1, 1, 1],
  }, renderer.programContainers.particle);
  smokeMaterial.doubleSided = true;
  smokeMaterial.opaque = false;
  sparks.material = smokeMaterial;

  hitEffectObject.addComponent(sparks);

  // Muzzle flash
  setLoadingStatus("Muzzle flash effect");
  window.muzzleFlashEnabled = false;

  const muzzleFlashObject = new GameObject("Muzzle flash particles");
  muzzleFlashObject.setLayer(0b10, true);
  scene.add(muzzleFlashObject);

  const muzzleFlash = new renderer.ParticleSystem(200, await renderer.loadObj(renderer.path + "assets/models/bulletTrail.obj"));
  muzzleFlash.emitPosition = (dst) => Vector.zero(dst);
  muzzleFlash.emitVelocity = (dst) => new Vector(1 * (Math.random() - 0.5), 1 * (Math.random() - 0.5), -3, dst);
  muzzleFlash.startSize = (dst) => new Vector(2.5, 0.25, 0.25, dst);
  muzzleFlash.emitHealth = 0.25;
  muzzleFlash.gravityScale = 0;
  muzzleFlash.wind = (dst) => Vector.zero(dst);
  muzzleFlashObject.addComponent(muzzleFlash);

  const muzzleFlashMaterial = renderer.CreateLitMaterial({
    albedoTexture: renderer.loadTexture(renderer.path + "assets/textures/muzzleFlashParticle.png"),
    albedo: [20, 5, 2, 1],
  }, renderer.programContainers.particle);
  muzzleFlashMaterial.doubleSided = true;
  muzzleFlash.material = muzzleFlashMaterial;

  /*
    Create car
  */
  // setLoadingStatus("Car");
  const car = null;
  // const car = window.car = new Car(scene, physicsEngine, {
  //   path: renderer.path,
  //   ...carSettings.tocus.settings,
  //   TCS: true,
  //   ABS: true,
  // });
  // await car.setup(renderer.path + "assets/models/cars/tocus.glb");
  // car.rb.position.y = 5;
  // // car.camera.followDistance = 5;
  // // car.camera.followHeight = 0.3;
  // // car.camera.pitch = 0.1;
  // car.keybindings.setBinding("resetCar", {});
  // car.canMove = false;

  /*
    Create player
  */
  setLoadingStatus("Init player");
  const player = new Player();
  player.state = player.STATES.IN_LOBBY;
  hideElement(lobbyUI);
  player.physicsEngine = physicsEngine;

  physicsEngine.on("fixedUpdate", (dt) => {
    player.fixedUpdate(dt);
    player.update(dt);

    if (car && car.canMove) {
      player.position = car.rb.position;
      player.velocity = Vector.zero();
    }
  });

  const hitDirectionIndicator = new HitDirectionIndicator(player);

  const { weaponModels, weapons } = await setupWeapons();
  player.setWeapons(classes[selectedClass].weapons);

  const playerArms = await createPlayerArms();

  /*
    Load maps
  */
  setLoadingStatus("Load maps");
  await addModelsToMenuScene();
  const { spawnPoints } = await addModelsToMainScene();

  /*
    Character and Animations
  */
  setLoadingStatus("Create characters");
  const characterBase = await createMultiplayerCharacterBase();

  /*
    Enemies
  */
  const enemies = window.enemies = [];

  // Create test enemy
  setLoadingStatus("Create test enemy");
  const enemy = createTestEnemy();
  enemies.push(enemy);

  /*
    Sound
  */
  setLoadingStatus("Init some sounds");
  const audioContext = audioHandler.getAudioContext();

  const hitSoundPlayer = new Audio("../assets/sound/hit.mp3");
  audioHandler.connect(audioContext.createMediaElementSource(hitSoundPlayer));

  const killSoundPlayer = new Audio("../assets/sound/kill.wav");
  audioHandler.connect(audioContext.createMediaElementSource(killSoundPlayer));

  /*
    Misc. setup
  */
  const connected = await setupWebsocket();
  if (!connected) {
    return;
  }

  syncedClock.sync();

  SetupEvents();

  setLoadingStatus("Applying user settings");
  applySettings();

  window.scene = scene;
  window.physicsEngine = physicsEngine;
  window.mainCamera = mainCamera;
  window.defaultFov = defaultFov;
  window.Quaternion = Quaternion;
  window.Vector = Vector;
  window.Matrix = Matrix;
  window.player = player;
  window.createInspector = () => createInspector(renderer);

  scene.root.traverse(function(gameObject) {
    if (gameObject.meshRenderer && gameObject.meshRenderer.skin) {
      gameObject.meshRenderer.skin.updateMatrixTexture();
    }
  });

  hideElement(loadingScreen);
  showElement(lobbyUI);
  running = true;
  setLoadingStatus("Done");

  renderer.on("renderloop", renderloop);

  function renderloop(frameTime, timeSinceStart, frameNumber) {
    wsSendTime += frameTime;
    if (wsSendTime > 1 / SERVER_SEND_FPS) {
      wsSendTime %= 1 / SERVER_SEND_FPS;
      websocketTick();
    }

    time = timeSinceStart;
    // counters = {};

    fpsHistory[frameNumber % 20] = 1 / frameTime;

    // Lag
    if (renderer.getKey(81)) {
      var x = 0;
      for (var i = 0; i < 3e7; i++) {
        x += i * i;
      }
      x;
    }

    // if (renderer.getKeyDown(116) && player.isPlaying) {
    //   player.die();
    //   setTimeout(() => {
    //     player.gotoLobby();
    //   }, 3000);
    // }
  
    // var x = gamepadManager.getAxis("RSHorizontal");
    // var y = gamepadManager.getAxis("RSVertical");
    // x = (Math.abs(x) > 0.08 ? x : 0);
    // y = (Math.abs(y) > 0.08 ? y : 0);
  
    // var currentWeapon = player.getCurrentWeapon();
    // var weaponSens = currentWeapon ? currentWeapon.getCurrentSensitivity() : 1;
    // player.rotation.x += Math.abs(y) * y * 0.07 * weaponSens;
    // player.rotation.y += Math.abs(x) * x * 0.07 * weaponSens;

    // enemies[0].gameObject.transform.position.x = Math.sin(timeSinceStart / 2) * 5;
    // enemies[0].gameObject.animationController.weightsHandler.x = Math.cos(timeSinceStart / 2);

    for (const enemy of enemies) {
      enemy.update(frameNumber);
    }

    if (car && renderer.getKeyDown(70) && Vector.distance(car.rb.position, player.position) < 3.5) {
      if (car.canMove) {
        car.canMove = false;
        player.canMove = true;
      }
      else {
        car.canMove = true;
        player.canMove = false;
      }
    }

    // if (renderer.getActiveScene() == scene) {
    physicsEngine.update();
    // }
    if (car) car.update(frameTime);

    // for (var key in multiplayerCharacters) {
    //   multiplayerCharacters[key].update(physicsEngine.dt);
    // }

    // player.update(frameTime);
    // flyCamera(renderer, mainCamera, player.rotation, physicsEngine.dt);
    // mainCamera.transform.rotation = Quaternion.eulerVector(player.rotation);
    // player.position = Vector.add(Vector.compMultiply(mainCamera.transform.position, {x: 1, y: 1, z: 1}), {x: 0, y: -(player.height - 0.1), z: 0});

    // // Create trail
    // let trailSpeed = 100;
    // var trailPos = new Vector(0, 2, 0);
    // var trailVel = Vector.multiply(new Vector(1, 0, 0), trailSpeed);
    // var trail = new BulletTrail(trailPos, trailVel, new Vector(1, 0, 0));
    // bulletTrails.push(trail);

    // scene.update(frameTime);
    captureZoneManager.update(frameTime);
    updateBulletTrails(physicsEngine.dt);
    killfeed.update(frameTime);
    crosshair.spacing = 4;// clamp(Vector.length(player.velocity) * 10, 25, 80);
  
    if (player.getCurrentWeapon()?.weaponObject?.getChild("MuzzleOffset", true)) {
      var m = Matrix.copy(player.getCurrentWeapon().weaponObject.getChild("MuzzleOffset", true).transform.worldMatrix);
      muzzleFlashObject.transform.matrix = m;

      // if (player.getCurrentWeapon()?.weaponObject?.getChild("LeftHandOffset", true)) {
      //   leftArm.endObject.transform.worldMatrix = Matrix.translate(Matrix.getPosition(player.getCurrentWeapon().weaponObject.getChild("LeftHandOffset", true).transform.worldMatrix));
      //   rightArm.endObject.transform.worldMatrix = Matrix.translate(Matrix.getPosition(player.getCurrentWeapon().weaponObject.getChild("RightHandOffset", true).transform.worldMatrix));
      // }
    }

    if (window.muzzleFlashEnabled) {
      muzzleFlash.emit(5);
      window.muzzleFlashEnabled = false;
    }

    renderer.update(frameTime);

    if (player.state == player.STATES.PLAYING) {
      renderer.render(mainCamera, [weaponCamera]);
    }
    else if (player.state == player.STATES.DEAD) {
      renderer.render(mainCamera);
    }
    else if (player.state == player.STATES.IN_LOBBY) {
      renderer.render(lobbyCamera.camera, null, { shadows: false });
    }
    // renderer.render(orbitCamera.camera);
    // renderer.render(debugFlyCamera.camera);

    renderUI(frameTime);
  
    // stats.update();
  }







  async function createWeaponInspectCanvas() {
    const canvas = document.querySelector("#weaponInspector");
    canvas.style.pointerEvents = "all";

    const renderer = window.renderer = new Renderer({
      canvas,
      width: 700,
      height: 700,
      version: 2,
      clearColor: [0, 0, 0, 0],
      renderScale: 1,
      path: "../",
      renderpipeline: ENUMS.RENDERPIPELINE.FORWARD,
    });
    const resize = () => {
      canvas.style.width = "100%";
      canvas.style.height = "100%";
    };
    resize();
    renderer.on("resize", resize);

    const pp = renderer.postprocessing;
    // pp.addEffect(new Bloom());
    pp.addEffect(new Tonemapper()).exposure = -0.5;
    pp.addEffect(new FXAA());

    const scene = renderer.add(new Scene());
    await scene.loadEnvironment({ hdrFolder: "../assets/hdri/kloofendal_48d_partly_cloudy_puresky_1k_precomputed" });
    scene.skyboxVisible = false;
    scene.enableShadows = false;

    const initalRotation = new Vector(-0.2, -Math.PI * 0.65, 0);

    showElement(lobbyUI);
    const camera = new OrbitCamera(renderer, {
      fov: 10,
    }, {
      distance: 2,
      rotation: Vector.copy(initalRotation),
      translate: false,
      scale: false,
    });
    hideElement(lobbyUI);
    
    const getAABB = (gameObject) => {
      const aabb = new AABB();

      const recursiveSearch = (gameObject) => {
        if (gameObject.meshRenderer) {
          aabb.extend(gameObject.meshRenderer.getAABB());
        }

        for (const child of gameObject.children) {
          recursiveSearch(child);
        }
      };

      recursiveSearch(gameObject);

      return aabb;
    };

    const weaponModels = {
      AK12: renderer.BatchGameObject(await renderer.loadGLTF("../assets/models/weapons/AK12.glb")),
      Sniper: renderer.BatchGameObject(await renderer.loadGLTF("../assets/models/weapons/sniperLowpoly.glb")),
      Shotgun: renderer.BatchGameObject(await renderer.loadGLTF("../assets/models/weapons/shotgun.glb")),
      Glock: renderer.BatchGameObject(await renderer.loadGLTF("../assets/models/weapons/glock.glb")),
    };

    for (const key in weaponModels) {
      const gameObject = weaponModels[key];

      // Center model
      const aabb = getAABB(gameObject);
      gameObject.transform.position = Vector.negate(aabb.getCenter());

      // Scale to fit
      const size = aabb.getSize();
      const biggestSize = Math.max(size.x, size.y, size.z);
      const targetSize = 1;

      gameObject.transform.scale = Vector.fill(targetSize / biggestSize);
    }

    let lastWeapon = null;

    const switchWeapon = (name) => {
      const gameObject = weaponModels[name];

      if (!gameObject) {
        return;
      }

      if (lastWeapon) {
        lastWeapon.setParent(null);
      }

      scene.add(gameObject);
      lastWeapon = gameObject;

      camera.rotation = Vector.copy(initalRotation);
    };

    renderer.on("renderloop", (frameTime) => {
      renderer.update(frameTime);
      renderer.render(camera.camera);
    });


    window.createInspectorW = () => createInspector(renderer);
    
    return {
      switchWeapon
    };
  }

  function createTestEnemy() {
    const enemy = new Enemy(scene.add(characterBase.copy()));
    enemy.health = Infinity;
  
    const soldier = enemy.gameObject;
  
    const rightArm = soldier.addComponent(new IK([
      soldier.getChild("mixamorig:RightArm", true),
      soldier.getChild("mixamorig:RightForeArm", true),
      soldier.getChild("mixamorig:RightHand", true)
    ], 1));
    rightArm.controlAngle = -Math.PI * 0.25;
  
    const leftArm = soldier.addComponent(new IK([
      soldier.getChild("mixamorig:LeftArm", true),
      soldier.getChild("mixamorig:LeftForeArm", true),
      soldier.getChild("mixamorig:LeftHand", true)
    ], -1));
    leftArm.controlAngle = Math.PI * 1.25;
  
    // Attach to shoulders
    const leftShoulder = soldier.getChild("mixamorig:LeftShoulder", true);
    leftArm.startObject.setParent(leftShoulder);
    leftArm.startObject.transform.position = soldier.getChild("mixamorig:LeftArm", true).transform.position;
  
    const rightShoulder = soldier.getChild("mixamorig:RightShoulder", true);
    rightArm.startObject.setParent(rightShoulder);
    rightArm.startObject.transform.position = soldier.getChild("mixamorig:RightArm", true).transform.position;

    const headBone = soldier.getChild("mixamorig:Head", true);
    const gun = weaponModels.sniper.copy();
    gun.setLayer(0b1, true);
    gun.visible = true;
    gun.setParent(headBone);
    gun.transform.matrix = Matrix.identity();
    gun.transform.position = new Vector(0, 3, 27);
    gun.transform.rotation = Quaternion.euler(0, Math.PI, 0);
    gun.transform.worldScale = Vector.fill(1);

    const leftHandTarget = gun.getChild("LeftHandOffset", true);
    const rightHandTarget = gun.getChild("RightHandOffset", true);

    if (leftHandTarget) {
      const m = Matrix.identity();
      Matrix.applyRotationX(Math.PI, m);

      const isVerticalGrip = leftHandTarget.customData.handGripType == 1;
      if (isVerticalGrip) {
        Matrix.applyRotationX(Math.PI / 2, m);
        Matrix.applyRotationZ(Math.PI / 2, m);
      }
      else {
        Matrix.applyRotationX(Math.PI * 0.1, m);
        Matrix.applyRotationY(-Math.PI * 0.15, m);
      }

      const handBone = leftArm.bones[2];
      const holdOffsetObject = handBone.getChild(/HoldOffset/, true);
      if (holdOffsetObject) {
        const holdOffset = Matrix.inverse(holdOffsetObject.transform.getWorldMatrix(handBone));
        Matrix.multiply(m, holdOffset, m);
      }

      leftArm.endObject.setParent(leftHandTarget);
      leftArm.endObject.transform.matrix = m;
    }

    if (rightHandTarget) {
      const m = Matrix.identity();
      Matrix.applyRotationX(Math.PI, m);

      const isVerticalGrip = rightHandTarget.customData.handGripType == 1;
      if (isVerticalGrip) {
        Matrix.applyRotationX(Math.PI / 2, m);
        Matrix.applyRotationZ(-Math.PI / 2, m);
      }
      else {
        Matrix.applyRotationX(Math.PI * 0.1, m);
        Matrix.applyRotationY(-Math.PI * 0.15, m);
      }

      const handBone = rightArm.bones[2];
      const holdOffsetObject = handBone.getChild(/HoldOffset/, true);
      if (holdOffsetObject) {
        const holdOffset = Matrix.inverse(holdOffsetObject.transform.getWorldMatrix(handBone));
        Matrix.multiply(m, holdOffset, m);
      }

      rightArm.endObject.setParent(rightHandTarget);
      rightArm.endObject.transform.matrix = m;
    }

    return enemy;
  }

  function createMultiplayerCharacter(entity) {
    const gameObject = scene.add(characterBase.copy());

    gameObject.addComponent(new (function() {
      this.update = function(dt) {
        found.update(dt);
      };
    }));

    const rightArm = gameObject.addComponent(new IK([
      gameObject.getChild("mixamorig:RightArm", true),
      gameObject.getChild("mixamorig:RightForeArm", true),
      gameObject.getChild("mixamorig:RightHand", true)
    ], 1));
    rightArm.controlAngle = -Math.PI * 0.25;

    const leftArm = gameObject.addComponent(new IK([
      gameObject.getChild("mixamorig:LeftArm", true),
      gameObject.getChild("mixamorig:LeftForeArm", true),
      gameObject.getChild("mixamorig:LeftHand", true)
    ], -1));
    leftArm.controlAngle = Math.PI * 1.25;

    // Attach to shoulders
    const leftShoulder = gameObject.getChild("mixamorig:LeftShoulder", true);
    leftArm.startObject.setParent(leftShoulder);
    leftArm.startObject.transform.position = gameObject.getChild("mixamorig:LeftArm", true).transform.position;

    const rightShoulder = gameObject.getChild("mixamorig:RightShoulder", true);
    rightArm.startObject.setParent(rightShoulder);
    rightArm.startObject.transform.position = gameObject.getChild("mixamorig:RightArm", true).transform.position;

    const found = new MultiplayerCharacter(gameObject);
    multiplayerCharacters[entity.id] = found;

    found.id = entity.id;
    found.name = entity.name;
    found.rightArm = rightArm;
    found.leftArm = leftArm;

    const enemy = new Enemy(gameObject, found.name);
    enemy.onDeath = (isHeadshot) => {
      sendMessage("killPlayer", {
        clientID: found.id,
        killEffects: {
          isHeadshot,
        },
      });
    };
    enemy.onDamage = (damage) => {
      sendMessage("playerAction", {
        action: "takeDamage",
        targetClientId: found.id,
        damage,
        position: player.position,
      });
    };
    found.enemy = enemy;
    enemy.multiplayerCharacter = found;
    enemies.push(enemy);

    found.leaderboardEntry = leaderboard.addPlayer();
    leaderboard.setItem(found.leaderboardEntry, ".name", found.name);

    // Animation throttle
    const updateRate = 2;

    enemy.updateRate = updateRate;
    enemy.updateOffset = enemies.length % enemy.updateRate;

    gameObject.animationController.updateRate = updateRate;
    gameObject.animationController.updateOffset = updateOffset;

    gameObject.traverse((gameObject) => {
      if (gameObject.meshRenderer instanceof Renderer.SkinnedMeshRenderer) {
        const skin = gameObject.meshRenderer.skin;
        skin.updateRate = updateRate;
        skin.updateOffset = updateOffset;
      }
    });

    leftArm.updateRate = updateRate;
    leftArm.updateOffset = updateOffset;

    rightArm.updateRate = updateRate;
    rightArm.updateOffset = updateOffset;

    updateOffset++;
    updateOffset %= gameObject.animationController.updateRate;

    return found;
  }

  async function createMultiplayerCharacterBase() {
    const characterModel = (await renderer.loadGLTF("../assets/models/running/fixedSkinWithColliders.glb"));
    characterModel.transform.scale = Vector.fill(1.17);
  
    const idle = await renderer.loadGLTF("../assets/models/running/rifleIdle.glb");
    const crouchIdle = await renderer.loadGLTF("../assets/models/running/crouchIdle.glb");
    const crouchWalk = await renderer.loadGLTF("../assets/models/running/crouchWalk.glb");
    const forward = await renderer.loadGLTF("../assets/models/running/forward.glb");
    const backward = await renderer.loadGLTF("../assets/models/running/forward.glb");
    const left = await renderer.loadGLTF("../assets/models/running/left.glb");
    const right = await renderer.loadGLTF("../assets/models/running/right.glb");
    const jump = await renderer.loadGLTF("../assets/models/running/jump.glb");
  
    const idleAnimation = idle.animationController.animations[0];
    const crouchIdleAnimation = crouchIdle.animationController.animations[0];
    const crouchWalkAnimation = crouchWalk.animationController.animations[0];
    const forwardAnimation = forward.animationController.animations[0];
    const backwardAnimation = backward.animationController.animations[0];
    const leftAnimation = left.animationController.animations[0];
    const rightAnimation = right.animationController.animations[0];
    const jumpAnimation = jump.animationController.animations[0];
  
    idleAnimation.transfer(idle, characterModel);
    crouchIdleAnimation.transfer(crouchIdle, characterModel);
    crouchWalkAnimation.transfer(crouchWalk, characterModel);
    forwardAnimation.transfer(forward, characterModel);
    backwardAnimation.transfer(backward, characterModel);
    leftAnimation.transfer(left, characterModel);
    rightAnimation.transfer(right, characterModel);
    jumpAnimation.transfer(jump, characterModel);
  
    backwardAnimation.speed = -1;
    jumpAnimation.speed = 0.25;
  
    const ac = characterModel.animationController = new AnimationController();
    ac.speed = 1.5;
    ac.animations = [
      idleAnimation,
      crouchIdleAnimation,
      crouchWalkAnimation,
      forwardAnimation,
      backwardAnimation,
      leftAnimation,
      rightAnimation,
      jumpAnimation,
    ];
    ac.loop = true;
    ac.weightsHandler = new AnimationBlend([
      {
        animation: idleAnimation,
        coords: new Vector(0, 0, 0)
      },
      {
        animation: crouchIdleAnimation,
        coords: new Vector(0, 0, -1)
      },
      {
        animation: jumpAnimation,
        coords: new Vector(0, 0, 1)
      },
      {
        animation: jumpAnimation,
        coords: new Vector(1, 0, 1)
      },
      {
        animation: jumpAnimation,
        coords: new Vector(-1, 0, 1)
      },
      {
        animation: jumpAnimation,
        coords: new Vector(0, 1, 1)
      },
      {
        animation: jumpAnimation,
        coords: new Vector(0, -1, 1)
      },
      {
        animation: leftAnimation,
        coords: new Vector(1, 0, 0)
      },
      {
        animation: rightAnimation,
        coords: new Vector(-1, 0, 0)
      },
      {
        animation: forwardAnimation,
        coords: new Vector(0, 1, 0)
      },
      {
        animation: backwardAnimation,
        coords: new Vector(0, -1, 0)
      },
      {
        animation: crouchWalkAnimation,
        coords: new Vector(0, 1, -1)
      },
      {
        animation: crouchWalkAnimation,
        coords: new Vector(0, -1, -1)
      },
      {
        animation: crouchWalkAnimation,
        coords: new Vector(1, 0, -1)
      },
      {
        animation: crouchWalkAnimation,
        coords: new Vector(-1, 0, -1)
      }
    ]);

    return characterModel;
  }

  async function createPlayerArms() {
    const playerArms = scene.add(await renderer.loadGLTF("../assets/models/running/arms.glb"));
  
    // Hide colliders
    playerArms.getChildren("Collider", true, false).forEach(o => o.visible = false);
    playerArms.visible = true;

    // Same layer as weapons
    playerArms.setLayer(0b10, true);

    playerArms.castShadows = false;

    const rightArm = playerArms.addComponent(new IK([
      playerArms.getChild("mixamorig:RightArm", true),
      playerArms.getChild("mixamorig:RightForeArm", true),
      playerArms.getChild("mixamorig:RightHand", true)
    ], 1));
    rightArm.controlAngle = -Math.PI * 0.25;

    const leftArm = playerArms.addComponent(new IK([
      playerArms.getChild("mixamorig:LeftArm", true),
      playerArms.getChild("mixamorig:LeftForeArm", true),
      playerArms.getChild("mixamorig:LeftHand", true)
    ], -1));
    leftArm.controlAngle = Math.PI * 1.25;

    // Attach to shoulders
    const leftShoulder = playerArms.getChild("mixamorig:LeftShoulder", true);
    leftArm.startObject.setParent(leftShoulder);
    leftArm.startObject.transform.position = playerArms.getChild("mixamorig:LeftArm", true).transform.position;

    const rightShoulder = playerArms.getChild("mixamorig:RightShoulder", true);
    rightArm.startObject.setParent(rightShoulder);
    rightArm.startObject.transform.position = playerArms.getChild("mixamorig:RightArm", true).transform.position;

    return {
      gameObject: playerArms,
      leftArmIK: leftArm,
      rightArmIK: rightArm,
    };
  }

  async function addModelsToMainScene() {
    const mapPath = "../assets/models/maps/beta/model.glb";
    const colliderPath = "../assets/models/maps/beta/model.glb";

    // const mapPath = "../assets/models/checkerPlaneBig.glb";
    // const colliderPath = "../assets/models/checkerPlaneBig.glb";
  
    // var mapPath = "../assets/models/maps/dust2/dust2.glb";
    // var colliderPath = "../assets/models/maps/dust2/dust2.glb";
  
    // var map = scene.add(await renderer.loadGLTF("../assets/models/city/model.glb"));
    // var mapCollider = await renderer.loadGLTF("../assets/models/city/collider.glb");

    // var map = scene.add(await renderer.loadGLTF("../assets/models/test/playerArea.glb"));
    // var mapCollider = await renderer.loadGLTF("../assets/models/test/playerArea.glb");

    const map = await renderer.loadGLTF(mapPath, { loadMaterials: true, maxTextureSize: 1024 });
    map.getChildren("Invisible", true, false).forEach(c => c.visible = false);
    scene.add(renderer.BatchGameObject(map));
  
    map.getChildrenWithCustomData("foliage").forEach(o => {
      o.meshRenderer.materials[0] = foliageMaterial;
    });
  
    // var water = renderer.CreateShape("plane", waterMaterial);
    // // water.transform.position.y = -20;
    // // water.transform.scale = Vector.fill(5000);
    // // water.transform.rotation = Quaternion.euler(-Math.PI / 2, 0, 0);
    // scene.add(water);
  
    // var oilrig = await renderer.loadGLTF("../assets/models/maps/oilrig/oilrig.glb");
    // scene.add(oilrig);

    const mapCollider = scene.add(await renderer.loadGLTF(colliderPath, { loadMaterials: false, loadNormals: false, loadTangents: false }));
    mapCollider.visible = false;
    mapCollider.children[0].addComponent(new MeshCollider());
    // mapCollider.addComponent(new MeshCollider());
    mapCollider.getChildren("Invisible", true, false).forEach(c => c._colliderLayer = 0b10);

    physicsEngine.addMeshCollider(mapCollider);
    physicsEngine.setupMeshCollider();
    // physicsEngine.octree.render(scene);

    const spawnPoints = [];
    const spawnPointsObj = map.getChild("SpawnPoints", true);
    if (spawnPointsObj) {
      for (const child of spawnPointsObj.children) {
        spawnPoints.push(child.transform.worldPosition);
      }
    }
    else {
      spawnPoints.push(Vector.zero());
    }

    return {
      spawnPoints
    };

    // var terrain = scene.add(new GameObject("Terrain"));
    // var chunkSize = 100;
    // var chunkRes = 100;
    // var material = renderer.CreateLitMaterial();
    // material.setUniform("albedo", [0.2, 0.7, 0.1, 1]);
    // terrain.meshRenderer = new renderer.MeshRenderer(material, createTerrainData(chunkSize, chunkSize, chunkRes, 30, Vector.zero(), 0.01, 600));

    // physicsEngine = new PhysicsEngine(scene);
    // physicsEngine.addMeshCollider(terrain);
    // physicsEngine.setupMeshCollider();

    // console.time("addMeshToOctree");
    // window.AABBToTriangleCalls = 0;
    // physicsEngine.addMeshToOctree(mapCollider);
    // console.log("Calls:", window.AABBToTriangleCalls);
    // console.timeEnd("addMeshToOctree");
    // physicsEngine.octree.render(scene);

    // // King of the hill zone
    // var hill = await CreateCaptureZone(Vector.zero());
    // captureZoneManager.add(hill);

    // // Loadout light
    // var lightObject = scene.add(new GameObject("Light"));
    // lightObject.transform.position = new Vector(1, 0.1, 1);
    // var light = lightObject.addComponent(new Light());
    // light.color = [50, 34, 20];

    // IK test
    // const soldier = scene.add(await renderer.loadGLTF(renderer.path + "assets/models/running/fixedSkinWithCollidersAndAnimation.glb", { disableAnimations: true }));
    // soldier.transform.scale = Vector.fill(1.17);

    // soldier.getChildren("Collider", true, false).forEach(o => o.visible = false);
    // soldier.visible = true;

    // const handBone = soldier.getChild("mixamorig:RightHand", true);
    // const gun = weaponModels.sniper.copy();
    // gun.setLayer(0b1, true);
    // gun.visible = true;
    // gun.setParent(handBone);
    // gun.transform.position = Vector.zero();
    // gun.transform.rotation = Quaternion.euler(Math.PI / 2, 0, Math.PI / 2);
    // gun.transform.scale = Vector.fill(40);

    // const rightArm = soldier.addComponent(new IK([
    //   soldier.getChild("mixamorig:RightArm", true),
    //   soldier.getChild("mixamorig:RightForeArm", true),
    //   soldier.getChild("mixamorig:RightHand", true)
    // ], 1));
    // rightArm.controlAngle = -Math.PI * 0.25;

    // const leftArm = soldier.addComponent(new IK([
    //   soldier.getChild("mixamorig:LeftArm", true),
    //   soldier.getChild("mixamorig:LeftForeArm", true),
    //   soldier.getChild("mixamorig:LeftHand", true)
    // ], -1));
    // leftArm.controlAngle = Math.PI * 1.25;

    // // for (const bone of rightArm.bones) {
    // //   renderer.gizmos.visualize(bone);
    // // }
    // // for (const bone of leftArm.bones) {
    // //   renderer.gizmos.visualize(bone);
    // // }

    // // Connect left and right hand
    // leftArm.endObject.setParent(rightArm.endObject);
    // leftArm.endObject.transform.matrix = Matrix.identity();
    // leftArm.endObject.transform.position.z += 0.15;
    // // leftArm.endObject.transform.position.y += 2;

    // // Reach infront of body
    // rightArm.endObject.transform.position.x += 0.6;
    // rightArm.endObject.transform.position.y -= 0.1;
    // rightArm.endObject.transform.position.z += 0.3;

    // var startY = rightArm.endObject.transform.position.y;

    // console.log(rightArm.endObject.transform.position, leftArm.endObject.transform.position)

    // setInterval(function() {
    //   var trailPos = Vector.add(Matrix.getPosition(soldier.transform.worldMatrix), new Vector(0, 1.5, 0));
    //   var direction = Vector.negate(Matrix.getForward(soldier.transform.worldMatrix));
    //   var trailVel = Vector.multiply(direction, 50);
    //   var trail = new BulletTrail(trailPos, trailVel, direction);
    //   bulletTrails.push(trail);
    // }, 1000 / 6);




    // Parallax mapping
    // var s = await renderer.loadGLTF("../assets/models/ironPlane.glb");

    // var mat = s.children[0].meshRenderer.materials[0];
    // mat.textures.push(renderer.loadTexture("../assets/textures/rustyIron/heightmap.png"));
    // mat.createUniform("heightmapTexture", "1i", [mat.textures.length - 1]);
    // mat.setProgram(litParallax);

    // s.transform.rotation = Quaternion.eulerVector(new Vector(0, Math.PI, 0));
    // s.transform.position = new Vector(4, 1, 0);
    // scene.add(s);

    // Rigidbody sphere
    // var ball = (await CreateGameObjectFromGLTF("../assets/models/primitives/uvSphere.glb"))[0];
    // ball.children[0].meshRenderer.materials[0].uniforms.find((u) => u.name == "albedo").arguments = [1, 1, 1];
    // ball.children[0].meshRenderer.materials[0].uniforms.find((u) => u.name == "roughness").arguments[0] = 0.01;
    // ball.children[0].meshRenderer.materials[0].uniforms.find((u) => u.name == "metallic").arguments[0] = 0.99;
    // // ball.position = new Vector(0, 3, 0);
    // ball.addComponent(new Rigidbody());
    // ball.findComponents("Rigidbody")[0].position = new Vector(0, 5, 5.5);
    // scene.add(ball);

    // Vegetation
    // var bush = scene.add(await renderer.loadGLTF("../assets/models/bush.glb"));
    // bush.transform.position.x = 10;
    // bush.transform.scale = Vector.fill(1.3);
    // bush.children[0].meshRenderer.materials[0] = foliageMat;

    // var tree = scene.add(await renderer.loadGLTF("../assets/models/tree.glb"));
    // tree.transform.position = new Vector(17, 0, 3);
    // tree.children[0].children[0].meshRenderer.materials[0] = tree.children[0].children[1].meshRenderer.materials[0] = foliageMat;

    // for (var i = 0; i < 4; i++) {
    //   var hedge = scene.add(await renderer.loadGLTF("../assets/models/hedge.glb"));
    //   hedge.transform.position = new Vector(0, 0, -i * 4);
    //   hedge.transform.rotation = Quaternion.euler(0, i * Math.PI / 2, 0);
    //   hedge.children[0].meshRenderer.materials[0] = foliageMat;
    // }

    // Broken plaster
    var brokenPlasterObjects = map.getChildrenWithCustomData("brokenPlaster");
    if (brokenPlasterObjects) {
      const plasterMaterial = await createBrokenPlasterMaterial();

      // var cube = scene.add(await renderer.loadGLTF("../assets/models/maps/1/brokenPlasterPillar.glb"));
      // cube.transform.position.z -= 3.4;
      // cube.children[0].meshRenderer.materials[0] = plasterMaterial;

      for (var obj of brokenPlasterObjects) {
        obj.meshRenderer.materials[0] = plasterMaterial;
      }
    }

    // Metal plane
    // var albedo = renderer.loadTexture("../assets/textures/MetalPanelRectangular001/METALNESS/1K/MetalPanelRectangular001_COL_1K_METALNESS.jpg", {internalFormat: renderer.gl.SRGB8_ALPHA8});
    // var normal = renderer.loadTexture("../assets/textures/MetalPanelRectangular001/METALNESS/1K/MetalPanelRectangular001_NRM_1K_METALNESS.jpg");
    // var metalRoughness = renderer.loadMetalRoughness("../assets/textures/MetalPanelRectangular001/METALNESS/1K/MetalPanelRectangular001_METALNESS_1K_METALNESS.jpg", "../assets/textures/MetalPanelRectangular001/METALNESS/1K/MetalPanelRectangular001_ROUGHNESS_1K_METALNESS.jpg");
    
    // var material = renderer.CreateLitMaterial({
    //   albedoTexture: albedo,
    //   normalTexture: normal,
    //   metallicRoughnessTexture: metalRoughness
    // });
    // var meshData = new renderer.MeshData(renderer.getPlaneData());
    // var meshRenderer = new renderer.MeshRenderer(material, meshData);
    
    // var gameObject = new GameObject();
    // gameObject.transform.rotation = Quaternion.eulerVector(new Vector(-Math.PI / 2, 0, 0));
    // gameObject.meshRenderer = meshRenderer;
    // scene.add(gameObject);
    // physicsEngine.addMeshToOctree(gameObject);

    // Reflection probe
    // var cubemap = renderer.captureReflectionCubemap(new Vector(0, 4, 0));
    // window.reflectionCubemap = cubemap;
    // var mat = new NewMaterial(await renderer.createProgramFromFile("../assets/shaders/cubemapVis"), [
    //   {type: "1i", name: "cubemap", arguments: [0]}
    // ], [{type: renderer.gl.TEXTURE_CUBE_MAP, texture: cubemap}]);

    // var cube = new GameObject("Cubemap", {
    //   meshRenderer: new renderer.MeshRenderer(mat, new renderer.MeshData(renderer.getCubeData())),
    //   castShadows: false
    // });
    // cube.scale = Vector.fill(3);
    // cube.position = new Vector(0, 4, 0);
    // scene.add(cube);

    // const cube = scene.add(renderer.CreateShape("cube"));
    // const rb = cube.addComponent(new Rigidbody());
    // cube.addComponent(new BoxCollider());

    // rb.position.y = 5;
    // rb.position.x = 5;

    // setInterval(() => {
    //   if (rb.position.y < -5) {
    //     rb.position.y = 5;
    //     rb.velocity = Vector.zero();
    //   }
    // }, 100);
  }

  async function addModelsToMenuScene() {
    menuScene.add(await renderer.loadGLTF(renderer.path + "assets/models/maps/menu/model.glb"));

    const lobbyCharacter = menuScene.add(await renderer.loadGLTF("lobbyCharacter.glb"));
    lobbyCharacter.animationController.loop = true;
    lobbyCharacter.animationController.play();
  
    // var hedge = menuScene.add(await renderer.loadGLTF("../assets/models/hedge.glb"));
    // hedge.transform.rotation = Quaternion.euler(0, Math.PI / 2, 0);
    // hedge.transform.position.z = -3;
    // hedge.children[0].meshRenderer.materials[0] = foliageMat;
  
    // menuScene.add(await renderer.loadGLTF("../assets/models/DamagedHelmet.glb"));
  }

  async function createBrokenPlasterMaterial() {
    const brokenPlasterProgram = new renderer.CustomProgram(brokenPlasterSource); // new renderer.ProgramContainer(renderer.createProgram(brokenPlasterSource.webgl2.vertex, brokenPlasterSource.webgl2.fragment));

    const gl = renderer.gl;
    const sRGBInternalFormat = renderer.version == 1 ? (renderer.sRGBExt && (renderer.floatTextures || renderer.textureHalfFloatExt) ? renderer.sRGBExt.SRGB_ALPHA_EXT : gl.RGBA) : gl.SRGB8_ALPHA8;
    const sRGBFormat = renderer.version == 1 ? (renderer.sRGBExt && (renderer.floatTextures || renderer.textureHalfFloatExt) ? renderer.sRGBExt.SRGB_ALPHA_EXT : gl.RGBA) : gl.RGBA;
    
    const plasterAlbedo = await renderer.loadTextureAsync("../assets/textures/plaster17/Plaster17_COL_VAR2_3K.jpg", {maxTextureSize: 256, internalFormat: sRGBInternalFormat, format: sRGBFormat});
    const plasterNormal = await renderer.loadTextureAsync("../assets/textures/plaster17/Plaster17_NRM_3K.jpg", {maxTextureSize: 256});

    const brickAlbedo = await renderer.loadTextureAsync("../assets/textures/bricks01/Bricks01_COL_VAR1_3K.jpg", {maxTextureSize: 256, internalFormat: sRGBInternalFormat, format: sRGBFormat});
    const brickNormal = await renderer.loadTextureAsync("../assets/textures/bricks01/Bricks01_NRM_3K.jpg", {maxTextureSize: 256});

    const plasterMat = renderer.CreateLitMaterial({}, brokenPlasterProgram);
    // plasterMat.setUniform("roughness", 1);
    plasterMat.setUniform("albedoTextures[0]", [ plasterAlbedo, brickAlbedo ]);
    plasterMat.setUniform("normalTextures[0]", [ plasterNormal, brickNormal ]);

    return plasterMat;
  }

  async function createWaterMaterial() {
    const waterProgram = new renderer.CustomProgram(waterSource);// new renderer.ProgramContainer(await renderer.createProgram(waterSource.webgl2.vertex, waterSource.webgl2.fragment));

    const waterNormal = renderer.loadTexture(renderer.path + "assets/textures/waternormals.jpg");

    const waterMaterial = new renderer.CreateLitMaterial({}, waterProgram);
    waterMaterial.setUniform("albedo", [1, 1, 1, 1]);
    waterMaterial.setUniform("normalTexture", waterNormal);
    waterMaterial.setUniform("uvScale", [100_000, 100_000]);
    window.waterMaterial = waterMaterial;

    // const waterMaterial = new NewMaterial(waterShader);
    // waterMaterial.setUniform("useNormalTexture", 1);
    // waterMaterial.setUniform("normalTexture", waterNormal);
    // waterMaterial.setUniform("uvScale", [20, 20]);
    // waterMaterial.setUniform("sunDirection", [scene.sunDirection.x, scene.sunDirection.y, scene.sunDirection.z]);

    return waterMaterial;
  }

  async function createFoliageMaterial() {
    const foliage = new renderer.ProgramContainer(await renderer.createProgramFromFile(renderer.path + "assets/shaders/custom/webgl2/foliage"));
    const leaves = renderer.loadTexture(renderer.path + "assets/textures/leaves.png");

    const foliageMat = new NewMaterial(foliage);
    foliageMat.doubleSided = true;
    foliageMat.setUniform("useTexture", 1);
    foliageMat.setUniform("albedoTexture", leaves);

    return foliageMat;
  }

  async function createReddotMaterial() {
    const reddotProgram = new renderer.ProgramContainer(await renderer.createProgramFromFile(renderer.path + "assets/shaders/custom/webgl2/reddot"));
    const reddotTexture = renderer.loadTexture(renderer.path + "assets/textures/reddot2.png", { TEXTURE_WRAP_S: renderer.gl.CLAMP_TO_EDGE, TEXTURE_WRAP_T: renderer.gl.CLAMP_TO_EDGE });
  
    const reddotMaterial = new NewMaterial(reddotProgram);
    reddotMaterial.setUniform("albedoTexture", reddotTexture);
    reddotMaterial.setUniform("textureScale", 0.2 * 0.3 * 2);
    reddotMaterial.setUniform("scopeColor", [20, 0.1, 0.1]);
    reddotMaterial.opaque = false;

    return reddotMaterial;
  }

  function setHealth(health) {
    var t = (1 - health) * 100 + "%";
    healthBarReal.style.right = t;
    healthBarAnimation.style.right = t;
  }

  function renderUI(dt) {
    ui.clearScreen();
    sniperScopeEffect.enabled = false;
  
    if (player.state != player.STATES.IN_LOBBY) {
      // Weapon icons
      if (player.state === player.STATES.PLAYING) {
        ui.setTextAlignX("center");
        ui.setTextAlignY("middle");
        ui.fontWeight = "bold";
        ui.setFont("Oswald");

        for (let i = 0; i < player.weapons.length; i++) {
          if (i === player.currentWeapon) {
            continue;
          }

          ui.clippedPicture(`../assets/textures/weaponIcons/${player.weapons[i].name}.png`, 0, 320 / 2 - 320 * 40 / 120 / 2, 320, 320 * 40 / 120, ui.width - 140, ui.height - 100 - i * 50, 120, 40);
        }

        ui.ctx.globalCompositeOperation = "source-in";
        ui.background("rgba(0, 0, 0, 0.25)");
        ui.ctx.globalCompositeOperation = "source-over";

        ui.clippedPicture(
          `../assets/textures/weaponIcons/${player.weapons[player.currentWeapon].name}.png`,
          0, 320 / 2 - 320 * 40 / 120 / 2,
          320, 320 * 40 / 120,
          ui.width - 140, ui.height - 100 - player.currentWeapon * 50,
          120, 40
        );

        for (let i = 0; i < player.weapons.length; i++) {
          const x = ui.width - 155;
          const y = ui.height - 80 - i * 50;
          ui.circle(x, y, 10, "rgba(0, 0, 0, 0.25)");
          ui.text(i + 1, x, y, 12, "white");
        }
      }

      if (player.closestZone) {
        captureZoneManager.renderZoneUI(player.closestZone);
      }
  
      var currentWeapon = player.getCurrentWeapon();
      if (currentWeapon) {
        if (currentWeapon.mode != WEAPONENUMS.GUNMODES.ADS) {
          crosshair.render();
        }
        
        if (currentWeapon.mode == WEAPONENUMS.GUNMODES.ADS && currentWeapon.scope.sniperScope) {
          ui.save();
          ui.background("black");
          ui.ctx.beginPath();
          ui.ctx.arc(ui.width / 2, ui.height / 2, ui.height * 0.45, 0, Math.PI * 2);
          ui.ctx.clip();
          ui.clearScreen();
  
          var middleRadius = ui.height / 7;
          ui.line(ui.width / 2, 0, ui.width / 2, ui.height, "black", 1);
          ui.line(ui.width / 2, 0, ui.width / 2, ui.height / 2 - middleRadius, "black", 6);
          ui.line(ui.width / 2, ui.height, ui.width / 2, ui.height / 2 + middleRadius, "black", 6);
  
          ui.line(0, ui.height / 2, ui.width, ui.height / 2, "black", 1);
          ui.line(0, ui.height / 2, ui.width / 2 - middleRadius, ui.height / 2, "black", 6);
          ui.line(ui.width, ui.height / 2, ui.width / 2 + middleRadius, ui.height / 2, "black", 6);
          ui.restore();
  
          sniperScopeEffect.enabled = true;
        }
  
        if (currentWeapon.roundsInMag <= 0) {
          ammoCounter.querySelector(".current").classList.add("emptyMag");
        }
        else {
          ammoCounter.querySelector(".current").classList.remove("emptyMag");
        }
  
        currentAmmoSpan.textContent = currentWeapon.roundsInMag;
        maxAmmoSpan.textContent = currentWeapon.magSize;
  
        // ammoCounter.innerText = `${currentWeapon.roundsInMag} / ${currentWeapon.magSize}`;
  
        // ui.text(`${currentWeapon.roundsInMag} / ${currentWeapon.magSize}`, 10, ui.height - 10, 60, "white", "black", 1);
      }
  
      hitmarker.render();
      hitDirectionIndicator.render(dt);
      killfeed.render();
    }
  
    if (car && player.state === player.STATES.PLAYING && !car.canMove && Vector.distance(car.rb.position, player.position) < 3.5) {
      ui.picture("../assets/textures/keyIcons/F_Key_Dark.png", ui.width / 2 - 200, ui.height / 2, 50, 50);
      ui.setTextYAlign("middle");
      ui.text("Drive vehicle", ui.width / 2 - 200 + 60, ui.height / 2 + 25, 30, "white", "black");
      ui.resetTextYAlign();
    }
  
    if (car && car.canMove) {
      car.renderUI(ui);
    }
  
    // Stats
    ui.setFont("monospace");
  
    var averageFPS = Math.round(fpsHistory.reduce((a, b) => a + b, 0) / fpsHistory.length);
    var minFPS = 100 - Math.round(Math.min(...fpsHistory) / averageFPS * 100);
    var maxFPS = Math.round(Math.max(...fpsHistory) / averageFPS * 100) - 100;
    ui.text(averageFPS + " FPS", 5, 20, 15, "lime");
    ui.text("-" + minFPS + "%", 75, 20, 15, "lime");
    ui.text("+" + maxFPS + "%", 115, 20, 15, "lime");
  
    var averageLatency = Math.round(latencies.reduce((a, b) => a + (isNaN(b) ? 0 : b), 0) / latencies.length);
    var color = (averageLatency < 50 ? "lime" : averageLatency < 150 ? "yellow" : "red");
    ui.text(averageLatency + "ms", 5, 40, 15, color);
  
    ui.setFont("Arial");
  }

  function getSpawnPoint() {
    return spawnPoints[Math.floor(Math.random() * spawnPoints.length)];
  }
  
  function deploy() {
    lobbyUI.querySelector(".navigation").classList.add("slideOut");
  
    setTimeout(function() {
      if (!wsIsOpen(ws)) {
        player.state = player.STATES.PLAYING;
        player.position = getSpawnPoint();
        return;
      }
  
      sendMessage("deploy", { username: localStorage.getItem(LS_USERNAME) });
    }, 500);
  }

  function Crosshair() {
    this.lineLength = 10;
    this.spacing = 20;
    this.thickness = 2;
    this.color = "white";
    this.backgroundColor = "rgba(0, 0, 0, 0.3)";
    this.type = 0;
    
    this.render = function() {
      if (this.type === 0) {
        this.drawCrosshair(this.backgroundColor, this.thickness);
        this.drawCrosshair(this.color, this.thickness * 0.5);
      }
      else if (this.type == 1) {
        this.shotgunCrosshair(this.backgroundColor, this.thickness);
        this.shotgunCrosshair(this.color, this.thickness - 0.5);
      }
    };
  
    this.drawCrosshair = function(color, thickness) {
      var x = Math.round(ui.width / 2) + 0.5;
      var y = Math.round(ui.height / 2) + 0.5;
  
      ui.line(x, y - this.spacing - this.lineLength, x, y - this.spacing, color, thickness);
      ui.line(x, y + this.spacing + this.lineLength, x, y + this.spacing, color, thickness);
      ui.line(x - this.spacing - this.lineLength, y, x - this.spacing, y, color, thickness);
      ui.line(x + this.spacing + this.lineLength, y, x + this.spacing, y, color, thickness);
      
      // ui.rectangle(Math.round(ui.width / 2) - thickness, Math.round(ui.height / 2) - thickness, thickness * 2, thickness * 2, color);
      ui.circle(x - 0.5, y - 0.5, thickness, color);
    };
  
    this.shotgunCrosshair = function(color, thickness) {
      for (var i = 0; i < 4; i++) {
        ui.ctx.beginPath();
        ui.ctx.arc(ui.width / 2, ui.height / 2, this.spacing, i * Math.PI / 2 - 0.6, i * Math.PI / 2 + 0.6);
        ui.ctx.strokeStyle = color;
        ui.ctx.lineWidth = thickness;
        ui.ctx.stroke();
      }
    };
  }
  
  function Hitmarker() {
    this.size = 8;
    this.spacing = 5;
    this.colors = {
      "body": [255, 255, 255],
      "head": [255, 50, 50]
    };
    this.color = this.colors.body;
    this.timeOffset = time;
  
    this.markHit = function(type, scale = 1) {
      this.color = this.colors[type];
      this.timeOffset = time;
      this.size = scale * 8;
    };
  
    this.render = function() {
      if (time - this.timeOffset < 0.5) {
        var alpha = 1 - Math.pow(Math.cos(clamp(time - this.timeOffset, 0, 1) * Math.PI), 20);
  
        // var alpha = clamp(8 * (this.timeOffset - time + 0.5), 0, 1);
        var spacing = this.spacing + clamp(1 + (this.timeOffset - time) * 10, 0, 1) * 10;
        this.drawHitmarker(spacing, `rgba(0, 0, 0, ${alpha})`, 3);
        this.drawHitmarker(spacing, `rgba(${this.color[0]}, ${this.color[1]}, ${this.color[2]}, ${alpha})`, 2);
      }
    };
  
    this.drawHitmarker = function(spacing, color, lineWidth) {
      for (var i = 0; i < 4; i++) {
        var xDir = Math.floor(i / 2) * 2 - 1;
        var yDir = Math.floor(((i + 1) % 4) / 2) * 2 - 1;
        ui.line(ui.width / 2 + xDir * spacing, ui.height / 2 + yDir * spacing, ui.width / 2 + xDir * (spacing + this.size), ui.height / 2 + yDir * (spacing + this.size), color, lineWidth);
      }
    };
  }
  
  function Enemy(gameObject, name = "Enemy") {
    function Collider(bl, tr, gameObject, type) {
      this.type = type ?? Collider.TYPES.BODY;
      this.gameObject = gameObject;
      this.matrix = Matrix.identity();
      this.aabb = new AABB(bl, tr);
    }
    Collider.TYPES = {
      BODY: "body",
      HEAD: "head",
      ARM: "arm",
      LEG: "leg",
      HAND: "hand",
      FOOT: "foot",
    };
  
    this.gameObject = gameObject;
    this.multiplayerCharacter = null;
    this.colliders = [];
  
    if (this.gameObject) {
      var goColliders = this.gameObject.getChildren("Collider", true, false);
      for (var g of goColliders) {
        if (g === this.gameObject) {
          continue;
        }
  
        const mc = g.addComponent(new MeshCollider(true));
        mc.layer = 0b100;
        mc.octree; // Force build octree before removing mesh
        g.meshRenderer = null; // Remove mesh since not drawing mesh disables collisions
      }
    }
  
    this.dead = false;
    this.maxHealth = 100;
    this.health = this.maxHealth;
    this.name = name;
  
    this.onDeath = () => {};
    this.onDamage = () => {};

    this.updateRate = 5;
    this.updateOffset = 0;
  
    var createBillboard = () => {
      if (this.gameObject) {
        var meshData = renderer.getParticleMeshData();
        meshData.setAttribute("uv", {
          bufferData: new Float32Array([
            1.0, 0.0,
            0.0, 0.0,
            0.0, 1.0,
            1.0, 1.0
          ]),
          size: 2
        });
  
        var material = renderer.CreateLitMaterial({
          opaque: false,
          albedoTexture: createTextTexture(this.name, 256)
        }, renderer.programContainers.billboard);
        material.doubleSided = true;
  
        var meshRenderer = new renderer.MeshRenderer(material, meshData);
        // meshRenderer.addInstance(Matrix.identity());
  
        var billboard = new GameObject("Billboard");
        billboard.meshRenderer = meshRenderer;
        this.gameObject.addChild(billboard);
        billboard.transform.position.y = 2.4;//35;

        this.billboard = billboard;
      }
    };
  
    createBillboard();

    this.update = function(frameNumber) {
      if (!player.isPlaying) {
        return;
      }

      // Only run every n frames
      if (frameNumber % this.updateRate !== this.updateOffset) {
        return;
      }

      if (this.billboard) {
        const origin = Vector.add(this.gameObject.transform.worldPosition, new Vector(0, 1.8, 0));
        const direction = Vector.tangent(origin, mainCamera.transform.worldPosition);
        const hit = physicsEngine.Raycast(origin, direction, null, 0b1);
        const visible = !hit || hit.distance > Vector.distance(origin, mainCamera.transform.worldPosition);
        this.billboard.visible = visible;
      }
    };
  
    this.previewHit = function(weapon, hit) {
      if (this.dead) {
        return;
      }
  
      if (!hit || !hit.hasHit) {
        return;
      }
  
      if (this.gameObject.contains(hit.gameObject)) {
        const isHeadshot = hit.gameObject.name.toLowerCase().indexOf("head") !== -1;

        const damage = weapon.getDamage(hit);
  
        return {
          isHeadshot,
          damage,
          hit,
        };
      }
    };
  
    this.takeDamage = function(amount, isHeadshot = false) {
      if (!this.dead) {
        this.health -= amount;
        this.health = Math.max(0, this.health);

        this.onDamage(amount, this.health);
  
        if (this.health <= 0) {
          this.die(isHeadshot);
        }
      }
    };
  
    this.die = function(isHeadshot = false) {
      this.dead = true;
      this.gameObject.visible = false;
  
      // player.enemyKilled(this);
      this.onDeath(isHeadshot);
    };
  
    this.respawn = function(position) {
      this.dead = false;
      this.health = this.maxHealth;
      this.gameObject.visible = true;
  
      if (position) {
        this.gameObject.transform.position = position;
      }
    };
  }
  
  // function PlayerOld(pos = Vector.zero()) {
  //   this.id = null;
  //   this.name = null;
  
  //   this.rotation = Vector.zero();
  //   this.position = pos;
  //   this.startPosition = pos;
  //   this.velocity = Vector.zero();
  
  //   this.crouching = false;
  //   this.standHeight = 2;
  //   this.crouchHeight = 1.1;
  //   var targetHeight = this.standHeight;
  //   var visualHeight = this.standHeight;
  //   this.height = targetHeight;
  //   this.colliderRadius = 0.5;
  
  //   this.walkSpeed = 5;
  
  //   this.walkAcceleration = 150 * 0.3;
  //   this.runningAcceleration = 225 * 0.3;
  //   this.friction = 10;
  
  //   this.coyoteTime = 0.11;
  //   this.jumpBuffering = 0.08;
  //   this.groundCounter = 0;
  //   this.jumpCounter = 0;
  
  //   this.collisionIterations = 3;
  //   this.grounded = false;
  //   this.fakeGroundNormal = Vector.zero();
  //   this.realGroundNormal = Vector.zero();
  
  //   this.weapons = [];
  //   this.currentWeapon = 0;
  
  //   this.handRotation = this.rotation;
  
  //   this.handOffset = {x: 0.3, y: -0.25, z: -0.5};
  //   this.handRotOffset = {x: 0, y: 0.1 * 0, z: 0};
  
  //   // Head bobbing
  //   this.headBobStrength = 0.06;
  //   this.headBobSpeed = 0.25;
  //   this.walkTime = 0;
  
  //   // Health
  //   this.maxHealth = 100;
  //   var _health = this.maxHealth;
  //   Object.defineProperty(this, "health", {
  //     get: function() {
  //       return _health;
  //     },
  //     set: function(val) {
  //       _health = val;
  //       setHealth(_health / this.maxHealth);
  //     }
  //   });
  
  //   Object.defineProperty(this, "dead", {
  //     get: function() {
  //       return _health <= 0;
  //     }
  //   });
  
  //   this.killedBy = null;
  //   var killcamDir = null;
  
  //   // Kills
  //   this.kills = 0;
  //   this.deaths = 0;
  
  //   this.killStreak = 0;
  //   this.killTimer = 0;
  //   this.streakNames = ["", "Doublekill", "Triplekill", "Quadkill", "Megakill"];
  
  //   var leaderboardEntry = null;
  
  //   // this.getHandMatrix = function(t = 0) {
  //   //   var rot = this.getHeadRotation();
  //   //   var ops = [
  //   //     ["translate", Vector.add(this.position, new Vector(0, this.height - 0.1, 0))],
  //   //     ["rz", -rot.z],
  //   //     ["ry", -rot.y],
  //   //     ["rx", -rot.x],
  //   //     // ["translate", Vector.multiply(this.getCurrentWeapon().weaponObject.children[0].getChild("ADSOffset").position, -1 / 10)],
  //   //     // ["translate", {x: 0, y: 0, z: -0.1}]
  //   //     ["translate", Vector.multiply(this.handOffset, t)],
  //   //     ["rz", this.handRotOffset.z * t],
  //   //     ["ry", this.handRotOffset.y * t],
  //   //     ["rx", this.handRotOffset.x * t],
  //   //     // ["translate", adsTranslate]
  //   //   ];
  
  //   //   // ops.push(["translate", Vector.multiply({x: 0.11, y: -0.1, z: -0.2}, t)]);
  
  //   //   // ops = ops.concat([
  //   //   //   ["rz", -(this.handRotation.z - rot.z) * t],
  //   //   //   ["ry", -(this.handRotation.y - rot.y) * t],
  //   //   //   ["rx", -(this.handRotation.x - rot.x) * t]
  //   //   // ]);
  
  //   //   var m = Matrix.transform(ops);
  
  //   //   var adsObject = this.getCurrentWeapon().weaponObject.getChild("ADSOffset", true);
  //   //   if (adsObject && t < 0.5) {
  //   //     // var weaponMatrix = this.getCurrentWeapon().weaponObject.getWorldMatrix();
  //   //     // var adsPos = Matrix.getPosition(adsObject.getWorldMatrix());
  //   //     // var localADSOffset = Matrix.transformVector(Matrix.inverse(weaponMatrix), adsPos);
  
  //   //     // m = Matrix.transform([["translate", new Vector(0, 0, -0.15)]], m);
  //   //     var localADSOffset = Matrix.inverse(adsObject.transform.getWorldMatrix(this.getCurrentWeapon().weaponObject));
  //   //     localADSOffset[12] *= 0.1;
  //   //     localADSOffset[13] *= 0.1;
  //   //     localADSOffset[14] *= 0.1;
  //   //     Matrix.setRotation(localADSOffset, Matrix.identity());
  //   //     m = Matrix.multiply(m, localADSOffset);
  
  //   //     // adsTranslate = Vector.add(Vector.multiply(localADSOffset, -0.1), new Vector(0, 0, -0.15));
  //   //     // adsTranslate = Vector.multiply(adsTranslate, 1 - t);
  //   //   }
  
  //   //   return m;
  //   // }
  
  //   this.loginResponse = function(data) {
  //     this.id = data.id;
  //     this.name = data.name;
  
  //     leaderboardEntry = leaderboard.addPlayer();
  //     leaderboard.setItem(leaderboardEntry, ".name", this.name);
  //   }
  
  //   this.die = function() {
  //     this.health = 0;
  //     killcamDir = Matrix.getForward(Matrix.fromQuaternion(Quaternion.eulerVector(Vector.negate(this.getHeadRotation()))));
  
  //     deathScreen.querySelector(".player").innerText = getPlayerNameByID(this.killedBy);
  //     showElement(deathScreen);
  
  //     setTimeout(() => {
  //       this.health = this.maxHealth;
  //       hideElement(deathScreen);
  //     }, 3000);
  //   }
  
  //   this.enemyKilled = function(enemy) {
  //     this.killStreak++;
  //     this.killTimer = 3;
  //     this.kills++;
  //     showKillAlert(enemy.name, this.streakNames[Math.min(this.streakNames.length - 1, this.killStreak - 1)]);
  
  //     // if (leaderboardEntry) leaderboard.setItem(leaderboardEntry, ".kills", this.kills);
  //     killsSpans[0].innerText = this.kills + " kills";
  //     killsSpans[1].innerText = this.kills + " kills";
  //   }
  
  //   this.setWeapons = function(weapons) {
  //     this.weapons = weapons;
  
  //     for (var weapon of this.weapons) {
  //       weapon.onFire = (data) => {
  //         sendMessage("playerAction", {
  //           action: "fireWeapon",
  //           origin: data.origin,
  //           direction: data.direction,
  //           trailHealth: data.trailHealth
  //         });
  //       }
  //     }
  
  //     if (this.getCurrentWeapon()) {
  //       this.getCurrentWeapon().weaponObject.visible = true;
  //     }
  //   }
  
  //   this.getCurrentWeapon = function() {
  //     return this.weapons[this.currentWeapon];
  //   }
  
  //   this.switchWeapon = function(index) {
  //     if (this.dead) {
  //       return;
  //     }
  
  //     if (index >= 0 && index < this.weapons.length) {
  //       if (index != this.currentWeapon) {
  //         var oldWeapon = this.weapons[this.currentWeapon];
  
  //         clearTimeout(oldWeapon.fireTimeout);
  //         oldWeapon.isFiring = false;
  //         oldWeapon.cancelReload();
  //         oldWeapon.mode = oldWeapon.GunModes.DEFAULT;
  //         targetFov = defaultFov;
  
  //         this.rotation = Vector.add(this.rotation, oldWeapon.recoilOffset);
  //         oldWeapon.recoilOffset = Vector.zero();
  //         oldWeapon.recoilOffsetTarget = Vector.zero();
  
  //         if (oldWeapon.weaponObject) {
  //           oldWeapon.weaponObject.visible = false;
  //         }
          
  //         var newWeapon = this.weapons[index];
  //         newWeapon.reloadAnimationTime = 1;
  //         newWeapon.fireAnimationTime = 1;
  //         if (newWeapon.weaponObject) {
  //           newWeapon.weaponObject.visible = true;
  //         }
  //         crosshair.type = newWeapon.crosshairType;
  //       }
      
  //       this.currentWeapon = index;
  //     }
  //   }
  
  //   this.getHeadPos = function() {
  //     return Vector.add(this.position, {x: 0, y: this.standHeight / 2 + visualHeight / 2 - 0.1 + Math.sin(this.walkTime) * this.headBobStrength, z: 0});
  //   }
  
  //   this.getHeadRotation = function() {
  //     if (this.getCurrentWeapon()) {
  //       return Vector.add(this.rotation, this.getCurrentWeapon().recoilOffset);
  //     }
      
  //     return this.rotation;
  //   }
  
  //   this.Fire = function() {
  //     if (!this.dead && this.getCurrentWeapon()) {
  //       this.weapons[this.currentWeapon].fire();
  //     }
  //   }
  
  //   this.update = function(dt) {
  //     if (this.dead) {
  //       // mainCamera.setFOV(20);
  //       var m = multiplayerCharacters[this.killedBy];
  //       if (m && m.gameObject) {
  //         var m = Matrix.lookAt(this.getHeadPos(), m.gameObject.transform.position, Vector.up());
  //         killcamDir = Vector.slerp(killcamDir, Matrix.getForward(m), 0.1);
  //         mainCamera.transform.matrix = Matrix.lookAt(this.getHeadPos(), Vector.add(this.getHeadPos(), killcamDir));
  //       }
  //     }
  //     else {
  //       targetHeight = this.crouching ? this.crouchHeight : this.standHeight;
  //       this.height = targetHeight;
  //       // this.height += (targetHeight - this.height) * 0.6;
  //       visualHeight += (this.height - visualHeight) * 0.4;
  
  //       if (renderer.getKeyDown(16) && this.grounded) {
  //         this.position.y -= 0.5;
  //       }
  
  //       if (this.getCurrentWeapon()) {
  //         this.getCurrentWeapon().update(dt);
  //       }
  
  //       this.clampRotation();
  
  //       mainCamera.setFOV(currentFov);
  //       weaponCamera.setFOV(currentWeaponFov);
  
  //       mainCamera.transform.rotation = Quaternion.eulerVector(Vector.negate(this.getHeadRotation()));
  //       mainCamera.transform.position = this.getHeadPos();//Vector.add(this.position, {x: 0, y: this.height - 0.1, z: 0});
  //       // mainCamera.transform.position = Vector.add(Vector.compMultiply(this.position, {x: 1, y: 1, z: -1}), {x: 0, y: 1.6, z: 0});
  
  //       weaponCamera.transform.position = mainCamera.transform.position;
  //       weaponCamera.transform.rotation = mainCamera.transform.rotation;
  
  //       // var rot = this.getHeadRotation();
  //       // var m = Matrix.transform([
  //       //   ["translate", this.getHeadPos()],
  //       //   ["rz", -rot.z],
  //       //   ["ry", -rot.y],
  //       //   ["rx", -rot.x]
  //       // ]);
  //       // audioListener.setDirection(Matrix.getForward(m), Vector.up());
  //       // audioListener.setPosition(this.position);
  
  //       this.killTimer -= dt;
  //       if (this.killTimer <= 0) {
  //         this.killStreak = 0;
  //       }
  //     }
  //   }
  
  //   // bruh 200kb memory
  //   this.fixedUpdate = function(dt) {
  //     if (!this.dead) {
  //       var inputs = {
  //         forward: renderer.getKey(87),
  //         back: renderer.getKey(83),
  //         left: renderer.getKey(65),
  //         right: renderer.getKey(68),
  //         jump: renderer.getKey(32),
  //         crouching: renderer.getKey(16)
  //       };
  
  //       // this.handRotation.x += Math.sign(this.handRotation.x - this.getHeadRotation().x) * 0.01;
  //       // this.handRotation.y += Math.sign(this.handRotation.y - this.getHeadRotation().y) * 0.01;
  //       // this.handRotation = Vector.lerp(this.handRotation, this.getHeadRotation(), 0.8);
  //       // this.handRotation = Vector.add(this.handRotation, Vector.multiply(Vector.subtract(this.getHeadRotation(), this.handRotation), 0.9));
  //       this.handRotation = this.getHeadRotation();
  
  //       Player.applyInputs(this, inputs, dt);
  //       this.simulatePhysicsStep(dt);
  
  //       if (this.getCurrentWeapon()) {
  //         this.getCurrentWeapon().fixedUpdate(dt);
  //       }
  
  //       /*
  //         Send to server
  //       */
  
  //       var yRotation = this.rotation.y;
  
  //       inputBuffer[tick] = {
  //         tick,
  //         inputs,
  //         yRotation
  //       };
  //       stateBuffer[tick] = {
  //         position: this.position,
  //         velocity: this.velocity
  //       };
  
  //       sendMessage("inputs", inputBuffer[tick]);
  
  //       tick++;
  //     }
  //   }
  
  //   this.simulatePhysicsStep = function(dt) {
  //     // Gravity
  //     this.velocity.y -= 18 * dt;
  
  //     // Jumping
  //     if (this.grounded) {
  //       player.groundCounter = this.coyoteTime;
  //     }
  
  //     player.groundCounter -= dt;
  //     player.jumpCounter -= dt;
  
  //     // Ground friction/drag
  //     if (this.grounded) {
  //       var projectedVelocity = Vector.projectOnPlane(this.velocity, this.fakeGroundNormal);//{x: this.velocity.x, y: 0, z: this.velocity.z};
  //       var speed = Vector.length(projectedVelocity);
  //       this.velocity = Vector.add(this.velocity, Vector.multiply(Vector.normalize(projectedVelocity), -speed * dt * this.friction));
  
  //       // Sliding / turning
  //       if (this.crouching && speed > 10) {
  //         var v = Vector.rotateAround({
  //           x: Vector.length(Vector.projectOnPlane(this.velocity, this.fakeGroundNormal)),
  //           y: 0,
  //           z: 0
  //         }, this.fakeGroundNormal, -this.rotation.y + Math.PI / 2);
          
  //         this.velocity.x = v.x;
  //         this.velocity.z = v.z;
  //       }
  //     }
  
  //     this.position = Vector.add(this.position, Vector.multiply(this.velocity, dt));
  
  //     Player.solveCollisions(this);
  
  //     // // Extend grounded collision
  //     // if (!this.grounded) {
  //     //   var hit = physicsEngine.Raycast(this.position, Vector.down());
  //     //   if (hit && hit.distance < this.height / 2 + 0.01) {
  //     //     this.grounded = true;
  //     //     this.realGroundNormal = hit.normal;
  
  //     //     // bruh copy code
  //     //     var dp = Vector.dot(Vector.up(), this.realGroundNormal);
  //     //     var normal = dp > 0.8 ? Vector.up() : this.realGroundNormal;
  //     //     this.fakeGroundNormal = normal;
  //     //   }
  //     // }
  
  //     // Reset when out-of-bounds
  //     if (this.position.y < -30) {
  //       this.position = this.startPosition;
  //       this.velocity = Vector.zero();
  //     }
  
  //     currentFov += (targetFov - currentFov) / 3;
  //     currentWeaponFov += (targetWeaponFov - currentWeaponFov) / 3;
  //   }
  
  //   this.clampRotation = function() {
  //     var w = this.getCurrentWeapon();
  //     var ro = w ? w.recoilOffset : 0;
  //     this.rotation.x = clamp(this.rotation.x, -Math.PI / 2 - ro.x, Math.PI / 2 - ro.x);
  //   }
  // }
  // Player.applyInputs = function(player, inputs, dt) {
  //   var vertical = (inputs.forward || 0) - (inputs.back || 0);
  //   var horizontal = (inputs.left || 0) - (inputs.right || 0);
  
  //   if (vertical || horizontal) {
  //     var direction = Vector.rotateAround({
  //       x: vertical,
  //       y: 0,
  //       z: -horizontal
  //     }, {x: 0, y: 1, z: 0}, -player.rotation.y + Math.PI / 2);
  
  //     if (player.grounded) {
  //       direction = Vector.normalize(Vector.projectOnPlane(direction, player.realGroundNormal));
  //     }
  
  //     var currentAcceleration = player.runningAcceleration;//renderer.getKey(16) ? this.runningAcceleration : this.walkAcceleration;
  //     currentAcceleration *= (player.grounded ? player.crouching ? 0.5 : 1 : 0.1);
  //     if (player.getCurrentWeapon()) {
  //       currentAcceleration *= player.getCurrentWeapon().getSpeed();
  //     }
  
  //     if (player.grounded) {
  //       player.walkTime += currentAcceleration * player.headBobSpeed * dt;
  //     }
  
  //     // actionQueue.push({type: "movement", time: new Date().getTime(), direction: direction, speed: this.walkSpeed, dt: dt});
      
  //     player.position = Vector.add(player.position, Vector.multiply(direction, player.walkSpeed * dt));
  //     // player.velocity = Vector.add(player.velocity, Vector.multiply(direction, currentAcceleration * dt));
  //   }
  //   else {
  //     player.walkTime += (roundNearest(player.walkTime, Math.PI) - player.walkTime) * 0.1;
  //   }
  
  //   // Jumping
  //   // if (renderer.getKeyDown(32)) {
  //   if (inputs.jump) {
  //     player.jumpCounter = player.jumpBuffering;
  //   }
  
  //   if (inputs.jump && player.jumpCounter > 0 && player.groundCounter > 0) {
  //     player.velocity.y = 6;
  //     player.position.y += 0.05;
  
  //     player.jumpCounter = 0;
  //     player.groundCounter = 0;
  //   }
  
  //   // Crouching
  //   player.crouching = inputs.crouching;
  // }
  
  // Player.solveCollisions = function(player) {
  //   player.grounded = false;
  
  //   var radiusOffset = new Vector(0, player.colliderRadius, 0);
  //   var playerAABB = new AABB(
  //     {x: player.position.x - player.colliderRadius * 2, y: player.position.y - player.colliderRadius * 2,                 z: player.position.z - player.colliderRadius * 2},
  //     {x: player.position.x + player.colliderRadius * 2, y: player.position.y + player.colliderRadius * 2 + player.height, z: player.position.z + player.colliderRadius * 2}
  //   );
  //   var q = physicsEngine.octree.queryAABB(playerAABB);
  
  //   for (var iter = 0; iter < player.collisionIterations; iter++) {
  //     if (q) {
  //       for (var k = 0; k < q.length; k++) {
  //         if (!AABBTriangleToAABB(q[k][0], q[k][1], q[k][2], playerAABB)) { // bruh redundant?
  //           continue;
  //         }
  
  //         var col = capsuleToTriangle(
  //           Vector.add(player.position, new Vector(0, player.standHeight / 2 - player.height * 0.5 + player.colliderRadius, 0)),
  //           Vector.subtract(Vector.add(player.position, new Vector(0, player.standHeight / 2 + player.height / 2, 0)), radiusOffset),
  //           player.colliderRadius,
  //           q[k][0], q[k][1], q[k][2],
  //           true
  //         );
  //         // var col = capsuleToTriangle(Vector.add(this.position, radiusOffset), Vector.subtract(Vector.add(this.position, new Vector(0, this.height, 0)), radiusOffset), this.colliderRadius, q[k][0], q[k][1], q[k][2], true);
          
  //         if (col && !Vector.equal(col.normal, Vector.zero(), 0.001)) {
  //           var dp = Vector.dot(Vector.up(), col.normal);
  //           var normal = dp > 0.85 ? Vector.up() : col.normal;
  //           var depth = col.depth / Vector.dot(normal, col.normal);
  
  //           player.position = Vector.add(player.position, Vector.multiply(normal, depth));
  //           player.velocity = Vector.projectOnPlane(player.velocity, normal);
  
  //           var isGround = Vector.dot(normal, Vector.up()) > 0.7;
  //           if (isGround) {
  //             player.fakeGroundNormal = normal;
  //             player.realGroundNormal = col.normal;
  //             player.grounded = true;
  //           }
  //         }
  //       }
  //     }
  //   }
  // }
  
  function MultiplayerCharacter(gameObject) {
    this.id = -1;
    this.enemy = null;
    this.gameObject = gameObject;
    this.snapshotHistory = [];
    this.name = null;
    this.leaderboardEntry = null;

    this.gunName = "";
    this.gun = null;

    const audioSources = {
      AK12: new AudioSource3D(audioListener, "../assets/sound/AK12/fire.wav", Vector.zero()),
      Sniper: new AudioSource3D(audioListener, "../assets/sound/sniper/fire.wav", Vector.zero()),
      Shotgun: new AudioSource3D(audioListener, "../assets/sound/shotgun/fire.wav", Vector.zero()),
      Glock: new AudioSource3D(audioListener, "../assets/sound/drumGun2.wav", Vector.zero()),
    };

    this.onLeave = function() {
      console.log(this.id + " has left!");

      killfeed.addItem({
        message: `${this.id} has left`
      });

      if (this.leaderboardEntry) {
        leaderboard.removePlayer(this.leaderboardEntry);
      }

      if (this.gameObject) {
        this.gameObject.delete();
      }

      const index = enemies.indexOf(this.enemy);
      if (index !== -1) {
        enemies.splice(index, 1);
      }
    };

    this.playFireSound = function(position) {
      const audioSource = audioSources[this.gunName];
      if (!audioSource) {
        return;
      }

      audioSource.setPosition(position);
      audioSource.audioElement.currentTime = 0;
      audioSource.audioElement.play();
    };

    this.setGun = function(gunName) {
      if (gunName == this.gunName) {
        return;
      } 

      const weapon = Object.values(classes).map(c => c.weapons).flat().find(w => w.name === gunName);
      if (!weapon) {
        return;
      }

      const gun = weapon.weaponObject.copy();
      gun.setLayer(0b1, true);
      gun.visible = true;

      if (this.gun !== null) {
        this.gun.destroy();
      }
      
      this.gun = gun;
      this.gunName = gunName;

      this.gun.setParent(this.gameObject);

      const rightArm = this.rightArm;
      const leftArm = this.leftArm;

      const leftHandTarget = gun.getChild("LeftHandOffset", true);
      const rightHandTarget = gun.getChild("RightHandOffset", true);

      if (leftHandTarget) {
        const m = Matrix.identity();
        Matrix.applyRotationX(Math.PI, m);

        const isVerticalGrip = leftHandTarget.customData.handGripType == 1;
        if (isVerticalGrip) {
          Matrix.applyRotationX(Math.PI / 2, m);
          Matrix.applyRotationZ(Math.PI / 2, m);
        }
        else {
          Matrix.applyRotationX(Math.PI * 0.1, m);
          Matrix.applyRotationY(-Math.PI * 0.15, m);
        }

        const handBone = leftArm.bones[2];
        const holdOffsetObject = handBone.getChild(/HoldOffset/, true);
        if (holdOffsetObject) {
          const holdOffset = Matrix.inverse(holdOffsetObject.transform.getWorldMatrix(handBone));
          Matrix.multiply(m, holdOffset, m);
        }

        leftArm.endObject.setParent(leftHandTarget);
        leftArm.endObject.transform.matrix = m;
      }

      if (rightHandTarget) {
        const m = Matrix.identity();
        Matrix.applyRotationX(Math.PI, m);

        const isVerticalGrip = rightHandTarget.customData.handGripType == 1;
        if (isVerticalGrip) {
          Matrix.applyRotationX(Math.PI / 2, m);
          Matrix.applyRotationZ(-Math.PI / 2, m);
        }
        else {
          Matrix.applyRotationX(Math.PI * 0.1, m);
          Matrix.applyRotationY(-Math.PI * 0.15, m);
        }

        const handBone = rightArm.bones[2];
        const holdOffsetObject = handBone.getChild(/HoldOffset/, true);
        if (holdOffsetObject) {
          const holdOffset = Matrix.inverse(holdOffsetObject.transform.getWorldMatrix(handBone));
          Matrix.multiply(m, holdOffset, m);
        }

        rightArm.endObject.setParent(rightHandTarget);
        rightArm.endObject.transform.matrix = m;
      }
    };
  
    this.update = function(/*dt*/) {
      if (!this.gameObject) {
        return;
      }

      const data = getLerpedSnapshotData(syncedClock.getCurrentTime() - LERP_DELAY);
      if (!data) {
        return;
      }

      this.setGun(data.currentWeaponName);

      // this.gameObject.animationController.speed = data.currentSpeed;
      if (this.gameObject.animationController && !isNaN(data.animationX) && !isNaN(data.animationY) && !isNaN(data.animationZ)) {
        var wh = this.gameObject.animationController.weightsHandler;
        wh.x = data.animationX;
        wh.y = data.animationY;
        wh.z = data.animationZ;
        
        // Jumping
        if (data.animationZ > 0.1) {
          this.gameObject.animationController.setTime(this.gameObject.animationController.animations[7], 1);
        }
      }

      const headBone = this.gameObject.getChild("mixamorig:Head", true);
      const spineBone = this.gameObject.getChild("mixamorig:Spine", true);

      this.gameObject.transform.position = data.position;
      this.gameObject.transform.rotation = Quaternion.euler(0, -data.rotation.y + Math.PI, 0);
      
      headBone.transform.worldRotation = Quaternion.euler(
        data.rotation.x,
        -data.rotation.y + Math.PI,
        data.rotation.z,
      );

      const gun = this.gun;
      if (gun) {
        const adsMatrix = Matrix.copy(headBone.transform.worldMatrix);
        Matrix.applyTranslationZ(25, adsMatrix);
        Matrix.applyRotationY(Math.PI, adsMatrix);
        Matrix.setScale(adsMatrix, Vector.one());

        const hipMatrix = Matrix.identity();
        Matrix.applyTranslation(spineBone.transform.worldPosition, hipMatrix);
        Matrix.applyTranslationY(0.33, hipMatrix);
        Matrix.applyRotationY(-data.rotation.y, hipMatrix);
        Matrix.applyRotationX(-data.rotation.x, hipMatrix);
        Matrix.applyTranslation(new Vector(
          0.113,
          0,
          -0.35
        ), hipMatrix);

        const gunMatrix = Matrix.lerp(hipMatrix, adsMatrix, 1 - data.ads);
        gun.transform.worldMatrix = gunMatrix;
      }

      if (this.enemy) {
        if (data.state == player.STATES.PLAYING && this.enemy.dead) {
          this.enemy.respawn();
        }
        if (data.state != player.STATES.PLAYING && !this.enemy.dead) {
          this.enemy.dead = true;
          this.enemy.gameObject.visible = false;
        }
      }
    };

    this.addSnapshot = function(snapshot) {
      this.snapshotHistory.push(snapshot);

      if (this.snapshotHistory.length > 100) {
        this.snapshotHistory.shift();
      }
    };
  
    const getLerpedSnapshotData = (time) => {
      var snapshotHistoryCopy = [...this.snapshotHistory];
      // Newest first
      snapshotHistoryCopy.sort(function(a, b) {
        return b.timestamp - a.timestamp;
      });

      var neighbors;
      for (let i = 0; i < snapshotHistoryCopy.length; i++) {
        var snapshot = snapshotHistoryCopy[i];
        // Snapshot is older than 'time'?
        if (time > snapshot.timestamp) {
          neighbors = [snapshot, snapshotHistoryCopy[i - 1], snapshotHistoryCopy[i + 1], i];
          break;
        }
      }
  
      if (!neighbors) {
        let i = snapshotHistoryCopy.length - 1;
        neighbors = [snapshotHistoryCopy[i], snapshotHistoryCopy[i - 1], snapshotHistoryCopy[i + 1], i];
      }
  
      if (neighbors) {
        if (neighbors[1]) {
          var t = inverseLerp(neighbors[0].timestamp, neighbors[1].timestamp, time);
          // var t = clamp(1 + inverseLerp(neighbors[0].timestamp, neighbors[1].timestamp, time), 0, 1);
          var lerpedData = {};
  
          // if (neighbors[0].timestamp < neighbors[1].timestamp) {
          //   console.log(neighbors[0].timestamp - neighbors[1].timestamp, "ms");
          // }
  
          for (var key in neighbors[0].data) {
            var func;
  
            if (typeof neighbors[0].data[key] == "number" && key != "state") {
              func = lerp;
            }
            else if (Vector.isVectorIsh(neighbors[0].data[key])) {
              func = Vector.lerp;
            }
            else {
              lerpedData[key] = neighbors[0].data[key];
              continue;
            }
  
            lerpedData[key] = func(neighbors[0].data[key], neighbors[1].data[key], t);
          }
  
          // var sub = Vector.subtract(neighbors[0].data.position, neighbors[1].data.position);
          // var worldVelocity = Vector.divide(sub, (neighbors[0].timestamp - neighbors[1].timestamp) / 1000);
          var worldVelocity = Vector.divide(lerpedData.velocity, 4);
          worldVelocity = Vector.rotateAround(worldVelocity, Vector.up(), lerpedData.rotation.y + Math.PI);
          worldVelocity = Vector.clamp(worldVelocity, -1, 1);
  
          lerpedData.animationX = worldVelocity.x;
          lerpedData.animationY = worldVelocity.z;
          lerpedData.animationZ = !lerpedData.grounded ? 1 : lerpedData.crouching ? -1 : 0;
  
          if (lerpedData.crouching) {
            lerpedData.position.y += 0.4;
          }
  
          // var forward = Vector.rotateAround({x: 0, y: 0, z: 1}, Vector.up(), lerpedData.yRotation + Math.PI);
          // var speed = Vector.length({x: sub.x, y: 0, z: sub.z}) / ((neighbors[0].timestamp - neighbors[1].timestamp) / 1000) / 4;
          // lerpedData.currentSpeed = speed * Math.sign(Vector.dot(forward, sub));
  
          if (isNaN(lerpedData.position.x)) {
            console.log(neighbors, t, snapshotHistoryCopy);
          }
  
          return lerpedData;
        }
        else if (neighbors[0]) {
          return neighbors[0].data;
        }
      }
  
      console.log(snapshotHistoryCopy.length, neighbors, new Date(time), snapshotHistoryCopy);
      console.warn("Skipped snapshot");
    };
  }
  
  function CaptureZoneManager() {
    this.zones = [];
  
    this.add = function(zone) {
      this.zones.push(zone);
    };
  
    this.update = function(dt) {
      player.closestZone = null;
  
      for (var zone of this.zones) {
        zone.update(dt);
      }
    };
  
    this.renderZoneUI = function(zone) {
      ui.rectangle(ui.width / 2 - 100, ui.height - 50, 200, 20, "white");
      ui.rectangle(ui.width / 2 - 100, ui.height - 50, zone.timer * 200, 20, glColorToRGB(zone.getColor()));
    };
  
    function glColorToRGB(color) {
      var v = Vector.normalize(Vector.fromArray(color));
      return `rgb(${v.x * 255}, ${v.y * 255}, ${v.z * 255})`;
    }
  }
  
  function CaptureZone(position = Vector.zero(), zoneInstance) {
    var teamHolding = 0;
    var teamHoldingTimer = 0;
    var teamColors = [
      [50, 50, 50], // White
      [10, 25, 50], // Blue
      [50, 20, 2]   // Orange
    ];
    
    this.captureSpeed = 1 / 4;
    this.timer = 0;
    this.radius = 5;
  
    this.setup = async function() {
      if (zoneInstance) {
        this.gameObject = scene.add(zoneInstance.copy());
      }
      else {
        this.gameObject = scene.add(await renderer.loadGLTF("../assets/models/captureZone.glb"));
        this.gameObject.children[0].castShadows = false;
  
        var zoneProgram = new renderer.ProgramContainer(await renderer.createProgramFromFile("../assets/shaders/custom/webgl2/captureZone"));
        var mat = this.gameObject.children[0].meshRenderer.materials[0] = new NewMaterial(zoneProgram);
        mat.setUniform("zoneColor", [5, 5, 5]);
        mat.doubleSided = true;
        mat.opaque = false;
  
        var lightObject = this.gameObject.addChild(new GameObject("Light"));
        lightObject.transform.position = new Vector(0, 2, 0);
        var light = lightObject.addComponent(new Light());
        light.color = [50, 50, 50];
      }
  
      this.gameObject.transform.position = position;
      this.setTeam(0);
    };
  
    this.update = function(dt) {
      var playerTeam = player.team ?? 1;
  
      if (player.isPlaying && Vector.distanceSqr(player.position, this.gameObject.transform.position) < this.radius * this.radius) {
        if (this.noTeamHolding()) {
          if (teamHoldingTimer == playerTeam) {
            this.timer += this.captureSpeed * dt;
            if (this.timer >= 1) {
              this.setTeam(playerTeam);
            }
          }
          else {
            this.timer -= this.captureSpeed * dt;
            if (this.timer <= 0) {
              teamHoldingTimer = playerTeam;
              this.setTeam(0);
            }
          }
        }
        else {
          if (teamHolding != playerTeam) {
            this.timer -= this.captureSpeed * dt;
            if (this.timer <= 0) {
              teamHoldingTimer = playerTeam;
              this.setTeam(0);
            }
          }
        }
  
        player.closestZone = this;
      }
  
      this.timer = clamp(this.timer, 0, 1);
    };
  
    this.noTeamHolding = function() {
      return teamHolding === 0;
    };
  
    this.setTeam = function(index) {
      teamHolding = index;
  
      if (!this.noTeamHolding()) {
        this.timer = 1;
      }
  
      var color = teamColors[teamHolding];
  
      var mat = this.gameObject.children[0].meshRenderer.materials[0];
      mat.setUniform("zoneColor", getRingColor(color));
  
      var l = this.gameObject.getChild("Light", true) || this.gameObject.getChild("Light (Copy)", true);
      l.getComponents()[0].color = color;
    };
  
    this.getTeam = function() {
      return teamHolding;
    };
  
    this.getColor = function() {
      return teamColors[teamHoldingTimer];
    };
  
    function getRingColor(color) {
      return [
        color[0] / 10,
        color[1] / 10,
        color[2] / 10
      ];
    }
  }
  
  async function CreateCaptureZone(position = Vector.zero(), zoneInstance) {
    var z = new CaptureZone(position, zoneInstance);
    await z.setup();
    return z;
  }
  
  function Settings() {
    var defaultSettings = {
      "FOV": new Slider(45, 10, 80, 1),
      "Master volume": new Slider(1, 0, 2, 0.1),

      "Max FPS": new Slider(60, 24, 144, 1),
      "Render scale": new Slider(1, 0.5, 1.5, 0.1),
      "Bloom": new Toggle(true),
      "Lens dirt": new Toggle(true),
      "FXAA": new Toggle(true),
  
      // "Colorblindness mode": new Dropdown(0, ["First", "second", "third"]),
    };
  
    var _settings = copySettings(defaultSettings);
  
    this.getSetting = function(setting) {
      return _settings[setting]?.value;
    };
  
    function copySettings(settings) {
      var newSettings = {};
      for (var key in settings) {
        newSettings[key] = settings[key].copy();
      }
  
      return newSettings;
    }
  
    function resetSettings() {
      _settings = copySettings(defaultSettings);
      localStorage.removeItem(LS_SETTINGS);

      applySettings();
    }
  
    function loadSettings() {
      var saved = localStorage.getItem(LS_SETTINGS);
      if (saved) {
        try {
          saved = JSON.parse(saved);
    
          for (var key in _settings) {
            if (key in saved) {
              _settings[key].value = _settings[key].validate(saved[key]);
            }
          }
        }
        catch (e) {
          console.error(e);
          console.warn("Invalid settings in local storage!");
        }
      }
    }
  
    function saveSettings() {
      applySettings();

      var saveObject = {};
      for (var key in _settings) {
        saveObject[key] = _settings[key].value;
      }
  
      localStorage.setItem(LS_SETTINGS, JSON.stringify(saveObject));
    }
  
    var createSettingsElement = () => {
      var settingsList = document.querySelector(".settingsList");
      removeChildren(settingsList);
  
      for (var key in _settings) {
        var value = _settings[key];
  
        var item = settingsList.appendChild(document.createElement("div"));
        item.classList.add("item");
  
        var keyDiv = item.appendChild(document.createElement("div"));
        keyDiv.innerText = key;
  
        var valueDiv = item.appendChild(document.createElement("div"));
        value.createInputElement(valueDiv);
      }
  
      var resetButton = settingsList.appendChild(document.createElement("button"));
      resetButton.innerText = "Reset settings";
      resetButton.classList.add("AccentButton");
      resetButton.onclick = function() {
        if (confirm("Are you sure you want to reset all settings to their default values?")) {
          resetSettings();
          createSettingsElement();
        }
      };
    };
  
    function Toggle(value) {
      this.value = value;
  
      this.createInputElement = function(parent) {
        var toggleElement = document.createElement("label");
        toggleElement.classList.add("toggle");
  
        var checkbox = toggleElement.appendChild(document.createElement("input"));
        checkbox.setAttribute("type", "checkbox");
        checkbox.checked = this.value;
  
        var span = toggleElement.appendChild(document.createElement("span"));
        span.classList.add("slider", "round");
  
        parent.appendChild(toggleElement);
  
        checkbox.onchange = () => {
          this.value = checkbox.checked;
  
          saveSettings();
        };
      };
  
      this.validate = function(v) {
        return !!v;
      };
  
      this.copy = function() {
        return new Toggle(this.value);
      };
    }
  
    function Dropdown(currentIndex = 0, options = []) {
      this.currentIndex = currentIndex;
      this.options = options;
      this.value = this.options[this.currentIndex];
  
      this.createInputElement = function(parent) {
        var selectElement = document.createElement("select");
  
        for (var option of this.options) {
          var optionElement = document.createElement("option");
          optionElement.value = option;
          optionElement.innerText = option;
          selectElement.appendChild(optionElement);
        }
  
        var ind = this.options.indexOf(this.value);
        ind = Math.max(ind, 0);
        selectElement.selectedIndex = ind;
        this.currentIndex = ind;
  
        parent.appendChild(selectElement);
  
        selectElement.onchange = () => {
          this.value = this.options[selectElement.selectedIndex];
          this.currentIndex = selectElement.selectedIndex;
  
          saveSettings();
        };
      };
  
      this.validate = function(v) {
        return v;
      };
  
      this.copy = function() {
        return new Dropdown(this.currentIndex, this.options);
      };
    }
  
    function Slider(current, min, max, step = 0.1) {
      this.value = current;
      this.min = min;
      this.max = max;
      this.step = step;
  
      this.createInputElement = function(parent) {
        var slider = document.createElement("input");
        slider.setAttribute("type", "range");
        slider.setAttribute("min", this.min);
        slider.setAttribute("max", this.max);
        slider.setAttribute("step", this.step);
        slider.value = this.value;
  
        // var minSpan = document.createElement("span");
        // minSpan.style = `
        //   display: inline-block;
        //   width: 30px;
        //   text-align: right;
        //   padding-right: 0.5em;
        // `;
        // minSpan.innerText = this.min;
  
        // var maxSpan = document.createElement("span");
        // maxSpan.style = `
        //   display: inline-block;
        //   width: 30px;
        //   padding-left: 0.5em;
        // `;
        // maxSpan.innerText = this.max;
  
        var currentValueInput = document.createElement("input");
        currentValueInput.style = `
          margin-left: 10px;
          min-width: 0;
          width: 50px;
          border: none;
          background: none;
          font-weight: bold;
          color: white;
        `;
        currentValueInput.value = this.value;
  
        // parent.appendChild(minSpan);
        parent.appendChild(slider);
        // parent.appendChild(maxSpan);
  
        parent.appendChild(currentValueInput);
  
        var setValues = (input) => {
          var v = this.validate(input);
  
          slider.value = v;
          currentValueInput.value = v;
          this.value = v;
  
          saveSettings();
        };
  
        slider.onchange = () => {
          setValues(slider.value);
        };
        slider.oninput = () => {
          setValues(slider.value);
        };
  
        currentValueInput.onchange = () => {
          setValues(currentValueInput.value);
        };
      };
  
      this.validate = function(v) {
        if (typeof v == "string") {
          v = v.replace(",", ".");
        }
  
        v = parseFloat(v);
  
        if (isNaN(v)) {
          v = this.min;
        }
  
        v = clamp(v, this.min, this.max);
        v = roundNearest(v, this.step);
        v = roundToPlaces(v, 9);
  
        return v;
      };
  
      this.copy = function() {
        return new Slider(this.value, this.min, this.max, this.step);
      };
    }
  
    loadSettings();
    createSettingsElement();
  }
  
  function applySettings() {
    defaultFov = window.defaultFov = targetFov = currentFov = settings.getSetting("FOV");
    audioHandler.setMasterVolume(settings.getSetting("Master volume"));

    renderer.setTargetFPS(settings.getSetting("Max FPS"));
    renderer.setRenderScale(settings.getSetting("Render scale"));
    bloomEffect.enabled = settings.getSetting("Bloom");
    bloomEffect.lensDirtIntensity = settings.getSetting("Lens dirt") ? 5 : 0;
    fxaaEffect.enabled = settings.getSetting("FXAA");
  }
  
  function Leaderboard(element) {
    this.element = element;
    var list = this.element.querySelector(".list");
    var itemTemplate = this.element.querySelector(".itemTemplate");
    let isOpen = false;
  
    this.sort = function(querySel = ".kills") {
      var items = [...element.querySelectorAll(".list > div")];
      items.sort((a, b) => {
        return parseInt(b.querySelector(querySel).innerText) - parseInt(a.querySelector(querySel).innerText);
      });
  
      for (var i = 0; i < items.length; i++) {
        list.insertBefore(items[i], list.childNodes[i]);
      }
    };
  
    this.addPlayer = function() {
      var clone = itemTemplate.content.cloneNode(true);
      clone = list.appendChild(clone.children[0]);
      return clone;
    };

    this.removePlayer = function(entry) {
      if (!entry) {
        return;
      }

      list.removeChild(entry);
    };
  
    this.incrementPlayerStat = function(playerName, stat, inc = 1) {
      var row = this.getPlayerRow(playerName);
      this.setItem(row, stat, parseFloat(this.getItem(row, stat)) + inc);
    };
  
    this.setPlayerStat = function(playerName, stat, value) {
      var row = this.getPlayerRow(playerName);
      this.setItem(row, stat, value);
    };
  
    this.getPlayerRow = function(playerName) {
      var xpath = `//span[text()='${playerName}' and contains(@class, 'leaderboardName')]`;
      var matchingElement = document.evaluate(xpath, this.element, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
      return matchingElement.parentElement;
    };
  
    this.setItem = function(element, selector, value) {
      element.querySelector(selector).innerText = value;

      if (isOpen) {
        this.sort();
      }
    };
  
    this.getItem = function(element, selector) {
      return element.querySelector(selector).innerText;
    };
  
    this.show = function() {
      this.sort();
      showElement(this.element);
      isOpen = true;
    };
  
    this.hide = function() {
      hideElement(this.element);
      isOpen = false;
    };
  }
  
  function Killfeed() {
    this.feed = [];
    this.y = 50;
    this.width = 400;
    this.offset = 0;
  
    this.removeItem = function() {
      this.feed.shift();
      this.offset = 1;
    };
  
    this.addItem = function(item) {
      this.feed.push(item);
  
      if (this.feed.length > 10) {
        this.removeItem();
      }
      else {
        setTimeout(() => {
          this.removeItem();
        }, 10000);
      }
    };
  
    this.update = function(dt) {
      if (this.offset > 0) {
        this.offset -= dt * 4;
      }
      this.offset = Math.max(0, this.offset);
    };
  
    this.render = function() {
      var killfeedGradient = ui.ctx.createLinearGradient(ui.width - this.width, 0, ui.width - this.width + 50, 0);
      killfeedGradient.addColorStop(0, "transparent");
      killfeedGradient.addColorStop(1, "rgba(0, 0, 0, 0.4)");
    
      ui.setFont("Oswald");
      ui.ctx.textAlign = "right";
      ui.ctx.textBaseline = "middle";
    
      for (let i = 0; i < this.feed.length; i++) {
        const k = this.feed[i];
        let msg;
        if ("message" in k) {
          msg = k.message;
        }
        else if (!("killer" in k)) {
          msg = k.killed + " died";
        }
        else {
          msg = k.killer + " killed " + k.killed;
        }
        
        ui.rectangle(ui.width - this.width, this.y + (i + this.offset) * 30, this.width, 25, killfeedGradient);
        ui.text(msg, ui.width - 10 - 28, this.y + 25 / 2 + (i + this.offset) * 30, 16, "white");

        if (k.isHeadshot) {
          ui.picture(renderer.path + "assets/textures/headshot.png", ui.width - 30, this.y + (i + this.offset) * 30 + 3, 19, 19);
        }
      }
    
      ui.ctx.textAlign = "left";
      ui.ctx.textBaseline = "alphabetic";
    };
  }

  function HitDirectionIndicator(player) {
    this.player = player;
    const indications = [];
    const indicateTime = 1500;

    let globalHit = 0;

    this.render = function(dt) {
      const r = Math.min(ui.width, ui.height) * 0.35;

      ui.background(`rgba(255, 0, 0, ${globalHit})`);

      for (const indication of indications) {
        const direction = Vector.subtract(indication.position, this.player.position);
        Vector.projectOnPlane(direction, Vector.up(), direction);
        Vector.rotateAround(direction, Vector.up(), this.player.getHeadRotation().y, direction);
        Vector.normalizeTo(direction);

        const angle = Math.atan2(direction.z, direction.x);

        const gradient = ui.ctx.createRadialGradient(ui.width / 2, ui.height / 2, r, ui.width / 2, ui.height / 2, r + 100);
        const alpha = clamp01(indication.health * indication.damage);
        gradient.addColorStop(0, `rgba(255, 0, 0, ${alpha})`);
        gradient.addColorStop(1, "rgba(255, 0, 0, 0)");

        ui.ctx.beginPath();
        ui.ctx.arc(ui.width / 2, ui.height / 2, r, angle - 0.15, angle + 0.15);
        ui.ctx.arc(ui.width / 2, ui.height / 2, r + 100, angle + 0.2, angle - 0.2, true);
        ui.ctx.fillStyle = gradient;
        ui.ctx.fill();

        indication.health -= dt / (indicateTime / 1000);
        indication.health = Math.max(0, indication.health);
      }

      globalHit -= dt / (indicateTime / 1000);
      globalHit = Math.max(0, globalHit);
    };

    this.indicate = function(position, damage = 1) {
      globalHit = clamp(damage * 0.2, globalHit, 0.65);

      const indication = { position, health: 1, damage };
      indications.push(indication);

      setTimeout(() => {
        const index = indications.indexOf(indication);
        if (index === -1) {
          return;
        }

        indications.splice(index, 1);
      }, indicateTime);
    };
  }

  function SyncedClock() {
    const resendDelay = 1000;
    const numberOfSyncs = 10;
    let iteration = 0;
    let delta = 0;
    let latencies = [];

    this.sync = function() {
      sendMessage("syncClock", {
        currentClientTime: this.getCurrentTime(),
        iteration,
      });
    };
    
    this.handlePacket = function(packet) {
      const currentTime = this.getCurrentTime();
      const latency = (currentTime - packet.currentClientTime) / 2;

      if (packet.iteration === 0) {
        // const newDelta = packet.currentServerTime - currentTime + latency;
        // delta = newDelta;
      }
      else {
        latencies.push(latency);
        // if (latencies.length >= 3) {
        //   latencies.sort();
        //   const median = getMedian(latencies);
        //   const sd = getStandardDeviation(latencies);
        //   latencies = latencies.filter(l => Math.abs(l - median) < sd);
        // }
      }

      if (packet.iteration >= numberOfSyncs - 1) {
        const averageLatency = getAverage(latencies);
        const newDelta = packet.currentServerTime - currentTime + averageLatency;
        delta = newDelta;
        console.log(delta);
        return;
      }

      setTimeout(() => {
        iteration++;
        this.sync();
      }, resendDelay);
    };

    this.getCurrentTime = function() {
      return new Date().valueOf() + delta;
    };

    function getAverage(list) {
      return list.reduce((a, b) => a + b) / list.length;
    }
    
    function getMedian(list) {
      if (list.length % 2 === 0) {
        const i = list.length / 2;
        return (list[i] + list[i + 1]) / 2;
      }

      return list[Math.floor(list.length / 2)];
    }

    function getStandardDeviation(array) {
      const n = array.length;
      const mean = array.reduce((a, b) => a + b) / n;
      return Math.sqrt(array.map(x => Math.pow(x - mean, 2)).reduce((a, b) => a + b) / n);
    }
  }
  
  function createTextTexture(text, size = 256) {
    var canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    var ctx = canvas.getContext("2d");
  
    ctx.fillStyle = "rgba(0, 0, 0, 0.85)";
    ctx.fillRect(0, canvas.height / 2 - 30, canvas.width, 60);
  
    ctx.fillStyle = "white";
    ctx.font = "800 50px Arial";
    let textSize = ctx.measureText(text);
  
    var fontSize = Math.min(50, 0.9 * size / textSize.width * 50);
    ctx.font = "800 " + fontSize + "px Arial";
    textSize = ctx.measureText(text);
  
    ctx.fillText(text, canvas.width / 2 - textSize.width / 2, canvas.height / 2 + textSize.actualBoundingBoxAscent / 2);
  
    return renderer.loadTexture(canvas.toDataURL());
  }
  
  window.showKillAlert = showKillAlert;
  var killAlertTimeout;
  function showKillAlert(player, special = "") {
    killAlertPlayer.innerText = "You killed " + player;
    killAlertSpecial.innerText = special;
    showElement(killAlert);
  
    resetAnimations(killAlert.querySelector("img"));
  
    clearTimeout(killAlertTimeout);
    killAlertTimeout = setTimeout(function() {
      fadeOutElement(killAlert);
    }, 2000);
  }
  
  window.flashButton = function(element) {
    element.classList.remove("flashButton");
    setTimeout(function() {
      element.classList.add("flashButton");
    });
  };
  
  // window.openLoadout = function() {
  //   showElement(loadoutUI);
  //   hideElement(lobbyUI);
  // }
  
  // window.closeLoadout = function() {
  //   hideElement(loadoutUI);
  //   showElement(lobbyUI);
  // }
  
  async function setupWeapons() {
    setLoadingStatus("Loading weapons");
  
    const oldLoadTextures = renderer.settings.loadTextures;
    renderer.settings.loadTextures = false;
    var weaponModels = {
      AK12: await renderer.loadGLTF("../assets/models/weapons/AK12.glb"),
      sniper: await renderer.loadGLTF("../assets/models/weapons/sniperLowpoly.glb"),
      shotgun: await renderer.loadGLTF("../assets/models/weapons/shotgun.glb"),

      glock: await renderer.loadGLTF("../assets/models/weapons/glock.glb"),
      // "1911": await renderer.loadGLTF("../assets/models/weapons/1911.glb"),
      // pistol: await renderer.loadGLTF("../assets/models/weapons/pistolSuppressor.glb"),
  
      // ak47: scene.add(await renderer.loadGLTF("../assets/models/ak47Hands.glb", { loadMaterials: true, maxTextureSize: 256, gameObjectOptions: {castShadows: false}})),
      // sks: scene.add(await renderer.loadGLTF("../assets/models/sks.glb", { loadMaterials: false, gameObjectOptions: {castShadows: false}}))
      // LMG: await renderer.loadGLTF("../assets/models/weapons/LMG.glb"),
    };
    renderer.settings.loadTextures = oldLoadTextures;
  
    for (const key in weaponModels) {
      const w = weaponModels[key];
  
      scene.add(w);
      // scene.add(renderer.BatchGameObject(w));

      w.setLayer(0b10, true);
      w.visible = false;
      w.setReceiveShadows(false, true);
      w.castShadows = false;
  
      // Red dot
      const s = w.getChild("Reddot", true);
      if (s) {
        s.meshRenderer.materials[0] = reddotMaterial;
      }
    }
  
    // Shotgun settings
    // weaponModels.shotgun.transform.rotation = Quaternion.euler(0, Math.PI, 0);
    weaponModels.shotgun.animationController.speed = 0;// 2.5;
 
    // Glock settings
    weaponModels.glock.animationController.getAnimations(/Fire/).forEach(a => a.speed = 2);

    // Pistol settings
    // for (var animation of weaponModels.pistol.animationController.animations) {
    //   if (animation.name.indexOf("Reload") != -1) {
    //     animation.speed = 0.9;
    //   }
    //   else if (animation.name.indexOf("Fire") != -1) {
    //     animation.speed = 2;
    //   }
    // }
  
    // // AK12 settings
    // weaponModels.AK12.transform.scale = Vector.fill(1 / 20);
  
    // AK-47 settings
    // var ak47 = weaponModels.ak47;
    // ak47.children[0].transform.rotation = Quaternion.euler(0, Math.PI, 0);
    // ak47.transform.scale = Vector.fill(2 / 20);
    // ak47.animationController.speed = 2.5;
  
    /*
      Weapon settings
    */
    var scopes = {
      reddot: new Scope({
        ADSFOV: 30,
        ADSMouseSensitivity: 0.8,
  
        ADSWeaponFOV: 12
      }),
  
      sniper: new Scope({
        sniperScope: true,
        ADSFOV: 8.5,
        ADSMouseSensitivity: 0.2
      }),
    };
  
    var weapons = {
      AK12: () => {
        var w = createWeapon({
          weaponObject: weaponModels.AK12,
          scope: scopes.reddot,
          weaponModelOffset: new Vector(-0.2, 0.12, 0.3),
          weaponModelADSOffset: new Vector(0, 0, -0.15),
          bulletDamage: 26,
          reloadTime: 1500,
          magSize: 30,
          fireMode: WEAPONENUMS.FIREMODES.AUTO,
          roundsPerSecond: 10,
          fireSound: "../assets/sound/AK12/fire.wav",
          recoil: function() {
            var m = (1 - player.crouching * 0.5);
            return {
              x: -1.1 * m,
              y: (Math.random() - 0.5) * 0.5 * m,
              z: (Math.random() - 0.5) * 0.5 * m
            };
          }
        });
        w.name = "AK12";
  
        // w.modelRecoil.fireForce.y = 0.1;
        // w.modelRecoil.fireTorque.x = 3;
  
        // w.modelRecoil.fireForce = new Vector(0, 0, 4);
        // w.modelRecoil.fireTorque = Vector.zero();
        // w.modelRecoil.fireTorque.z = 3;
  
        w.modelRecoil.fireTorque = () => new Vector(2, 0.1 * 10 /* does nothing? */, (Math.random() - 0.5) * 2);
  
        return w;
      },
      glock: () => {
        var w = createWeapon({
          weaponObject: weaponModels.glock,
          bulletDamage: 15,
          reloadTime: 1200,
          roundsPerSecond: 16,
          bulletSpread: 0.02,
          fireSoundBufferSize: 20,
          weaponModelOffset: new Vector(-0.1, 0.1, -0.1),
        });
        w.name = "Glock";
  
        w.scope.ADSWepaonFOV = 32;

        w.modelRecoil.fireForce = new Vector(0, 0, 2);
        w.modelRecoil.fireTorque = new Vector(3, 0, 0);
  
        return w;
      },
      pistol: () => {
        var w = createWeapon({
          weaponObject: weaponModels.pistol,
          reloadTime: 1200,
          weaponModelOffset: new Vector(-0.2, 0.1, 0.25),
          weaponModelADSOffset: new Vector(0, -0.08, -0.2)
        });
        w.name = "Pistol";
  
        w.scope.ADSWepaonFOV = 32;
        w.modelRecoil.fireForce = Vector.zero();
        w.modelRecoil.fireTorque = Vector.zero();
  
        return w;
      },
      autoPistol: () => {
        var w = createWeapon({
          weaponObject: weaponModels.pistol,
          reloadTime: 1200,
          weaponModelOffset: new Vector(-0.2, 0.1, 0.25),
          weaponModelADSOffset: new Vector(0, -0.08, -0.2),
          fireMode: WEAPONENUMS.FIREMODES.AUTO,
          roundsPerSecond: 18,
          bulletSpread: 0.025
        });
        w.name = "Auto pistol";
  
        w.scope.ADSWepaonFOV = 32;
        w.modelRecoil.fireForce = Vector.zero();
        w.modelRecoil.fireTorque = Vector.zero();
  
        return w;
      },
      "1911": () => {
        var w = createWeapon({
          scope: scopes.reddot,
          weaponObject: weaponModels["1911"],
          reloadTime: 1000,
          weaponModelOffset: new Vector(-0.2, 0.1, 0.25),
          weaponModelADSOffset: new Vector(0, 0, -0.62),
        });
        w.name = "Pistol";
  
        w.modelRecoil.fireForce = new Vector(0, 0, 2);
        w.modelRecoil.fireTorque = new Vector(4, 0, 0);
  
        return w;
      },
      sniper: () => {
        var w = createWeapon({
          weaponObject: weaponModels.sniper,
          weaponModelOffset: new Vector(-0.1, 0.1, 0.2), 
          scope: scopes.sniper,
          roundsPerSecond: 1,
          magSize: 5,
          reloadTime: 1500,
          bulletDamage: 70,
          fireMode: WEAPONENUMS.FIREMODES.SINGLE,
          fireSoundBufferSize: 3,
          fireSound: "../assets/sound/sniper/fire.wav",
          recoil: function() {
            return {x: -1.5, y: (Math.random() - 0.5) * 0.1, z: 0};
          }
        });
        w.name = "Sniper";
  
        w.modelRecoil.fireForce.z = 10;
        w.modelRecoil.translationReturn = -200;
        w.modelRecoil.translationDamping = -20;
  
        w.modelRecoil.fireTorque.x = 5;
        w.modelRecoil.rotationDamping = -15;
        w.modelRecoil.rotationReturn = -60;
        return w;
      },
      shotgun: () => {
        var w = createWeapon({
          weaponObject: weaponModels.shotgun,
          weaponModelOffset: {x: -0.2, y: 0.1, z: 0.25},
          reloadTime: 400,
          magSize: 6,
          roundsPerSecond: 2,
          bulletsPerShot: 10,
          bulletSpread: 0.02,
          ADSBulletSpread: 1,
          crosshairType: 1,
          sequentialReloading: true,
          bulletDamage: 10,
          recoil: function() {
            return {x: -5, y: (Math.random() - 0.5) * 0.2, z: 0};
          },
          fireSound: "../assets/sound/shotgun/fire.wav",
          reloadSound: "../assets/sound/shotgun/insertShell.wav",
          doneReloadingSound: "../assets/sound/shotgun/reloadEnd.wav"
        });
        w.name = "Shotgun";
  
        w.modelRecoil.fireForce = new Vector(0, 0.25, 6);
        w.modelRecoil.fireTorque = new Vector(1, 0, 0);
        // w.modelRecoil.fireForce = Vector.zero();
        // w.modelRecoil.fireTorque = Vector.zero();
  
        return w;
      },
  
      ak47: () => {
        let w = createWeapon({
          weaponObject: weaponModels.ak47,
          scope: scopes.reddot,
          // ADSFOV: 30,
          // ADSMouseSensitivity: 0.8,
          weaponModelOffset: new Vector(-0.2, 0.22, 0.5),
          weaponModelADSOffset: Vector.zero(),
          reloadTime: 2700,
          magSize: 30,
          fireMode: WEAPONENUMS.FIREMODES.AUTO,
          roundsPerSecond: 10,
          recoil: function() {
            return {x: -1.2, y: (Math.random() - 0.5) * 1, z: 0};
          }
        });
        
        return w;
      },
  
      LMG: () => {
        var w = createWeapon({
          weaponObject: weaponModels.LMG,
          scope: scopes.reddot,
          weaponModelOffset: new Vector(-0.2, 0.12, 0.3),
          weaponModelADSOffset: new Vector(0, 0, -0.15),
          bulletDamage: 26,
          reloadTime: 3000,
          magSize: 150,
          fireMode: WEAPONENUMS.FIREMODES.AUTO,
          roundsPerSecond: 16,
          ADSSpeed: 0.08,
          fireSound: "../assets/sound/AK12/fire.wav",
          recoil: function() {
            var m = (1 - player.crouching * 0.5);
            return {
              x: -1.5 * m,
              y: (Math.random() - 0.5) * 1 * m,
              z: 0
            };
          }
        });
        w.name = "LMG";
  
        // w.modelRecoil.fireForce.y = 0.1;
        // w.modelRecoil.fireTorque.x = 3;
  
        // w.modelRecoil.fireForce = new Vector(0, 0, 4);
        // w.modelRecoil.fireTorque = Vector.zero();
        // w.modelRecoil.fireTorque.z = 3;
  
        return w;
      },
  
      // overpowered: () => new Weapon({weaponObject: pistolGameObject, roundsPerSecond: 1000, magSize: 5000, fireMode: WEAPONENUMS.FIREMODES.AUTO, recoil: function() {
      //   return Vector.zero();
      // }}),
    };
  
    classes = {
      AR: {
        name: "AR",
        weapons: [
          weapons.AK12(),
          weapons.glock(),
        ]
      },
      sniper: {
        name: "Sniper",
        weapons: [
          weapons.sniper(),
          weapons.glock(),
        ],
      },
      shotgun: {
        name: "Shotgun",
        weapons: [
          weapons.shotgun(),
          weapons.glock(),
        ]
      },
    };
  
    selectedClass = getSavedSelectedClass();
  
    for (let key in classes) {
      let button = document.createElement("button");
      button.setAttribute("data-className", key);
      button.innerText = classes[key].name;
      button.onclick = () => {
        updateClassPreview(button);
      };
  
      loadoutUI.querySelector(".classSelect").appendChild(button);
    }
  
    updateClassPreview(selectedClass);

    return {
      weaponModels,
      weapons
    };
  }
  
  function createWeapon(settings) {
    var w = new Weapon({
      ...settings,
      audioHandler
    });
    w.player = player;
    w.hitEffect = bulletHitEffect;
  
    return w;
  }

  function bulletHitEffect(hit) {
    // Create bullethole
    const mat =  Matrix.lookAt(Vector.add(hit.point, Vector.multiply(hit.normal, 0.0001 + Math.random() * 0.005)), Vector.subtract(hit.point, hit.normal), Vector.normalize({x: 1, y: 0.1, z: 0}));
    Matrix.transform([
      ["scale", Vector.fill(0.05)],
      ["rz", Math.random() * 2 * Math.PI]
    ], mat);

    const currentInstance = bulletHoles.meshRenderer.addInstance(mat);

    setTimeout((function(inst) {
      return function() {
        bulletHoles.meshRenderer.removeInstance(inst);
      };
    })(currentInstance), 15000);

    // Hit particles
    emitHitParticles(hit);
  }
  
  function emitHitParticles(hit) {
    let [ tangent, bitangent ] = Vector.formOrthogonalBasis(hit.normal);
    let basis = Matrix.basis(tangent, bitangent, hit.normal);
  
    sparks.emitVelocity = (dst) => {
      let v = new Vector((Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3, 6 * Math.random());
      Vector.set(dst, Matrix.transformVector(basis, v));
    };
    sparks.emitPosition = (dst) => Vector.set(dst, hit.point);
    sparks.emit(10);
  
    rocks.emitVelocity = dst => {
      let v = new Vector(
        (Math.random() - 0.5) * 2,
        (Math.random() - 0.5) * 2,
        1 + 3 * Math.random(),
      );
      Vector.set(dst, Matrix.transformVector(basis, v));
    };
    rocks.emitPosition = (dst) => Vector.set(dst, hit.point);
    rocks.emit(10);
  }
  
  window.renderWeaponIcons = async () => {
    renderer.setActiveScene(scene);

    var whiteMat = new NewMaterial(renderer.programContainers.unlit);
    whiteMat.setUniform("albedo", [1, 1, 1, 1]);
  
    scene.skyboxVisible = false;
    renderer.setClearColor(0, 0, 0, 0);
    renderer.setCanvasSize(256, 256);
    renderer.settings.enableBloom = false;
    renderer.settings.enablePostProcessing = false;
  
    var camera = new Camera({near: 0.01, far: 300, layer: 0b100, fov: 10});
    camera.transform.matrix = Matrix.lookAt(new Vector(3.5, 0, 0), Vector.zero());
    camera.setAspect(renderer.aspect);
  
    var weaponModels = {
      // glock: scene.add(await renderer.loadGLTF("../assets/models/weapons/glock.glb", {gameObjectOptions: {castShadows: false}})),
      // pistol: scene.add(await renderer.loadGLTF("../assets/models/weapons/pistolSuppressor.glb", {gameObjectOptions: {castShadows: false}})),
      // AK12: scene.add(await renderer.loadGLTF("../assets/models/weapons/AK12.glb", { gameObjectOptions: {castShadows: false}})),
      sniper: scene.add(renderer.BatchGameObject(await renderer.loadGLTF("../assets/models/weapons/sniperLowpoly.glb", {gameObjectOptions: {castShadows: false}}))),
      // shotgun: scene.add(await renderer.loadGLTF("../assets/models/weapons/shotgun.glb", {gameObjectOptions: {castShadows: false}})),
      // LMG: scene.add(await renderer.loadGLTF("../assets/models/weapons/LMG.glb", {gameObjectOptions: {castShadows: false}})),
    };
  
    for (let key in weaponModels) {
      let weapon = weaponModels[key];
      weapon.visible = false;
    }
  
    // weaponModels.AK12.transform.scale = Vector.fill(1 / 20);
  
    for (let key in weaponModels) {
      // var key = Object.keys(weaponModels)[0];
      var weapon = weaponModels[key];
      weapon.setLayer(0b100, true);
      weapon.visible = true;
  
      var aabb = GetMeshAABB(weapon);
      var s = 1 / aabb.getSize().z;
      weapon.transform.scale = Vector.multiply(weapon.transform.scale, s);
      weapon.transform.position = Vector.negate(Vector.multiply(aabb.getCenter(), s));
      aabb.translate(weapon.transform.position);
  
      weapon.traverse(o => {
        if (o.meshRenderer) {
          for (var ind in o.meshRenderer.materials) {
            o.meshRenderer.materials[ind] = whiteMat;
          }
        }
      });
  
      renderer.render(camera);
      renderer.saveCanvasAsImage(key);
  
      weapon.visible = false;
    }
  };
  
  function getSavedSelectedClass() {
    var l = localStorage.getItem(LS_SELECTEDCLASS);
    if (l) {
      return l;
    }
  
    if (!classes) {
      return;
    }
  
    return Object.keys(classes)[0];
  }
  
  function selectClass(name) {
    if (name in classes) {
      selectedClass = name;
      player.setWeapons(classes[name].weapons);
      localStorage.setItem(LS_SELECTEDCLASS, name);
      updateSelectClassButton();
  
      return;
    }
  
    console.error("Not a valid class!", name);
  }
  
  function updateClassPreview(buttonOrName) {
    var className = buttonOrName instanceof HTMLElement ? buttonOrName.getAttribute("data-className") : buttonOrName;
    var clss = classes[className];

    document.querySelectorAll("button[data-className]").forEach(e => e.classList.remove("classIsFocused"));
    document.querySelector(`button[data-className=${className}]`).classList.add("classIsFocused");
  
    loadoutUI.querySelector(".className").innerText = clss.name;
  
    selectClassButton.setAttribute("data-targetClass", className);
    updateSelectClassButton();
  
    for (var i = 0; i < clss.weapons.length; i++) {
      var weapon = clss.weapons[i];
      var div = createWeaponStatDiv(weapon);
      var slot = document.querySelectorAll(".classContainer .slot")[i];
      if (slot) {
        if (slot.childElementCount > 1) {
          slot.removeChild(slot.lastElementChild);
        }
        slot.appendChild(div);
      }
    }

    switchInspectedWeapon(clss.weapons[0].name);
  }
  
  function createWeaponStatDiv(weapon) {
    var weaponTemplate = document.querySelector("#weaponTemplate");
    var weaponElement = cloneTemplate(weaponTemplate);
  
    weaponElement.querySelector(".weaponTitle").textContent = weapon.name;
    weaponElement.querySelector(".weaponImage").src = `../assets/textures/weaponIcons/${weapon.name}.png`;
    
    weaponElement.querySelector(".reloadTimeStat").textContent = roundToPlaces(weapon.reloadTime / 1000, 2);
    weaponElement.querySelector(".magSizeStat").textContent = weapon.magSize;
    weaponElement.querySelector(".damageStat").textContent = weapon.bulletDamage;
    weaponElement.querySelector(".firerateStat").textContent = weapon.roundsPerSecond;
  
    return weaponElement;
  }
  
  function updateSelectClassButton() {
    if (selectedClass == selectClassButton.getAttribute("data-targetClass")) {
      selectClassButton.classList.add("classIsSelected");
    }
    else {
      selectClassButton.classList.remove("classIsSelected");
    }
  
    for (var elm of document.querySelectorAll(".classSelect > button")) {
      elm.classList.remove("classIsSelected");
    }
  
    var button = document.querySelector(`.classSelect > button[data-className=${selectedClass}]`);
    button.classList.add("classIsSelected");
  }
  
  // WebSocket
  
  async function setupWebsocket(url) {
    setLoadingStatus("Connecting");
  
    return new Promise((resolve) => {
      try {
        if (url) {
          ws = new WebSocket(url);
        }
        else {
          // ws = new WebSocket("wss://192.168.181.117:8080");
          // ws = new WebSocket(`ws://${location.hostname}:8080`);
          ws = new WebSocket(`wss://${location.hostname}:8080`);
        }
    
        ws.onopen = function() {
          console.log("Connected to server");
          sendMessage("login", { username: localStorage.getItem(LS_USERNAME) });
          resolve(true);
        };
    
        ws.onerror = async function() {
          if (!url) {
            console.warn("Connection error, trying again...");
            const status = await setupWebsocket(`ws://${location.hostname}:8080`);
            resolve(status);
          }
          else {
            console.error("Connection error, aborting!");
            displayError("Could not connect");
            resolve(false);
          }
        };
    
        // ws.onclose = function() {
        //   displayError("Disconnected");
        //   resolve(false);
        // };
    
        ws.onmessage = websocketOnMessage;
      }
      catch (e) {
        console.warn("Failed to construct WebSocket!");
        console.error(e);
        displayError("Could not connect");
        resolve(false);
      }
    });
  }
  
  function websocketTick() {
    sendMessage("inputs", inputsToSend);
    inputsToSend = [];
  
    sendMessage("getAllPlayers");
  
    // if (wsIsOpen(ws)) {
    //   sendMessage("actionQueue", {
    //     id: oldActionQueues.length,
    //     actionQueue
    //   });
    //   oldActionQueues.push(actionQueue);
    //   actionQueue = [];
  
    //   // if (player) {
    //   //   sendMessage("updatePlayer", {
    //   //     position: player.position,
    //   //     angle: player.getHeadRotation().y
    //   //   });
    //   // }
    //   sendMessage("getAllPlayers");
    // }
  }
  
  function wsIsOpen(ws) {
    return ws && ws.readyState == ws.OPEN;
  }
  
  function sendMessage(type, data = null) {
    if (wsIsOpen(ws)) {
      ws.send(JSON.stringify({
        type: type,
        data: data,
        clientSendTime: syncedClock.getCurrentTime()
      }));
    }
  }
  
  function websocketOnMessage(msg) {
    setTimeout(function() {
      var parsed;
      try {
        parsed = JSON.parse(msg.data);
      }
      catch(e) {
        return;
      }
  
      if (parsed.clientSendTime) {
        var ping = syncedClock.getCurrentTime() - new Date(parsed.clientSendTime);
        latencies.push(ping);
        if (latencies.length > 50) {
          latencies.shift();
        }
      }
  
      if (Object.prototype.hasOwnProperty.call(parsed, "type") && Object.prototype.hasOwnProperty.call(parsed, "data")) {
        //console.log(parsed);
  
        if (parsed.type == "ping") {
          console.log(parsed.data);
        }
        else if (parsed.type == "syncClock") {
          syncedClock.handlePacket(parsed.data);
        }
        else if (parsed.type == "login") {
          if (parsed.data.status == "success") {
            console.log("Logged in!");
  
            player.loginResponse(parsed.data);
  
            // setup();
          }
          else {
            console.error("Error loggin in!");
          }
        }
        else if (parsed.type == "deploy") {
          if (parsed.data.status == "success") {
            player.state = player.STATES.PLAYING;
            player.position = parsed.data.position;
            Vector.zero(player.velocity);

            player.switchWeapon(0);
            for (const weapon of player.weapons) {
              weapon.reset();
            }
  
            // Player name can change before deploying
            player.setName(parsed.data.name);
          }
          else {
            console.error("Could not deploy!");
            lobbyUI.querySelector(".navigation").classList.remove("slideOut");
          }
        }
        // else if (parsed.type == "deployOther") {
        //   var m = multiplayerCharacters[parsed.data.clientID];
        //   if (m) {
        //     m.enemy.respawn(parsed.data.position);
        //   }
        // }
        else if (parsed.type == "gotoLobby") {
          player.gotoLobby();
        }
        else if (parsed.type == "playerAction") {
          // console.log(parsed);
          if (parsed.data.action == "joined") {
            console.log(parsed.data.clientID + " has joined!");
            killfeed.addItem({
              message: `${parsed.data.clientID} has joined!`
            });
          }
          else if (parsed.data.action == "left") {
            const m = multiplayerCharacters[parsed.data.clientID];
            if (m) {
              m.onLeave();
              delete multiplayerCharacters[parsed.data.clientID];
            }
          }
          else if (parsed.data.action == "fireWeapon") {
            const trailPos = parsed.data.trailOrigin;
            const direction = parsed.data.trailDirection;
            const trailVel = parsed.data.trailVelocity;
            const trail = new BulletTrail(trailPos, trailVel, direction);
            trail.health = parsed.data.trailHealth;
            bulletTrails.push(trail);
            
            const m = multiplayerCharacters[parsed.data.clientID];
            m.playFireSound(parsed.data.trailOrigin);
          }
          else if (parsed.data.action == "hitEffect") {
            bulletHitEffect(parsed.data.hit);
          }
          else if (parsed.data.action == "takeDamage") {
            if (parsed.data.targetClientId === player.id) {
              if (Vector.isVectorIsh(parsed.data.position)) {
                hitDirectionIndicator.indicate(parsed.data.position, parsed.data.damage / 30);
              }
              player.health -= parsed.data.damage;
            }
          }
        }
        else if (parsed.type == "killPlayer") {
          // I died
          if (parsed.data.killed == player.id) {
            player.killedBy = parsed.data.killer;
            player.die();
          }
  
          // I killed someone
          if (parsed.data.killer === player.id) {
            player.enemyKilled({
              name: getPlayerNameByID(parsed.data.killed)
            });
          }
  
          // Announce every kill
          killfeed.addItem({
            killer: getPlayerNameByID(parsed.data.killer),
            killed: getPlayerNameByID(parsed.data.killed),
            isHeadshot: parsed.data.killEffects.isHeadshot,
          });

          // Update killer and killed leaderbord
          leaderboard.setPlayerStat(getPlayerNameByID(parsed.data.killer), ".kills", parsed.data.killerKills);
          leaderboard.setPlayerStat(getPlayerNameByID(parsed.data.killer), ".deaths", parsed.data.killerDeaths);

          leaderboard.setPlayerStat(getPlayerNameByID(parsed.data.killed), ".kills", parsed.data.killedKills);
          leaderboard.setPlayerStat(getPlayerNameByID(parsed.data.killed), ".deaths", parsed.data.killedDeaths);
        }
        else if (parsed.type == "getAllPlayers") {
          //if (!snapshotHistory[snapshotHistory.length - 1] || new Date(parsed.timestamp) > snapshotHistory[snapshotHistory.length - 1].serverTimestamp) {
          // parsed.serverTimestamp = new Date(parsed.serverTimestamp);
          // parsed.timestamp = new Date();
  
          for (const entity of parsed.data) {
            const found = (
              multiplayerCharacters[entity.id] ||
              createMultiplayerCharacter(entity)
            );

            if (!found) {
              continue;
            }
  
            // Name can change
            found.name = entity.name;
            leaderboard.setItem(found.leaderboardEntry, ".name", found.name);

            const t = entity.data.localUpdatedTime ?? parsed.serverTimestamp;
            found.addSnapshot({
              // timestamp: parsed.serverTimestamp,
              // serverTimestamp: new Date(parsed.serverTimestamp),
              // rawTimestamp: t,
              timestamp: new Date(t).valueOf(),
              data: entity.data
            });
          }
          //}
        }
        else if (parsed.type == "getSelf") {
          const dt = physicsEngine.dt;
  
          const playerCopy = new PlayerPhysicsBase(player.startPosition);
          playerCopy.physicsEngine = physicsEngine;
          playerCopy.position = {...parsed.data.gameData.position};
          playerCopy.velocity = {...parsed.data.gameData.velocity};
          playerCopy.grounded = parsed.data.gameData.grounded;
          playerCopy.crouching = parsed.data.gameData.crouching;
  
          playerCopy.groundCounter = parsed.data.gameData.groundCounter;
          playerCopy.jumpCounter = parsed.data.gameData.jumpCounter;
          playerCopy.lastJumpInput = parsed.data.gameData.lastJumpInput;
          playerCopy.fakeGroundNormal = {...parsed.data.gameData.fakeGroundNormal};
          playerCopy.realGroundNormal = {...parsed.data.gameData.realGroundNormal};
  
          const positionError = Vector.distanceSqr(stateBuffer[parsed.data.lastProcessedTick].position, playerCopy.position);
          const error = 0.005;
          if (positionError > error * error) {
            for (let rewindTick = parsed.data.lastProcessedTick + 1; rewindTick < tick; rewindTick++) {
              const inputs = inputBuffer[rewindTick];
  
              stateBuffer[rewindTick].position = playerCopy.position;
              stateBuffer[rewindTick].velocity = playerCopy.velocity;
  
              if (inputs.rotation) {
                playerCopy.rotation.y = inputs.rotation.y;
              }
              if (inputs.inputs) {
                playerCopy.applyInputs(inputs.inputs, dt);
              }

              playerCopy.simulatePhysicsStep(dt);
            }
  
            const smoothing = false;
            if (smoothing && positionError < 2) {
              player.position = Vector.lerp(player.position, playerCopy.position, 0.5);
            }
            else {
              player.position = playerCopy.position;
            }
  
            player.velocity = playerCopy.velocity;
            player.grounded = playerCopy.grounded;
          }
        }
        else if (parsed.type == "hit") {
          console.log("I got hit by " + parsed.data.by);
        }
      }
    }, SIMULATED_PING());
  }

  function displayError(message) {
    loadingStatus.textContent = message;
    showElement(loadingScreen);
    showElement(loadingStatus);
    hideElement(loadingTitle);
    hideElement(lobbyUI);
    hideElement(deathScreen);
    hideElement(gameUI);
    hideElement(aliveScreen);
    
    running = false;
    renderer.unlockPointer();
    ws.close();
  }
  
  function getPlayerNameByID(id) {
    if (multiplayerCharacters[id]) {
      return multiplayerCharacters[id].name;
    }
    else if (player.id == id) {
      return player.name;
    }
  }
  //
  
  function SetupEvents() {
    setLoadingStatus("Creating DOM events");

    // Ask user before closing page
    window.onbeforeunload = function() {
      if (player.isPlaying) {
        return true;
      }
    };
  
    window.addEventListener("mousedown", function() {
      audioHandler.resume();
      audioListener.audioContext.resume();
    });
  
    renderer.on("mousedown", function(e) {
      if (running && player) {
        if (player.isPlaying) {
          renderer.lockPointer();
        }
  
        // if (renderer.isPointerLocked()) {
        //   switch (e.button) {
        //     // case 0:
        //       // mouse.left = true;
        //       // player.Fire();
        //       // break;
        //     // case 2:
        //     //   if (player.isPlaying && player.getCurrentWeapon()) {
        //     //     player.getCurrentWeapon().ADS();
        //     //   }
        //     //   break;
        //   }
        // }
  
        if (e.button == 1) {
          e.preventDefault();
          return false;
        }
  
        // Breaks in iframe
        //e.preventDefault();
      }
    });
  
    renderer.gl.canvas.addEventListener("contextmenu", event => event.preventDefault());
  
    // renderer.on("mouseup", function(e) {
    //   if (running) {
    //     switch (e.button) {
    //       // case 0:
    //       //   mouse.left = false;
    //       //   break;
    //       // case 2:
    //       //   if (player && player.isPlaying && player.getCurrentWeapon()) {
    //       //     player.getCurrentWeapon().unADS();
    //       //   }
    //       //   break;
    //     }
    //   }
    // });
  
    var lastMovement = {x: 0, y: 0};
  
    renderer.on("mousemove", function(e) {
      if (running && player && player.isPlaying && renderer.isPointerLocked()) {
        var currentWeapon = player.getCurrentWeapon();
        var weaponSens = currentWeapon ? currentWeapon.getCurrentSensitivity() : 1;
  
        // Try to remove mouse spike in chrome
        if (!(Math.abs(lastMovement.x - e.movementX) > 300 || Math.abs(lastMovement.y - e.movementY) > 300)) {
          player.rotation.x += e.movementY * 0.002 * weaponSens;
          player.rotation.y += e.movementX * 0.002 * weaponSens;
          player.clampRotation();
        }
  
        lastMovement.x = e.movementX;
        lastMovement.y = e.movementY;
  
        mouse.movementX += (e.movementX - mouse.movementX) * 0.3;
        mouse.movementY += (e.movementY - mouse.movementY) * 0.3;
      }
    });
  
    renderer.on("keydown", function(e) {
      if (!running) {
        return;
      }

      if (player && player.isPlaying) {
        if (player.getCurrentWeapon() && e.keyCode == 82) {
          player.getCurrentWeapon().reload();
        }

        if (e.keyCode >= 49 && e.keyCode <= 57) {
          player.switchWeapon(e.keyCode - 49);
        }

        if (e.keyCode === 116) { // F5
          e.preventDefault();
        }
      }

      if (player && player.state == player.STATES.IN_LOBBY) {
        if (e.keyCode == 32) { // Space
          deployButton.click();
        }
        if (e.keyCode == 27) { // Esc
          lobbyTabs[0].checked = true;
          // closeLoadout();
        }
      }

      if (e.keyCode == 9) { // Tab
        leaderboard.show();
        e.preventDefault();
      }
    });
  
    renderer.on("keyup", function(e) {
      if (running) {
        if (e.keyCode == 9) { // Tab
          leaderboard.hide();
        }
      }
    });
  
    var canScroll = true;
  
    document.onwheel = function(e) {
      if (running) {
        if (player && player.isPlaying && canScroll) {
          var next = wrap(player.currentWeapon + Math.sign(e.deltaY), player.weapons.length);
          player.switchWeapon(next);
  
          canScroll = false;
          setTimeout(function() {
            canScroll = true;
          }, 200);
        }
      }
    };
  }
  
  function AudioHandler() {
    let audioContext = new AudioContext();
  
    let masterVolume = audioContext.createGain();
    masterVolume.gain.value = 1;
    masterVolume.connect(audioContext.destination);
  
    this.setMasterVolume = function(volume) {
      masterVolume.gain.value = volume;
    };
  
    this.resume = function() {
      audioContext.resume();
    };
  
    this.getAudioContext = function() {
      return audioContext;
    };
  
    this.connect = function(source) {
      source.connect(masterVolume);
    };
  }

  function setLoadingStatus(text) {
    currentLoadingStatus++;
    loadingStatus.textContent = `(${currentLoadingStatus}/${totalLoadingStatus}) ${text}`;
  }
})();

/* Debug */

// if (false) {
//   var counters = {};
//   for (var i in gl) {
//     if (typeof gl[i] == "function") {
//       var functionMaker = function(i) {
//         var oldFn = gl[i].bind(gl);

//         return function() {
//           if (!counters[i]) {
//             counters[i] = {
//               nrCalls: 0,
//               lines: {}
//             }
//           }
//           counters[i].nrCalls++;

//           // var lineNumber = getLineNumber();
          
//           // if (!counters[i].lines[lineNumber]) {
//           //   counters[i].lines[lineNumber] = 0;
//           // }
//           // counters[i].lines[lineNumber]++;  

//           return oldFn.apply(gl, arguments);
//         }
//       }

//       gl[i] = functionMaker(i);
//     }
//   }

//   window.printCounters = function() {
//     // for (var key in counters) {
//     //   var c = counters[key];
//     //   var output = key + ": " + c.nrCalls + " - ";
//     //   // for (var lineKey in c.lines) {
//     //   //   output += lineKey + ": " + c.lines[lineKey] + " - ";
//     //   // }
//     //   console.log(output, c.lines);
//     // }

//     console.table(counters);
//   }

//   function getLineNumber() {
//     function getErrorObject(){
//       try { throw Error('') } catch(err) { return err; }
//     }

//     var err = getErrorObject();
//     var split = err.stack.split("\n");
//     var caller_line = split[split.length - 1];
//     var index = caller_line.indexOf(".js:");
//     var clean = caller_line.slice(index + 4, caller_line.indexOf(":", index + 5));

//     return clean;
//   }
// }

// var litParallax = new renderer.ProgramContainer(await renderer.createProgramFromFile("../assets/shaders/custom/webgl2/litParallax"));

// Enemies
// var e = new Enemy(scene.add(new GameObject("Enemy")));

// enemies.push(new Enemy(map.getChild("Target", true)));
// enemies.push(new Enemy(map.getChild("Target.001", true)));
// enemies.push(new Enemy(map.getChild("Target.002", true)));

// var dancingMonster = scene.add(await renderer.loadGLTF("../assets/models/dancingMonster.glb"));
// dancingMonster.animationController.loop = true;
// Matrix.transform([
//   ["translate", {x: 0, y: 0, z: 5}]
// ], dancingMonster.transform.matrix);

// var c = scene.add(dancingMonster.copy());
// c.animationController.speed = 0.5;
// Matrix.transform([
//   ["translate", {x: 3, y: 0, z: 0}],
//   ["scale", Vector.fill(1.5)]
// ], c.transform.matrix);

//colliders.push(new AABBCollider({x: -50, y: 0, z: -50}, {x: 50, y: 50, z: 50}, Matrix.identity(), true))

// // Reflection probe
// var oldSkybox = scene.skyboxCubemap;
// var cubemap = renderer.captureReflectionCubemap(new Vector(0, 6, 0));
// await scene.loadEnvironment({ cubemap });
// // scene.skyboxCubemap = oldSkybox;
// scene.environmentIntensity = 1;