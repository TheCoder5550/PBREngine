import Vector from "./engine/vector.mjs";
import Matrix from "./engine/matrix.mjs";
import Quaternion from "./engine/quaternion.mjs";
import { GameObject, FindMaterials, flyCamera } from "./engine/renderer.mjs";
import { Rigidbody, BoxCollider, AABB, GetMeshAABB, SphereCollider } from "./engine/physics.mjs";
import { clamp,  lerp } from "./engine/helper.mjs";
import Keybindings from "./keybindingsController.mjs";
import { Camera } from "./engine/renderer.mjs";

function Car(scene, physicsEngine, settings = {}) {
  var _this = this;
  var renderer = scene.renderer;
  var gamepadManager = new GamepadManager();
  var keybindings = this.keybindings = new Keybindings(renderer, gamepadManager, {
    "resetGame": {
      keyboard: "Escape",
      controller: "Menu"
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
    "resetCar": {
      keyboard: "KeyR",
      controller: "Menu"
    },
    "cameraMode": {
      keyboard: "KeyC",
      controller: "RB"
    }
  });

  var radPerSecToRPM = 30 / Math.PI;

  this.canMove = true;
  this.frozen = false;
  this.resetPosition = Vector.zero();

  this.cameraMode = 0;
  this.camera = {
    followDistance: 5,
    followHeight: 0.4,
    followSpeed: 0.05,
    pitch: 0.15,
    accelerationSpeed: 0.05,
    accelerationEffect: 0.3
  };
  var mainCamera = new Camera({position: new Vector(0, 0, -3), near: 0.1, far: 1000, fov: 35});
  this.mainCamera = mainCamera;
  var cameraFov = mainCamera.getFOV();
  var cameraEulerAngles = Vector.zero();
  var cameraCarForward = Vector.zero();
  var currentFollowDistance = this.camera.followDistance;

  var resizeEvent = () => {
    this.mainCamera.setAspect(renderer.aspect);
  }
  renderer.on("resize", resizeEvent);
  resizeEvent();

  this.engine = new Engine({
    torque: settings.torque
  });
  this.clutch = new Clutch();
  this.wheels = [];
  this.wings = settings.wings ?? [];

  this.drivetrain = settings.drivetrain ?? "RWD";

  this.currentGear = 1;
  this.gearRatios = settings.gearRatios ?? [2.66, 1.78, 1.3, 1, 0.74];
  this.reverseGearRatio = settings.reverseGearRatio ?? 2.9;
  this.allGearRatios = [this.reverseGearRatio, ...this.gearRatios];

  this.differentialRatio = settings.differentialRatio ?? 3.42;
  this.differentialType = settings.differential ?? Car.ENUMS.DIFFERENTIAL.OPEN;
  this.LSDFactor = settings.LSDFactor ?? 0.05;

  var activateAutoCountersteer = settings.activateAutoCountersteer ?? true;
  var autoCountersteerMinVel = 2;
  var autoCountersteer = 0.6;
  var autoCountersteerVelocityMultiplier = 0.2;

  this.steerSpeed = 0.05;
  this.steerVelocity = settings.steerVelocity ?? 50;//150;
  this.steerGamma = 2;

  var maxSteerAngle = settings.maxSteerAngle ?? 35;

  var ebrakeTorque = settings.ebrakeTorque ?? 4000;
  this.brakeTorque = settings.brakeTorque ?? 1600;//2000;
  this.ABS = settings.ABS ?? true;
  this.TCS = settings.TCS ?? false;
  this.antiRoll = settings.antiRoll ?? 7000;
  var rideHeightOffset = settings.rideHeightOffset ?? 0;

  this.controlScheme = settings.controlScheme ?? Car.ControlScheme.Keyboard;
  var steerInput = 0;
  var driveInput = 0;
  var brakeInput = 0;
  var ebrakeInput = 0;
  var clutchInput = 0;

  var carWorldMatrix = Matrix.identity();
  var inverseWorldMatrix = Matrix.identity();

  this.smokeTexture = "./assets/textures/smoke.png";
  this.skidAudioSource = "./cargame/skid.wav";

  window.addEventListener("click", () => {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    var context = new AudioContext();
    
    loadSample(context, this.skidAudioSource).then(sample => {
      var { source, gainNode } = playSample(context, sample);
      this.skidSource = source;
      this.skidGain = gainNode;
  
      gainNode.gain.value = 0;
    });
  }, { once: true });

  var lightMaterials = {};

  physicsEngine.on("fixedUpdate", (dt) => {
    this.fixedUpdate(dt);
  });

  this.freeze = function() {
    this.frozen = true;
    this.rb.frozen = true;
  }

  this.unfreeze = function() {
    this.frozen = false;
    this.rb.frozen = false;
  }

  this.getWheel = function(name) {
    if (name.toLowerCase() == "rr") {
      return this.wheels[0];
    }
    else if (name.toLowerCase() == "rl") {
      return this.wheels[1];
    }
    else if (name.toLowerCase() == "fr") {
      return this.wheels[2];
    }
    else if (name.toLowerCase() == "fl") {
      return this.wheels[3];
    }
  }

  function getWheelModels(parent) {
    return [
      parent.getChild(/(wheel_*rr)|(rr_*wheel)|(^rr$)/gmi, true) || parent.getChild("RearRightWheel", true),
      parent.getChild(/(wheel_*rl)|(rl_*wheel)|(^rl$)/gmi, true) || parent.getChild("RearLeftWheel", true),
      parent.getChild(/(wheel_*fr)|(fr_*wheel)|(^fr$)/gmi, true) || parent.getChild("FrontRightWheel", true),
      parent.getChild(/(wheel_*fl)|(fl_*wheel)|(^fl$)/gmi, true) || parent.getChild("FrontLeftWheel", true)
    ];
  }
  
  this.setup = async function(src) {
    this.gameObject = scene.add(await renderer.loadGLTF(src));

    var wheelObjects = getWheelModels(this.gameObject);
    if (wheelObjects.length != 4 || wheelObjects.some(w => w == undefined)) {
      console.log(wheelObjects);
      throw new Error("Vehicle does not have 4 wheels");
    }

    var carAABB = GetMeshAABB(this.gameObject, 0, wheelObjects);
    var carMeshCenter = carAABB.getCenter();
    var boxSize = Vector.subtract(carAABB.getSize(), Vector.fill(0.2));
    // var boxSize = {x: 1.73, y: 1, z: 3.81};

    for (var child of this.gameObject.children) {
      if (!wheelObjects.includes(child)) {
        var t = child.transform;
        t.position = Vector.subtract(t.position, carMeshCenter);
      }
    }

    // this.gameObject.traverse((o) => {
    //   if (o != this.gameObject && !wheelObjects.includes(o)) {
    //     var t = o.transform;
    //     // t.position = Vector.subtract(t.position, carMeshCenter);
    //     // console.log(o);
    //   }
    // });

    this.rb = new Rigidbody();
    this.rb.position = Vector.copy(this.resetPosition);
    this.rb.mass = settings.mass ?? 1500;
    // this.rb.COMOffset.z += 0.25;
    // this.rb.gravityScale = 0;
    
    this.rb.inertia = new Vector(
      this.rb.mass / 12 * (boxSize.y ** 2 + boxSize.z ** 2),
      this.rb.mass / 12 * (boxSize.x ** 2 + boxSize.z ** 2),
      this.rb.mass / 12 * (boxSize.y ** 2 + boxSize.x ** 2)
    );
    // this.rb.inertia = Vector.fill(this.rb.mass);

    // var colliderVis = renderer.CreateShape("cube");
    // colliderVis.transform.scale = Vector.divide(boxSize, 2);
    // this.gameObject.addChild(colliderVis);

    var centerVis = renderer.CreateShape("sphere");
    centerVis.transform.scale = Vector.fill(0.2);
    this.gameObject.addChild(centerVis);

    this.gameObject.addComponent(this.rb);
    // this.gameObject.addComponent(new BoxCollider(new AABB(
    //   Vector.divide(boxSize, -2),
    //   Vector.divide(boxSize, 2)
    // )));

    // var wheelModel = this.gameObject.getChild("WheelModel", true);
    // var staticWheelModel = this.gameObject.getChild("WheelModelStatic", true);

    for (var i = 0; i < wheelObjects.length; i++) {
      var wheelObject = wheelObjects[i];
      var wheelAABB = GetMeshAABB(wheelObject);

      var position = wheelAABB.getCenter();
      position = Vector.subtract(position, carMeshCenter);
      position.y += rideHeightOffset;
      
      var radius = Math.max(...Vector.toArray(wheelAABB.getSize())) / 2;

      var wheelParent = this.gameObject.addChild(new GameObject(wheelObject.name + "-Parent"));
      wheelParent.transform.position = position;

      var wheelModel = wheelParent.addChild(new GameObject("WheelModel"));
      wheelObject.setParent(wheelModel);
      wheelObject.transform.position = Vector.subtract(wheelObject.transform.position, wheelAABB.getCenter());

      // wheelObject.setParent(scene.root);
      // wheelObject.transform.position = Vector.zero();//Vector.negate(wheelAABB.getCenter());
      // wheelObject.transform.scale = Vector.add(wheelObject.transform.scale, Vector.fill(0.00001));

      // var offset = Vector.negate(GetMeshAABB(wheelObject).getCenter());

      // wheelObject.setParent(wheelModel);
      // wheelObject.transform.position = offset;

      // var colliderVis = scene.add(renderer.CreateShape("cube"));
      // colliderVis.transform.scale = Vector.divide(GetMeshAABB(wheelObject).getSize(), 2);
      // colliderVis.transform.position = GetMeshAABB(wheelObject).getCenter();

      // var position = wheelObject.transform.position;

      // wheelObject.setParent(scene.root);

      // var sc = new SphereCollider(radius + 0.2, Vector.add(position, new Vector(0, 0, 0)));
      // // sc.disableRotationImpulse = true;
      // sc.friction = 0;
      // this.gameObject.addComponent(sc);

      this.wheels[i] = new Wheel(position, wheelParent, {
        ...settings,
        radius: radius,
      });
      this.wheels[i].wheelModel = wheelModel;
      this.wheels[i].skidmarks = wheelObject.addComponent(new renderer.TrailRenderer());

      // if (wheelModel) {
      //   this.wheels[i].wheelModel = wheelObject.addChild(wheelModel.copy());
      // }

      // if (staticWheelModel) {
      //   this.wheels[i].staticWheelModel = wheelObject.addChild(staticWheelModel.copy());
      // }
    }

    // for (var child of this.gameObject.children) {
    //   if (!wheelObjects.includes(child) && !this.wheels.find(w => w.model == child)) {
    //     var t = child.transform;
    //     t.position = Vector.subtract(t.position, carMeshCenter);
    //     console.log(child);
    //   }
    // }

    // scene.add(renderer.CreateShape("sphere")).transform.scale = Vector.fill(0.3);

    // wheelModel?.delete();
    // staticWheelModel?.delete();
  
    this.wheels[0].turn = false;
    this.wheels[1].turn = false;
    this.wheels[2].drive = false;
    this.wheels[3].drive = false;
    this.wheels[2].ebrake = false;
    this.wheels[3].ebrake = false;

    this.wheels[1].side = -1;
    this.wheels[3].side = -1;

    // Camber
    var camber = settings.rearCamber ?? 0;
    this.wheels[0].camberAngle = camber * -this.wheels[0].side;
    this.wheels[1].camberAngle = camber * -this.wheels[1].side;
    var camber = settings.frontCamber ?? 0;
    this.wheels[2].camberAngle = camber * -this.wheels[2].side;
    this.wheels[3].camberAngle = camber * -this.wheels[3].side;

    // Rollbars
    this.rollbars = [
      { a: this.wheels[0], b: this.wheels[1] },
      { a: this.wheels[2], b: this.wheels[3] }
    ];

    // Lights
    // lightMaterials.mainFront = FindMaterials("Front DRL", this.gameObject)[0];
    // lightMaterials.brightsFront = FindMaterials("Bright_front_headlight", this.gameObject)[0];
    // lightMaterials.mainRear = FindMaterials("Rear_main_emission", this.gameObject)[0];
    // lightMaterials.reverseRear = FindMaterials("Rear_secondary_emission", this.gameObject)[0];
    // lightMaterials.brake = FindMaterials("tex_shiny", this.gameObject)[0];
    // lightMaterials.turnSignal = FindMaterials("Mirror Lamp", this.gameObject)[0];

    lightMaterials.mainFront = FindMaterials("LampWhite", this.gameObject)[0];
    lightMaterials.mainRear = FindMaterials("LampRedLight", this.gameObject)[0];
    lightMaterials.brake = FindMaterials("LampRed", this.gameObject)[0];
    lightMaterials.turnSignal = FindMaterials("LampOrange", this.gameObject)[0];

    var on = false;
    setInterval(() => {
      on = !on;
      this.setLightEmission("turnSignal", on ? [50, 5, 0] : [0, 0, 0]);
      this.setLightEmission("reverseRear", on ? [50, 5, 0] : [0, 0, 0]);
    }, 400);

    // Smoke
    var smokeObject = new GameObject("Smoke");
    this.gameObject.addChild(smokeObject);
    var smoke = smokeObject.addComponent(new renderer.ParticleSystem(700));

    smoke.material = renderer.CreateLitMaterial({
      albedoTexture: renderer.loadTexture(this.smokeTexture),
      albedoColor: [2, 2, 2, 1],
    }, renderer.programContainers.particle);
    smoke.material.doubleSided = true;
1
    smoke.emitPosition = () => new Vector(0, 2, 0);
    smoke.emitVelocity = () => new Vector((Math.random() - 0.5), (Math.random() - 0.5) + 0.5, -2);
    smoke.startSize = () => Vector.fill(Math.random() * 0.4 + 0.2);
    smoke.endSize = () => Vector.fill(3);
    smoke.emitHealth = 5;
    smoke.gravityScale = 0;
    smoke.wind = () => Vector.zero();
    smoke.drag = 0.1;
    smoke.orientation = "faceCamera";
    this.smoke = smoke;

    // Hood camera
    var hoodCamera = new GameObject("HoodCamera");
    hoodCamera.transform.position = new Vector(0, 0.5, 1);
    hoodCamera.transform.rotation = Quaternion.euler(0, Math.PI, 0);
    this.gameObject.addChild(hoodCamera);
  }

  this.reset = function() {
    this.rb.position.y += 2;
    this.rb.rotation = Quaternion.euler(0, 0 * Math.PI / 2, 0);
    this.gameObject.transform.position = this.rb.position;
    this.gameObject.transform.rotation = this.rb.rotation;

    this.rb.velocity = Vector.zero();
    this.rb.angularVelocity = Vector.zero();

    this.currentGear = 1;
    this.engine.angularVelocity = 0;

    for (var wheel of this.wheels) {
      wheel.angularVelocity = 0;
    }

    cameraCarForward = Matrix.getForward(this.gameObject.transform.worldMatrix);
  }

  this.renderUI = function(ui) {
    var center = {x: ui.width - 140, y: ui.height - 120};
    DrawGuage(ui, this.engine.getRPM(), 0, this.engine.maxRPM, center.x, center.y, 100);

    ui.setTextXAlign("center");
    ui.setTextYAlign("middle");
    ui.text(this.currentGear == 0 ? "R" : this.currentGear, center.x, center.y, 50, "white");
    ui.text(Math.abs(Math.floor(this.forwardVelocity * 3.6)), center.x, center.y + 50, 35, "white");
    ui.resetTextXAlign();
    ui.resetTextYAlign();

    ui.rectangle(center.x - 150, center.y - 30, 20, 100, "rgba(0, 0, 0, 0.5)");
    ui.rectangle(center.x - 150, center.y - 30 + 100 * (1 - driveInput), 20, 100 * driveInput, "white");

    ui.rectangle(center.x - 150 - 30, center.y - 30, 20, 100, "rgba(0, 0, 0, 0.5)");
    ui.rectangle(center.x - 150 - 30, center.y - 30 + 100 * (1 - brakeInput), 20, 100 * brakeInput, "red");

    ui.rectangle(center.x - 150 - 60, center.y - 30, 20, 100, "rgba(0, 0, 0, 0.5)");
    ui.rectangle(center.x - 150 - 60, center.y - 30 + 100 * (1 - ebrakeInput), 20, 100 * ebrakeInput, "orange");

    ui.rectangle(center.x - 150 - 90, center.y - 30, 20, 100, "rgba(0, 0, 0, 0.5)");
    ui.rectangle(center.x - 150 - 90, center.y - 30 + 100 * (1 - clutchInput), 20, 100 * clutchInput, "lime");

    // var x = ui.width / 2;
    // var y = ui.height / 2;
    // var scale = 10;
    // ui.line(x, y, x - this.sidewaysVelocity * scale, y - this.forwardVelocity * scale, 2, "lime");
  }

  this.update = function(dt) {
    // if (this.frozen) {
    //   return;
    // }

    if (keybindings.getInputDown("cameraMode")) {
      this.cameraMode++;
      if (this.cameraMode >= 3) {
        this.cameraMode = 0;
      }

      if (this.cameraMode == 0) {
        this.unfreeze();
        mainCamera.setFOV(cameraFov);

        cameraCarForward = Matrix.getForward(this.gameObject.transform.worldMatrix);
      }
      else if (this.cameraMode == 1) {
        mainCamera.setFOV(30);
      }
      else if (this.cameraMode == 2) {
        this.freeze();
      }
    }

    if (keybindings.getInputDown("resetGame")) {
      this.reset();
      this.rb.position = Vector.copy(this.resetPosition);
      this.gameObject.transform.position = this.rb.position;
    }

    if (this.frozen) {
      return;
    }

    if (this.canMove) {
      var forward = Vector.negate(Matrix.getForward(carWorldMatrix)); // bruh optimize
      var forwardVelocity = Vector.dot(this.rb.velocity, forward);

      if (this.controlScheme == Car.ControlScheme.Controller) {
        driveInput = clamp(keybindings.getInput("drive"), 0, 1);
        brakeInput = keybindings.getInput("brake");
      }
      else if (this.controlScheme == Car.ControlScheme.Keyboard) {
        var d = clamp(keybindings.getInput("drive"), 0, 1) - keybindings.getInput("brake");
        driveInput = clamp(Math.abs(d), 0, 1);
        brakeInput = 0;

        if ((forwardVelocity > 1 && d < -0.1) || (forwardVelocity < -1 && d > 0.1)) {
          brakeInput = 1;
          driveInput = 0;
        }

        if (d > 0.1 && forwardVelocity > -1.1 && this.currentGear == 0) {
          this.currentGear = 1;
        }
        if (d < -0.1 && forwardVelocity < 1.1) {
          this.currentGear = 0;
        }
      }

      ebrakeInput += (keybindings.getInput("ebrake") - ebrakeInput) * 0.2;
      clutchInput = Math.max(ebrakeInput, keybindings.getInput("clutch"), forwardVelocity * 3.6 < 11 ? (1 - driveInput * 0.4) : 0);//Math.max(ebrakeInput, keybindings.getInput("clutch"));
    
      if (keybindings.getInputDown("resetCar")) {
        this.reset();
      }

      if (keybindings.getInputDown("gearDown")) {
        this.currentGear--;
      }
      if (keybindings.getInputDown("gearUp")) {
        this.currentGear++;
      }
      this.currentGear = clamp(this.currentGear, 0, this.allGearRatios.length - 1);
    }
    else {
      driveInput = 0;
      brakeInput = 0;
      ebrakeInput = 1;
      clutchInput = 1;
    }

    // brakeInput = 1;

    // this.setLightEmission("reverseRear", this.currentGear == 0 ? [50, 50, 50] : [0, 0, 0]);
    this.setLightEmission("brake", brakeInput > 0 ? [20, 20, 20] : [0, 0, 0]);
    this.setLightEmission("mainRear", brakeInput > 0 ? [50, 0, 0] : [0, 0, 0]);
  }

  this.fixedUpdate = function(fixedDeltaTime) {
    this.cameraControls(fixedDeltaTime);

    if (this.frozen) {
      return;
    }

    Matrix.copy(this.gameObject.transform.worldMatrix, carWorldMatrix);

    Matrix.inverse(carWorldMatrix, inverseWorldMatrix);
    Matrix.removeTranslation(inverseWorldMatrix);

    // var localVelocity = Matrix.transformVector(inverseWorldMatrix, this.rb.velocity);
    var localAngularVelocity = Matrix.transformVector(inverseWorldMatrix, this.rb.angularVelocity);

    var forward = Vector.negate(Matrix.getForward(carWorldMatrix));
    var sideways = Matrix.getRight(carWorldMatrix);

    var forwardVelocity = Vector.dot(this.rb.velocity, forward);
    this.forwardVelocity = forwardVelocity;
    var sidewaysVelocity = Vector.dot(this.rb.velocity, sideways);

    var slipAngle = -Math.atan2(sidewaysVelocity, Math.abs(forwardVelocity));
    if (isNaN(slipAngle) || !isFinite(slipAngle)) slipAngle = 0;

    // Controller steer input
    var userInput = -deadZone(this.canMove ? keybindings.getInput("steer") : 0, 0.1);
    userInput = Math.pow(Math.abs(userInput), this.steerGamma) * Math.sign(userInput);
    userInput = clamp(userInput, -1, 1);

    // Steer limiting
    userInput *= Math.exp(-Math.abs(forwardVelocity) / this.steerVelocity);
    
    // Smooth steering
    steerInput += (userInput - steerInput) * this.steerSpeed;
    // steerInput += -Math.sign(steerInput - userInput) * Math.min(Math.abs(steerInput - userInput), 0.05);

    var acs = activateAutoCountersteer && (Math.abs(sidewaysVelocity) > 0.5 || forwardVelocity > autoCountersteerMinVel) ?
      -slipAngle / (maxSteerAngle / 180 * Math.PI) * autoCountersteer
      - localAngularVelocity.y * autoCountersteerVelocityMultiplier * Math.sign(forwardVelocity)
      : 0;
    var currentSteerInput = clamp(steerInput + acs, -1, 1);

    for (var wheel of this.wheels) {
      var currentSteerAngle = wheel.turn ? currentSteerInput * maxSteerAngle * Math.PI / 180 : 0;

      // Turn wheel
      var m = Matrix.transform([
        ["translate", wheel.position],
        ["ry", currentSteerAngle]
      ]);
      wheel.model.transform.matrix = m;

      // Bruh
      var wheelWorldMatrix = wheel.model.transform.worldMatrix;
      var up = Matrix.getUp(wheelWorldMatrix);
      wheel.up = up;

      var worldPos = Matrix.transformVector(carWorldMatrix, wheel.position);
      wheel.worldPos = worldPos;
      var wheelVelocity = this.rb.GetPointVelocity(worldPos);

      var ray = {origin: worldPos, direction: Vector.negate(up)};
      var hit = physicsEngine.Raycast(ray.origin, ray.direction).firstHit;
      wheel.isGrounded = hit && hit.distance < wheel.suspensionTravel + wheel.radius;

      // Change model transform
      if (wheel.wheelModel) {
        var modelTransform = wheel.wheelModel.transform;
        modelTransform.position = new Vector(wheel.camberAngle / 100, -(wheel.isGrounded ? hit.distance - wheel.radius : wheel.suspensionTravel), 0);
        modelTransform.rotation = Quaternion.euler(wheel.angle, 0, wheel.camberAngle * Math.PI / 180);
        // modelTransform.rotation = Quaternion.euler(wheel.angle * -wheel.side, wheel.side == 1 ? Math.PI : 0, wheel.camberAngle * Math.PI / 180);
      }
      if (wheel.staticWheelModel) {
        var modelTransform = wheel.staticWheelModel.transform;
        modelTransform.position = new Vector(wheel.camberAngle / 100, -(wheel.isGrounded ? hit.distance - wheel.radius : wheel.suspensionTravel), 0);
        modelTransform.rotation = Quaternion.euler(0, wheel.side == 1 ? Math.PI : 0, wheel.camberAngle * Math.PI / 180);
      }

      // Set skidmarks emit position
      if (wheel.skidmarks) {
        if (wheel.isGrounded) {
          wheel.skidmarks.emitPosition = Vector.add(Vector.add(hit.point, new Vector(0, 0.01, 0)), Vector.multiply(wheelVelocity, fixedDeltaTime));
          wheel.skidmarks.emitNormal = hit.normal;
        }
        else {
          wheel.skidmarks.emitPosition = Vector.add(Vector.add(worldPos, Vector.multiply(up, -wheel.radius)), Vector.multiply(wheelVelocity, fixedDeltaTime));
        }
      }

      // Set contact data
      wheel.ray = ray;
      wheel.worldPos = worldPos;

      if (wheel.isGrounded) {
        wheel.groundHit = hit;
        wheel.contactPoint = hit.point;
      }
    }

    var highestSkidVolume = 0;

    var lambdaAccumulated = new Array(this.wheels.length).fill(0);

    var iters = 20;
    var dt = fixedDeltaTime / iters;
    for (var count = 0; count < iters; count++) {
      this.engine.fixedUpdate(dt);

      clutchConstraint(this.engine, this.clutch, dt, 1, 1, Math.pow(1 - clutchInput, 4) * this.clutch.impulseCapacity);

      var r = (this.currentGear == 0 ? -1 : 1) * this.allGearRatios[this.currentGear] * this.differentialRatio;
      if (
        this.differentialType == Car.ENUMS.DIFFERENTIAL.OPEN ||
        this.differentialType == Car.ENUMS.DIFFERENTIAL.LSD
      ) {
        var LSDFactor = this.differentialType == Car.ENUMS.DIFFERENTIAL.LSD ? this.LSDFactor : 0;

        if (this.drivetrain == "RWD" || this.drivetrain == "AWD") {
          differentialConstraint(this.clutch, this.wheels[0], this.wheels[1], dt, r, LSDFactor);
        }
        if (this.drivetrain == "FWD" || this.drivetrain == "AWD") {
          differentialConstraint(this.clutch, this.wheels[2], this.wheels[3], dt, r, LSDFactor);
        }
      }
      else if (this.differentialType == Car.ENUMS.DIFFERENTIAL.LOCKED) {
        if (this.drivetrain == "RWD" || this.drivetrain == "AWD") {
          gearConstraint(this.clutch, this.wheels[0], dt, 1, 1 / r);
          gearConstraint(this.clutch, this.wheels[1], dt, 1, 1 / r);
        }
        if (this.drivetrain == "FWD" || this.drivetrain == "AWD") {
          gearConstraint(this.clutch, this.wheels[2], dt, 1, 1 / r);
          gearConstraint(this.clutch, this.wheels[3], dt, 1, 1 / r);
        }
      }

      // Reset normal forces
      for (var wheel of this.wheels) {
        wheel.normalForce = 0;
      }

      // Bottom out
      var wheelIndex = 0;
      for (var wheel of this.wheels) {
        // Bruh
        // var wheelWorldMatrix = wheel.model.transform.worldMatrix;
        // var up = Matrix.getUp(wheelWorldMatrix);

        // var worldPos = Matrix.transformVector(carWorldMatrix, wheel.position);
        // var wheelVelocity = this.rb.GetPointVelocity(worldPos);

        // var ray = {origin: worldPos, direction: Vector.negate(up)};
        // var hit = physicsEngine.Raycast(ray.origin, ray.direction).firstHit;

        var ray = wheel.ray;
        var hit = wheel.groundHit;
        var worldPos = wheel.worldPos;
        var up = wheel.up;
        var wheelVelocity = this.rb.GetPointVelocity(worldPos);

        if (wheel.isGrounded && hit && hit.distance < wheel.suspensionTravel + wheel.radius) {
          var furthestPoint = Vector.add(ray.origin, Vector.multiply(ray.direction, wheel.radius + wheel.stopLength));
          var C = -Vector.dot(Vector.subtract(hit.point, furthestPoint), hit.normal);

          if (C < 0) {
            wheel.isGrounded = true;

            var r = Vector.cross(Vector.subtract(furthestPoint, this.rb.position), hit.normal);

            var jacobian = [
              hit.normal.x,
              hit.normal.y,
              hit.normal.z,
              r.x,
              r.y,
              r.z
            ];

            var it = this.rb.inverseWorldInertia;

            var JM = [
              jacobian[0] / this.rb.mass,
              jacobian[1] / this.rb.mass,
              jacobian[2] / this.rb.mass,
              jacobian[3] * it[0],
              jacobian[4] * it[5],
              jacobian[5] * it[10]

              // jacobian[3] / this.rb.inertia.x,
              // jacobian[4] / this.rb.inertia.y,
              // jacobian[5] / this.rb.inertia.z
            ];

            var beta = 0.15;
            var bias = beta / fixedDeltaTime * (C);
            var JMJ = multiply1DMatrices(JM, jacobian);

            var velocityMatrix = [
              this.rb.velocity.x,
              this.rb.velocity.y,
              this.rb.velocity.z,
              this.rb.angularVelocity.x,
              this.rb.angularVelocity.y,
              this.rb.angularVelocity.z
            ];

            var JV = multiply1DMatrices(jacobian, velocityMatrix);
            var lambda = -(JV + bias) / JMJ;

            if (lambdaAccumulated[wheelIndex] + lambda < 0) {
              lambda = -lambdaAccumulated[wheelIndex];
            }
            lambdaAccumulated[wheelIndex] += lambda;

            this.rb.velocity = Vector.add(this.rb.velocity, Vector.multiply(new Vector(jacobian[0], jacobian[1], jacobian[2]), lambda / this.rb.mass));
            this.rb.angularVelocity = Vector.add(this.rb.angularVelocity, Matrix.transformVector(this.rb.inverseWorldInertia, Vector.multiply(new Vector(jacobian[3], jacobian[4], jacobian[5]), lambda)));
            // this.rb.angularVelocity = Vector.add(this.rb.angularVelocity, divideVectorAndVector(Vector.multiply(new Vector(jacobian[3], jacobian[4], jacobian[5]), lambda), this.rb.inertia));

            wheel.normalForce = Math.abs(lambdaAccumulated[wheelIndex] / fixedDeltaTime);

            






            // var friction = 0.5;
            // var velocities = [];
            // var masses = [];
            // var tangentJacobian = [];
            // var bitangentJacobian = [];
            // var m = 1; // disable rotation if 0

            // var [ tangent, bitangent ] = Vector.formOrthogonalBasis(wheel.groundHit.normal);
            // var r = Vector.subtract(furthestPoint, this.rb.position);

            // var pc = Vector.cross(r, tangent);
            // // pc = Vector.negate(pc);
            // tangentJacobian.push(
            //   tangent.x,
            //   tangent.y,
            //   tangent.z,
            //   pc.x * m,
            //   pc.y * m,
            //   pc.z * m
            // );

            // var pc = Vector.cross(r, bitangent);
            // // pc = Vector.negate(pc);
            // bitangentJacobian.push(
            //   bitangent.x,
            //   bitangent.y,
            //   bitangent.z,
            //   pc.x * m,
            //   pc.y * m,
            //   pc.z * m
            // );

            // velocities.push(
            //   this.rb.velocity.x,
            //   this.rb.velocity.y,
            //   this.rb.velocity.z,
            //   this.rb.angularVelocity.x,
            //   this.rb.angularVelocity.y,
            //   this.rb.angularVelocity.z
            // );

            // var it = this.rb.inverseWorldInertia;
            // masses.push(
            //   this.rb.mass,
            //   this.rb.mass,
            //   this.rb.mass,
            //   1 / it[0],
            //   1 / it[5],
            //   1 / it[10]
            // );

            // var jacobians = [ tangentJacobian, bitangentJacobian ];
            // var bias = 0;

            // for (var i = 0; i < jacobians.length; i++) {
            //   var jacobian = jacobians[i];

            //   var effectiveMass = physicsEngine.getEffectiveMass(jacobian, masses);
            //   var frictionLambda = physicsEngine.getLambda(effectiveMass, jacobian, velocities, bias);
            //   frictionLambda = clamp(frictionLambda, -friction * lambda, friction * lambda);
            
            //   var impulses = [];
            //   for (var _i = 0; _i < jacobian.length; _i++) {
            //     impulses[_i] = jacobian[_i] * frictionLambda;
            //   }

            //   if (!impulses.some(item => isNaN(item))) {
            //     var ind = 0;

            //     this.rb.velocity.x += impulses[ind + 0] / masses[ind + 0];
            //     this.rb.velocity.y += impulses[ind + 1] / masses[ind + 1];
            //     this.rb.velocity.z += impulses[ind + 2] / masses[ind + 2];

            //     if (!this.rb.lockRotation) {
            //       this.rb.angularVelocity.x += impulses[ind + 3] / masses[ind + 3];
            //       this.rb.angularVelocity.y += impulses[ind + 4] / masses[ind + 4];
            //       this.rb.angularVelocity.z += impulses[ind + 5] / masses[ind + 5];
            //     }
            //   }
            //   else {
            //     console.warn("NaN in impulses", {
            //       constraint, impulses, lambda, frictionLambda, jacobian, velocities, masses, C, dt: this.dt
            //     });
            //   }
            // }
          }
        }

        wheelIndex++;
      }

      // Suspension
      for (var wheel of this.wheels) {
        var ray = wheel.ray;
        var hit = wheel.groundHit;
        var worldPos = wheel.worldPos;
        var up = wheel.up;
        var wheelVelocity = this.rb.GetPointVelocity(worldPos);

        if (wheel.isGrounded) {
          var rayDist = hit.distance;

          var springError = wheel.suspensionTravel - (rayDist - wheel.radius);
          // var springError = 1 - (rayDist - wheel.radius) / wheel.suspensionTravel;
          var currentSpringForce = Vector.multiply(ray.direction, springError * -wheel.suspensionForce);
          var currentDampingForce = Vector.multiply(Vector.project(Vector.subtract(wheelVelocity, Vector.projectOnPlane(this.rb.velocity, hit.normal)), up), -wheel.suspensionDamping);
          var totalForce = Vector.add(currentSpringForce, currentDampingForce);
          this.rb.AddImpulseAtPosition(Vector.multiply(totalForce, dt), worldPos);

          wheel.normalForce += Vector.length(totalForce);
          wheel.compressionAmount = clamp(springError / wheel.suspensionTravel, 0, 1);
        }
      }

      // Rollbars
      for (var rollbar of this.rollbars) {
        var aComp = rollbar.a.compressionAmount ?? 0;
        var bComp = rollbar.b.compressionAmount ?? 0;
        var force = (aComp - bComp) * this.antiRoll;
        if (rollbar.b.isGrounded) this.rb.AddImpulseAtPosition(Vector.multiply(rollbar.b.up, -force * dt), rollbar.b.worldPos);
        if (rollbar.a.isGrounded) this.rb.AddImpulseAtPosition(Vector.multiply(rollbar.a.up, force * dt), rollbar.a.worldPos);
      }

      for (var wheel of this.wheels) {
        var slipAngle = 0;
        var forwardVelocity = 0;

        // Bruh
        var wheelWorldMatrix = wheel.model.transform.worldMatrix;
        // var wheelWorldMatrix = carWorldMatrix; // This does not work when the wheels are 90 deg turned
        var up = Matrix.getUp(wheelWorldMatrix);
        var forward = Matrix.getForward(wheelWorldMatrix);
        var sideways = Matrix.getRight(wheelWorldMatrix);

        var worldPos = Matrix.transformVector(carWorldMatrix, wheel.position);
        var wheelVelocity = this.rb.GetPointVelocity(worldPos);

        // forward = Vector.negate(forward);

        if (ebrakeInput > 0.1 && wheel.ebrake) {
          // wheel.angularVelocity = -forwardVelocity / wheel.radius * (1 - ebrakeInput);
          wheel.angularVelocity += -Math.sign(wheel.angularVelocity) * Math.min(ebrakeInput * ebrakeTorque, Math.abs(wheel.angularVelocity) / dt) * dt;
        }

        if (wheel.isGrounded) {
          forwardVelocity = Vector.dot(wheelVelocity, forward);
          var sidewaysVelocity = Vector.dot(wheelVelocity, sideways);

          if (brakeInput != 0) {
            if (this.ABS) {
              var a = wheel.lastA ?? 0;
              var targetSlip = wheel.slipRatioPeak * Math.sqrt(Math.max(0.01, 1 - a * a)) * Math.sign(forwardVelocity);
              var w = lerp(-forwardVelocity / wheel.radius, (targetSlip * Math.abs(forwardVelocity) - forwardVelocity) / wheel.radius, brakeInput);

              wheel.angularVelocity = Math.abs(forwardVelocity) < 1 ? 0 : w;
            }
            else {
              wheel.angularVelocity += -Math.sign(wheel.angularVelocity) * Math.min(brakeInput * this.brakeTorque, Math.abs(wheel.angularVelocity) / dt) * dt;
              // wheel.angularVelocity = -forwardVelocity / wheel.radius * (1 - brakeInput);
            }
          }


          // Friction
          // wheelVelocity = this.rb.GetPointVelocity(wheel.contactPoint);

          var roadFriction = 1;

          // wheel.angularVelocity += currentDriveTorque / wheel.inertia * dt;

          // wheel.slipAnglePeak = findPeak(x => { // bruh performance heavy
          //   return advancedFy(x * 180 / Math.PI, wheel.normalForce, wheel.camberAngle, wheel.advancedSlipAngleCoeffs);
          // });

          var currentSteerAngle = wheel.turn ? currentSteerInput * maxSteerAngle * Math.PI / 180 : 0;
          slipAngle = -Math.atan(sidewaysVelocity / Math.abs(forwardVelocity));// - currentSteerAngle * Math.sign(forwardVelocity); // Not needed when using wheel transform instead of car transform
          if (isNaN(slipAngle) || !isFinite(slipAngle)) slipAngle = 0;
          var a = slipAngle / wheel.slipAnglePeak;
          wheel.lastA = a;

          // // TCS
          // if (this.TCS && Math.abs(currentDriveTorque) > 0.01 && Math.abs(forwardVelocity) > 0.5) {
          //   var TCStargetSlip = -wheel.slipRatioPeak * Math.sqrt(Math.max(0.01, 1 - a * a)) * Math.sign(forwardVelocity);
          //   var targetAngularVelocity = (TCStargetSlip * Math.abs(forwardVelocity) - forwardVelocity) / wheel.radius;
          //   wheel.angularVelocity = clamp(wheel.angularVelocity, -Math.abs(targetAngularVelocity), Math.abs(targetAngularVelocity));
          // }

          var slipRatio = -(wheel.angularVelocity * wheel.radius + forwardVelocity) / Math.abs(forwardVelocity) * Math.min(Math.abs(forwardVelocity) / 4, 1);
          if (isNaN(slipRatio)) slipRatio = 0;
          if (!isFinite(slipRatio)) slipRatio = Math.sign(slipRatio);
          var s = slipRatio / wheel.slipRatioPeak;

          var rho = Math.sqrt(s * s + a * a);

          var Fx = (_slipRatio) => {
            return magicFormula(_slipRatio, wheel.slipRatioCoeffs) * roadFriction * wheel.friction * wheel.forwardFriction;
          }
          var Fy = ( _slipAngle) => {
            return advancedFy(_slipAngle * 180 / Math.PI, wheel.normalForce, wheel.camberAngle, wheel.advancedSlipAngleCoeffs) * roadFriction * wheel.friction * wheel.sidewaysFriction;
            // return magicFormula(_slipAngle * 180 / Math.PI - wheel.camberAngle * wheel.camberAngleCoeff, wheel.slipAngleCoeffs) * roadFriction * wheel.friction * wheel.sidewaysFriction;
          }

          var finalForceX = s / rho * Fx(rho * wheel.slipRatioPeak) * wheel.normalForce;
          var finalForceY = a / rho * Fy(rho * wheel.slipAnglePeak);// * wheel.normalForce;

          if (!isNaN(finalForceX)) {
            var contactVelocity = (wheel.angularVelocity * wheel.radius + forwardVelocity);
            var maxForceToResolveFriction = Math.abs(contactVelocity / (wheel.radius * wheel.radius) * wheel.inertia / dt);
            var maxFriction = Math.abs(finalForceX);
            var frictionForce = Math.min(maxFriction, maxForceToResolveFriction) * -Math.sign(finalForceX);
            wheel.angularVelocity -= (frictionForce * wheel.radius) / wheel.inertia * dt;

            // wheel.angularVelocity -= (-finalForceX * wheel.radius) / wheel.inertia * dt;
          }
          
          var driveSidewaysVector = Vector.projectOnPlane(sideways, wheel.groundHit.normal);
          var driveForwardVector = Quaternion.QxV(Quaternion.angleAxis(-Math.PI / 2, driveSidewaysVector), wheel.groundHit.normal);
          if (!isNaN(finalForceX)) this.rb.AddImpulseAtPosition(Vector.multiply(driveForwardVector, finalForceX * dt), wheel.contactPoint);
          if (!isNaN(finalForceY)) this.rb.AddImpulseAtPosition(Vector.multiply(driveSidewaysVector, finalForceY * dt), wheel.contactPoint);

          if (renderer.debugMode && count == 0) {
            Debug.Vector(worldPos, driveForwardVector, 1, [1, 0, 0]);
            Debug.Vector(worldPos, driveSidewaysVector, 1, [0, 1, 0]);
          }



          // var frictions = [
          //   Math.abs(finalForceX / wheel.normalForce),
          //   Math.abs(finalForceY / wheel.normalForce)
          // ];
          // var velocities = [];
          // var masses = [];
          // var tangentJacobian = [];
          // var bitangentJacobian = [];
          // var [ tangent, bitangent ] = [ driveForwardVector, sideways ];
          // var r = Vector.subtract(wheel.contactPoint, this.rb.position);
          // var m = 1; // disable rotation if 0

          // var pc = Vector.cross(r, tangent);
          // // pc = Vector.negate(pc);
          // tangentJacobian.push(
          //   tangent.x,
          //   tangent.y,
          //   tangent.z,
          //   pc.x * m,
          //   pc.y * m,
          //   pc.z * m
          // );

          // var pc = Vector.cross(r, bitangent);
          // // pc = Vector.negate(pc);
          // bitangentJacobian.push(
          //   bitangent.x,
          //   bitangent.y,
          //   bitangent.z,
          //   pc.x * m,
          //   pc.y * m,
          //   pc.z * m
          // );

          // velocities.push(
          //   this.rb.velocity.x,
          //   this.rb.velocity.y,
          //   this.rb.velocity.z,
          //   this.rb.angularVelocity.x,
          //   this.rb.angularVelocity.y,
          //   this.rb.angularVelocity.z
          // );

          // var it = this.rb.inverseWorldInertia;
          // masses.push(
          //   this.rb.mass,
          //   this.rb.mass,
          //   this.rb.mass,
          //   1 / it[0],
          //   1 / it[5],
          //   1 / it[10]
          // );

          // var jacobians = [ tangentJacobian, bitangentJacobian ];
          // var bias = 0;
          // var lambda = wheel.normalForce * dt;

          // for (var i = 0; i < jacobians.length; i++) {
          //   var jacobian = jacobians[i];
          //   var friction = frictions[i];

          //   var effectiveMass = physicsEngine.getEffectiveMass(jacobian, masses);
          //   var frictionLambda = physicsEngine.getLambda(effectiveMass, jacobian, velocities, bias);
          //   frictionLambda = clamp(frictionLambda, -friction * lambda, friction * lambda);
          
          //   var impulses = [];
          //   for (var _i = 0; _i < jacobian.length; _i++) {
          //     impulses[_i] = jacobian[_i] * frictionLambda;
          //   }

          //   if (!impulses.some(item => isNaN(item))) {
          //     var ind = 0;

          //     this.rb.velocity.x += impulses[ind + 0] / masses[ind + 0];
          //     this.rb.velocity.y += impulses[ind + 1] / masses[ind + 1];
          //     this.rb.velocity.z += impulses[ind + 2] / masses[ind + 2];

          //     if (!this.rb.lockRotation) {
          //       this.rb.angularVelocity.x += impulses[ind + 3] / masses[ind + 3];
          //       this.rb.angularVelocity.y += impulses[ind + 4] / masses[ind + 4];
          //       this.rb.angularVelocity.z += impulses[ind + 5] / masses[ind + 5];
          //     }
          //   }
          //   else {
          //     console.warn("NaN in impulses", {
          //       constraint, impulses, lambda, frictionLambda, jacobian, velocities, masses, C, dt: this.dt
          //     });
          //   }
          // }






          // if (ebrakeInput > 0.1 && wheel.ebrake) {
          //   // wheel.angularVelocity = -forwardVelocity / wheel.radius * (1 - ebrakeInput);

          //   var brakeTorque = 4000;
          //   wheel.angularVelocity += -Math.sign(wheel.angularVelocity) * Math.min(ebrakeInput * brakeTorque, Math.abs(wheel.angularVelocity) / dt) * dt;
          // }

          // if (brakeInput != 0) {
          //   if (this.ABS) {
          //     var targetSlip = wheel.slipRatioPeak * Math.sqrt(Math.max(0.01, 1 - a * a)) * Math.sign(forwardVelocity);
          //     var w = lerp(-forwardVelocity / wheel.radius, (targetSlip * Math.abs(forwardVelocity) - forwardVelocity) / wheel.radius, brakeInput);

          //     wheel.angularVelocity = Math.abs(forwardVelocity) < 1 ? 0 : w;
          //   }
          //   else {
          //     wheel.angularVelocity += -Math.sign(wheel.angularVelocity) * Math.min(brakeInput * this.brakeTorque, Math.abs(wheel.angularVelocity) / dt) * dt;
          //     // wheel.angularVelocity = -forwardVelocity / wheel.radius * (1 - brakeInput);
          //   }
          // }
        }
        else {
          if (brakeInput != 0 && !this.ABS) {
            wheel.angularVelocity += -Math.sign(wheel.angularVelocity) * Math.min(brakeInput * this.brakeTorque, Math.abs(wheel.angularVelocity) / dt) * dt;
          }
        }

        var skidVolume = 0;
        if ((Math.abs(slipAngle) > 0.2 && Math.abs(forwardVelocity) > 0.5) || Math.abs(slipRatio) > 0.2) {
          skidVolume = clamp(Math.abs(slipRatio) - 0.2, 0, 1) + clamp((Math.abs(slipAngle) - 0.2) * (1 - Math.exp(-Math.abs(forwardVelocity) * 0.02)), 0, 1) * 0.5;

          if (skidVolume > highestSkidVolume) {
            highestSkidVolume = skidVolume;
          }
        }

        if (wheel.skidmarks) {
          wheel.skidmarks.emit = clamp(skidVolume * 20 * (wheel.isGrounded ? 1 : 0.01), 0, 0.7);
        }

        wheel.slipRatio = slipRatio;
      }
    }

    // Emit smoke
    for (var wheel of this.wheels) {
      wheel.angle += wheel.angularVelocity * fixedDeltaTime;

      if (wheel.isGrounded) {
        var wheelWorldMatrix = wheel.model.transform.worldMatrix;
        var forward = Vector.negate(Matrix.getForward(wheelWorldMatrix));
        var forwardVelocity = Vector.dot(this.rb.velocity, forward);

        var speedDiff = wheel.angularVelocity * wheel.radius - forwardVelocity;
        if (Math.abs(speedDiff) > 5) {
          var up = Matrix.getUp(wheelWorldMatrix);
          var worldPos = Matrix.transformVector(carWorldMatrix, wheel.position);
          Vector.addTo(worldPos, Vector.multiply(up, -wheel.radius));
          this.smoke.emitPosition = () => worldPos;

          var sideways = Matrix.getRight(wheelWorldMatrix);
          var driveForwardVector = Quaternion.QxV(Quaternion.angleAxis(-Math.PI / 2, sideways), wheel.groundHit.normal);
          var [ tangent, bitangent ] = Vector.formOrthogonalBasis(driveForwardVector);
          var basis = Matrix.basis(tangent, bitangent, driveForwardVector);

          this.smoke.emitVelocity = () => {
            var v = new Vector((Math.random() - 0.5), (Math.random() - 0.5), 2);
            v = Matrix.transformVector(basis, v);
            v.y += 0.5;
            return v;
          };
          
          this.smoke.alpha = clamp((Math.abs(speedDiff) - 5) / 10, 0, 1) * 0.1;
          this.smoke.emit();

          // gamepadManager.vibrate(20, 0.5, 0.1);
        }
      }
    }

    // Downforce
    for (var wing of this.wings) {
      wing.applyForce(this.rb, forwardVelocity);
    }

    // Drag
    this.rb.angularVelocity.x *= 0.995;
    this.rb.angularVelocity.y *= 0.995;
    this.rb.angularVelocity.z *= 0.995;

    if (this.skidSource && this.skidGain) {
      this.skidGain.gain.value += (highestSkidVolume * 0.5 - this.skidGain.gain.value) * 0.1;
      this.skidSource.playbackRate.value = clamp(0.8 + highestSkidVolume * 0.8, 1, 1.4);
    }

    // updateEngineRPM();
  }

  this.setLightEmission = function(lightName, value = [0, 0, 0]) {
    var mat = lightMaterials[lightName];
    if (mat) {
      if (!Array.isArray(value)) {
        value = [value, value, value];
      }
      mat.setUniform("emissiveFactor", value);
    }
  }

  // function updateEngineRPM() {
  //   var angularVelocities = 0;
  //   for (var wheel of _this.wheels) {
  //     if (wheel.drive) {
  //       angularVelocities += Math.abs(wheel.angularVelocity);
  //     }
  //   }

  //   var driveWheels = 2;
  //   _this.engine.angularVelocity = angularVelocities / driveWheels * _this.allGearRatios[_this.currentGear] * _this.differentialRatio;
  //   _this.engine.angularVelocity = clamp(_this.engine.angularVelocity, _this.engine.minRPM / radPerSecToRPM, _this.engine.maxRPM / radPerSecToRPM);
  // }

  function Clutch() {
    this.angularVelocity = 0;
    this.inertia = 0.005 * 10;

    this.impulseCapacity = 50;
  }

  function Engine(settings = {}) {
    this.torque = settings.torque ?? 300;
    this.minRPM = 800;
    this.maxRPM = 8000;
    this.rpmLimiterDelay = 50;

    this.angularVelocity = this.minRPM / radPerSecToRPM;
    this.inertia = 0.15 * 3 / 3;
    this.friction = 50;

    this.canThrottle = true;
    var throttleTimeout = null;

    var hasLoadedSound = false;
    var rpmChange = 1;
    var samples = [
      { rpm: 1500, on: "./cargame/engineSound/i6/low_on.wav" },
      { rpm: 4000, on: "./cargame/engineSound/i6/med_on.wav" },
      { rpm: 7000, on: "./cargame/engineSound/i6/high_on.wav" }
    ];

    window.addEventListener("click", function() {
      if (!hasLoadedSound) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        var context = new AudioContext();

        for (var i of samples) {
          (function(i) {
            loadSample(context, i.on).then(sample => {
              var { source, gainNode } = playSample(context, sample);
              i.onSource = source;
              i.onGain = gainNode;
          
              gainNode.gain.value = 0;
            });
          })(i);
        }

        hasLoadedSound = true;
      }
    });

    this.fixedUpdate = function(dt) {
      var currentTorque = this.torqueLookup(this.getRPM()) * this.torque;

      // RPM limiter
      if (this.getRPM() >= this.maxRPM) {
        this.canThrottle = false;

        clearTimeout(throttleTimeout);
        throttleTimeout = setTimeout(() => {
          this.canThrottle = true;
        }, this.rpmLimiterDelay);
      }

      if (this.canThrottle) {
        var virtualDriveInput = driveInput;

        if (this.getRPM() < this.minRPM) {
          virtualDriveInput = clamp(clamp((this.minRPM - this.getRPM()) / 100, 0, 0.4) + virtualDriveInput, 0, 1);
        }

        // var targetRPM = driveInput * this.maxRPM;
        // if (this.getRPM() < targetRPM) {
          this.angularVelocity += virtualDriveInput * /*clamp(Math.abs(this.getRPM() - targetRPM) / 500, 0, 1) **/ currentTorque / this.inertia * dt;
        // }

        if (virtualDriveInput && this.getRPM() > this.maxRPM) {
          this.angularVelocity = this.maxRPM / radPerSecToRPM + 10;
        }

        rpmChange -= (rpmChange - virtualDriveInput) * 0.01;
      }
      else {
        rpmChange -= (rpmChange - 0) * 0.01;
      }

      this.angularVelocity += Math.min(Math.abs(this.angularVelocity), this.friction / this.inertia * dt) * -Math.sign(this.angularVelocity);
    
      // Engine sound
      var rpm = clamp(this.getRPM(), 800, this.maxRPM);
      for (var sample of samples) {
        if (sample.onSource && sample.onGain) {
          var g = Math.exp(-(10 ** (-6.7)) * Math.pow(rpm - sample.rpm, 2)) * (Math.max(0, rpmChange) * 2 / 3 + 1 / 3) * 0.3;
          if (isFinite(g)) {
            sample.onGain.gain.value = g;
          }
          var pbr = rpm / sample.rpm;
          if (isFinite(pbr)) {
            sample.onSource.playbackRate.value = pbr;
          }
        }
      }
    }

    this.getRPM = function() {
      return this.angularVelocity * radPerSecToRPM;
    }

    this.torqueLookup = function(rpm) {
      return (-Math.pow(Math.abs((rpm - 4600) / 145), 1.4) + 309) / 309;
    }
  }

  function Wheel(position = Vector.zero(), model, settings = {}) {
    this.position = position;
    this.model = model;
    this.side = 1;

    this.friction = settings.friction ?? 1.5;
    this.forwardFriction = settings.forwardFriction ?? 1;
    this.sidewaysFriction = settings.sidewaysFriction ?? 1.5;
    this.radius = settings.radius ?? 0.35;
    this.camberAngle = 0;
    this.camberAngleCoeff = settings.camberAngleCoeff ?? 1;

    this.stopLength = settings.stopLength ?? 0.01;
    this.suspensionTravel = settings.suspensionTravel ?? 0.2;
    this.suspensionDamping = settings.suspensionDamping ?? 2500;
    this.suspensionForce = settings.suspensionForce ?? 50000;

    this.angle = 0;
    this.angularVelocity = 0;
    this.mass = settings.mass ?? 20;
    this.inertia = this.mass * this.radius * this.radius / 2;

    this.slipRatioCoeffs = settings.slipRatioCoeffs ?? [16, 1.5, 1.1, -1.4];
    this.slipAngleCoeffs = settings.slipAngleCoeffs ?? [0.2/*0.15*/, 1.5, 1.1, -1.4];

    this.advancedSlipAngleCoeffs = [
      1.799, // Force falloff after peak (1 < x < 2)
      0,
      1688, // Amplitude
      2140, //930 // The higher this value is the closer the peak is to 0 (*)
      6.026,
      0, // Like (*) but for camber
      -0.3589, // Peak tightness (x < 0)
      1, // Also peaktightness kind of
      0.8, // Camber x offset multipler
      -6.111 / 1000,
      -3.224 / 100,
      0,
      0,
      0,
      0
    ];

    this.slipRatioPeak = findPeak(x => {
      return magicFormula(x, this.slipRatioCoeffs);
    });

    // this.slipAnglePeak = findPeak(x => {
    //   return magicFormula(x * 180 / Math.PI - this.camberAngle * this.camberAngleCoeff, this.slipAngleCoeffs);
    // });
    this.slipAnglePeak = findPeak(x => {
      return advancedFy(x * 180 / Math.PI, _this.rb.mass * 9.82 / 4, this.camberAngle, this.advancedSlipAngleCoeffs);
    });

    this.drive = true;
    this.turn = true;
    this.ebrake = true;

    this.isGrounded = false;
    this.normalForce = 0;
  }

  function clutchConstraint(a, b, dt, ra = 1, rb = 1, maxImpulse = Infinity) {
    var biasFactor = 0;
    var C = 0;
    var jacobian = [1 / ra, -1 / rb];
    var velocities = [a.angularVelocity, b.angularVelocity];
    var inertias = [a.inertia, b.inertia];

    var bias = biasFactor / dt * C;
    var effectiveMass = physicsEngine.getEffectiveMass(jacobian, inertias);
    var lambda = physicsEngine.getLambda(effectiveMass, jacobian, velocities, bias);
    lambda = clamp(lambda, -maxImpulse, maxImpulse);

    var impulses = [];
    for (var i = 0; i < jacobian.length; i++) {
      impulses[i] = jacobian[i] * lambda;
    }

    a.angularVelocity += impulses[0] / a.inertia;
    b.angularVelocity += impulses[1] / b.inertia;
  }

  function gearConstraint(a, b, dt, ra = 1, rb = 1, maxImpulse = Infinity) {
    var biasFactor = 0;
    var C = a.angle / ra - b.angle / rb;
    var jacobian = [1 / ra, -1 / rb];
    var velocities = [a.angularVelocity, b.angularVelocity];
    var inertias = [a.inertia, b.inertia];

    var { impulses } = physicsEngine.getConstraintImpulse(jacobian, velocities, inertias, C, dt, biasFactor);

    a.angularVelocity += impulses[0] / a.inertia;
    b.angularVelocity += impulses[1] / b.inertia;
  }

  function differentialConstraint(m, a, b, dt, radius, LSDFactor = 0) {
    var angVelDiff = (a.angularVelocity - b.angularVelocity) * LSDFactor;

    var biasFactor = 0;
    var maxImpulse = Infinity;
    var C = 0;
    var jacobian = [0.5, 0.5, -1 / radius];
    var velocities = [a.angularVelocity, b.angularVelocity, m.angularVelocity];
    var inertias = [a.inertia, b.inertia, m.inertia];

    var { impulses } = physicsEngine.getConstraintImpulse(jacobian, velocities, inertias, C, dt, biasFactor);

    impulses[0] -= angVelDiff;
    impulses[1] += angVelDiff;

    a.angularVelocity += impulses[0] / a.inertia;
    b.angularVelocity += impulses[1] / b.inertia;
    m.angularVelocity += impulses[2] / m.inertia;
  }

  function multiply1DMatrices(m1, m2) {
    if (m1.length != m2.length) {
      throw new Error("Matrices have to be the same length!");
    }

    var sum = 0;
    for (var i = 0; i < m1.length; i++) {
      sum += m1[i] * m2[i];
    }

    return sum;
  }

  function advancedFy(slipAngle, Fz, camberAngle, a) {
    var camberAngleRad = camberAngle / 180 * Math.PI;
    var FzkN = Fz / 1000;

    var D = (a[1] * FzkN + a[2]) * FzkN;
    var S = slipAngle + a[8] * camberAngle + a[9] * FzkN + a[10];
    var B = a[3] * Math.sin(2 * Math.atan(FzkN / a[4])) * (1 - a[5] * Math.abs(camberAngleRad)) / (a[0] * (a[1] * FzkN + a[2]) * FzkN);
    var E = a[6] * FzkN + a[7];
    var Sy = ((a[11] * FzkN + a[12]) * camberAngle + a[13]) * FzkN + a[14];
    return D * Math.sin(a[0] * Math.atan(S * B + E * (Math.atan(S * B) - S * B))) + Sy;
  }

  function magicFormula(x, coeffs) {
    var b = coeffs[0];
    var c = coeffs[1];
    var d = coeffs[2];
    var e = coeffs[3];
    return d * Math.sin(c * Math.atan(b * x - e * (b * x - Math.atan(b * x))));
  }

  function findPeak(f, maxX = 10, stepsize = 0.001) {
    for (var x = 0; x < maxX; x += stepsize) {
      var fx = f(x);
      if (fx > f(x - stepsize) && fx > f(x + stepsize)) {
        return x;
      }
    }

    throw new Error("No peak found!");
  }

  function DrawGuage(ui, t, min, max, x, y, size = 100) {
    // ui.ring(x, y, size, "black", 2);
  
    t = clamp(t, min - 100, max + 100);
  
    var tickColor = "#333";
    var meterColor = "rgb(255, 40, 40)";
  
    ui.setTextXAlign("center");
    ui.setTextYAlign("center");
  
    var steps = max / 1000;
    var tickSize = 0.9;
    var number = 0;
    for (var i = 0; i <= 270; i += 270 / steps) {
      var angle = (i + 135) * Math.PI / 180;
      ui.line(x + Math.cos(angle) * size, y + Math.sin(angle) * size, x + Math.cos(angle) * (size * tickSize), y + Math.sin(angle) * (size * tickSize), tickColor, 2);
      ui.text(number, x + Math.cos(angle) * (size * tickSize * 0.9), y + Math.sin(angle) * (size * tickSize * 0.9), size / 8, tickColor);
  
      number++;
    }
  
    ui.resetTextXAlign();
    ui.resetTextYAlign();
  
    var tickSize = 0.95;
    for (var i = 0; i <= 270; i += 270 / steps / 5) {
      var angle = (i + 135) * Math.PI / 180;
      ui.line(x + Math.cos(angle) * size, y + Math.sin(angle) * size, x + Math.cos(angle) * (size * tickSize), y + Math.sin(angle) * (size * tickSize), tickColor, 1);
    }
  
    var angle = (ui.mapValue(t, min, max, 0, 270) + 135) * Math.PI / 180;
  
    ui.beginPath();
    ui.lineTo(x + Math.cos(angle + Math.PI / 2) * size * 0.03, y + Math.sin(angle + Math.PI / 2) * size * 0.02);
    ui.lineTo(x - Math.cos(angle + Math.PI / 2) * size * 0.03, y - Math.sin(angle + Math.PI / 2) * size * 0.02);
    ui.lineTo(
      x + Math.cos(angle) * size * 0.95 - Math.cos(angle + Math.PI / 2) * size * 0.01,
      y + Math.sin(angle) * size * 0.95 - Math.sin(angle + Math.PI / 2) * size * 0.01
    );
    ui.lineTo(
      x + Math.cos(angle) * size * 0.95 + Math.cos(angle + Math.PI / 2) * size * 0.01,
      y + Math.sin(angle) * size * 0.95 + Math.sin(angle + Math.PI / 2) * size * 0.01
    );
    ui.closePath();
    ui.fillStyle(meterColor);
    ui.fill();
  
    ui.save();
    ui.beginPath();
    ui.arc(x, y, size * 0.3, 0, Math.PI * 2);
    ui.clip();
  
    ui.clearScreen();
  
    ui.restore();
  
    // ui.line(x, y, x + Math.cos(angle) * size * 0.95, y + Math.sin(angle) * size * 0.95, "red", 3);
  }

  this.cameraControls = function(dt) {
    if (this.cameraMode == 0) {
      var forward = Vector.negate(Matrix.getForward(carWorldMatrix));
      var forwardAcceleration = Vector.dot(this.rb.acceleration, forward);
      currentFollowDistance -= (currentFollowDistance - this.camera.followDistance * (1 + forwardAcceleration / dt * this.camera.accelerationEffect)) * this.camera.accelerationSpeed;
      
      var followDistance = currentFollowDistance;
      var followHeight = this.camera.followHeight;
      var followSpeed = this.camera.followSpeed;
      var pitch = this.camera.pitch;

      var cameraTurnAngle = deadZone(gamepadManager.getAxis("RSHorizontal")) * Math.PI;

      // var planeVelocity = Vector.projectOnPlane(this.rb.velocity, Vector.up());
      var currentForward = Matrix.getForward(this.gameObject.transform.worldMatrix);
      currentForward = Quaternion.QxV(Quaternion.angleAxis(cameraTurnAngle, this.gameObject.transform.up/*Vector.up()*/), currentForward);
      cameraCarForward = Vector.slerp(cameraCarForward, currentForward, followSpeed);

      var finalCameraDir = null;

      var origin = Vector.add(this.gameObject.transform.position, new Vector(0, 0.15, 0));
      var dirNorm = Vector.normalize(Vector.add(cameraCarForward, new Vector(0, followHeight, 0)));

      var hit = physicsEngine.Raycast(origin, dirNorm);
      if (hit && hit.firstHit && hit.firstHit.distance < followDistance) {
        var d = hit.firstHit.distance;
        // currentFollowDist = clamp(d - 0.2, 0.5, followDistance);
        var h = Math.sqrt(followDistance * followDistance - d * d + (followHeight * d) ** 2) / d;

        var newDir = Vector.normalize(Vector.add(cameraCarForward, new Vector(0, h, 0)));
        hit = physicsEngine.Raycast(origin, newDir);
        if (hit && hit.firstHit && hit.firstHit.distance < followDistance) {
          finalCameraDir = Vector.multiply(newDir, hit.firstHit.distance - 0.5);
        }
        else {
          finalCameraDir = Vector.multiply(newDir, followDistance);
        }
      }
      else {
        finalCameraDir = Vector.multiply(dirNorm, followDistance);
      }

      mainCamera.transform.matrix = Matrix.lookAt(Vector.add(origin, finalCameraDir), origin);
      
      Matrix.rotateX(mainCamera.transform.matrix, pitch, mainCamera.transform.matrix);

      // var euler = Quaternion.toEulerAngles(mainCamera.transform.rotation);
      // euler[0] += 0.2;
      // mainCamera.transform.rotation = Quaternion.euler(euler[0], euler[1], euler[2]);
    }
    else if (this.cameraMode == 1) {
      var hoodCamera = this.gameObject.getChild("HoodCamera", true);
      if (hoodCamera) {
        mainCamera.transform.matrix = hoodCamera.transform.worldMatrix;
      }
    }
    else if (this.cameraMode == 2) {
      var oldFov = mainCamera.getFOV();
  
      var x = quadraticCurve(deadZone(gamepadManager.getAxis("RSHorizontal"), 0.08));
      var y = quadraticCurve(deadZone(gamepadManager.getAxis("RSVertical"), 0.08));
      cameraEulerAngles.x -= y * 0.07 * clamp(oldFov / 45, 0, 1);
      cameraEulerAngles.y -= x * 0.07 * clamp(oldFov / 45, 0, 1);
  
      var vertical = quadraticCurve(deadZone(gamepadManager.getAxis("LSVertical")));
      var horizontal = quadraticCurve(deadZone(gamepadManager.getAxis("LSHorizontal")));
  
      var speed = 15;
      var c = Math.cos(cameraEulerAngles.x);
      mainCamera.transform.position.x -= vertical * Math.cos(cameraEulerAngles.y + Math.PI / 2) * speed * dt * c;
      mainCamera.transform.position.z -= vertical * -Math.sin(cameraEulerAngles.y + Math.PI / 2) * speed * dt * c;
      mainCamera.transform.position.y -= vertical * Math.sin(cameraEulerAngles.x) * speed * dt;
  
      mainCamera.transform.position.x += horizontal * Math.cos(cameraEulerAngles.y) * speed * dt;
      mainCamera.transform.position.z += horizontal * -Math.sin(cameraEulerAngles.y) * speed * dt;
  
      flyCamera(renderer, mainCamera, cameraEulerAngles, dt);
  
      var fovInc = 1 + 0.03 * (gamepadManager.getButton("LS") - gamepadManager.getButton("RS"));
      var newFov = oldFov * fovInc;
      newFov = clamp(newFov, 0.1, 89);
      mainCamera.setFOV(newFov);
  
      mainCamera.transform.rotation = Quaternion.euler(cameraEulerAngles.x, cameraEulerAngles.y, cameraEulerAngles.z);
    }
  }
}
Car.ENUMS = {
  DIFFERENTIAL: { OPEN: 0, LOCKED: 1, LSD: 2 }
};

Car.ControlScheme = {
  Keyboard: 0,
  Controller: 1,
}

function Wing(position, liftCoeff = 0.1) {
  this.position = position;
  this.liftCoeff = liftCoeff;

  this.applyForce = function(rb, velocity) {
    var force = Vector.multiply(Vector.down(), this.liftCoeff * velocity * velocity);
    var position = Matrix.transformVector(rb.gameObject.transform.worldMatrix, this.position);

    rb.AddForceAtPosition(force, position);
  }
}

export {
  Car,
  Wing
};

function deadZone(x, zone = 0.1) {
  if (Math.abs(x) < zone) {
    return 0;
  }

  return x;
}

function quadraticCurve(x) {
  return Math.abs(x) * x;
}

function loadSample(context, url) {
  return fetch(url)
    .then(response => response.arrayBuffer())
    .then(buffer => context.decodeAudioData(buffer));
}

function playSample(context, sample) {
  var gainNode = context.createGain();
  gainNode.connect(context.destination);

  const source = context.createBufferSource();
  source.buffer = sample;
  source.loop = true;
  source.connect(gainNode);
  source.start(0);

  return {
    source,
    gainNode
  };
}