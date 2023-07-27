import Vector from "./engine/vector.mjs";
import Matrix from "./engine/matrix.mjs";
import Quaternion from "./engine/quaternion.mjs";
import { GameObject, FindMaterials, flyCamera, Scene } from "./engine/renderer.mjs";
import { Rigidbody, BoxCollider, AABB, GetMeshAABB, SphereCollider, PhysicsEngine, MeshCollider } from "./engine/physics.mjs";
import { clamp,  lerp, smoothstep } from "./engine/helper.mjs";
import Keybindings from "./keybindingsController.mjs";
import { Camera } from "./engine/renderer.mjs";
import GamepadManager, { deadZone, quadraticCurve } from "./gamepadManager.js";
import Perlin from "./engine/perlin.mjs";

const radPerSecToRPM = 30 / Math.PI;

function Trailer(scene, physicsEngine, settings = {}) {
  if (!(scene instanceof Scene)) {
    throw new Error("Scene is not of class 'Scene'");
  }

  if (!(physicsEngine instanceof PhysicsEngine)) {
    throw new Error("physicsEngine is not of class 'PhysicsEngine'");
  }

  var _this = this;
  var renderer = scene.renderer;
  let path = settings.path ?? renderer.path ?? "./";

  this.renderer = renderer;
  this.physicsEngine = physicsEngine;

  this.wheels = [];

  var carWorldMatrix = Matrix.identity();
  var inverseWorldMatrix = Matrix.identity();
  var localAngularVelocity = new Vector();
  var forward = new Vector();
  var sideways = new Vector();
  var m = new Matrix();
  var wheelVelocity = new Vector();
  var down = new Vector();

  // Settings
  let rideHeightOffset = 0;
  let smokeTexture = path + "assets/textures/smoke.png";

  this.fixedUpdateFunction = (dt) => {
    this.fixedUpdate(dt);
  };
  physicsEngine.on("fixedUpdate", this.fixedUpdateFunction);

  this.setup = async function(src) {
    // Load game object
    if (typeof src == "string") {
      this.gameObject = scene.add(await renderer.loadGLTF(src));
    }
    else if (src instanceof GameObject) {
      this.gameObject = src;
    }

    var wheelObjects = getWheelModels(this.gameObject);
    console.log(wheelObjects);

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

    this.rb = new Rigidbody();
    // this.rb.position = Vector.copy(this.resetPosition);
    this.rb.mass = settings.mass ?? 750;
    Vector.addTo(this.rb.COMOffset, settings.COMOffset ?? Vector.zero());
    // this.rb.COMOffset.z += 0.25;
    // this.rb.gravityScale = 0;
    
    this.rb.inertia = new Vector(
      this.rb.mass / 12 * (boxSize.y ** 2 + boxSize.z ** 2),
      this.rb.mass / 12 * (boxSize.x ** 2 + boxSize.z ** 2),
      this.rb.mass / 12 * (boxSize.y ** 2 + boxSize.x ** 2)
    );
    // this.rb.inertia = Vector.fill(this.rb.mass);

    // // Visualize
    // var colliderVis = renderer.CreateShape("cube");
    // colliderVis.transform.scale = Vector.divide(boxSize, 2);
    // this.gameObject.addChild(colliderVis);

    // var centerVis = renderer.CreateShape("sphere");
    // centerVis.transform.scale = Vector.fill(0.2);
    // this.gameObject.addChild(centerVis);

    this.gameObject.addComponent(this.rb);
    this.gameObject.addComponent(new BoxCollider(new AABB(
      Vector.divide(boxSize, -2),
      Vector.divide(boxSize, 2)
    ), -1000));

    // var wheelModel = this.gameObject.getChild("WheelModel", true);
    // var staticWheelModel = this.gameObject.getChild("WheelModelStatic", true);

    for (var i = 0; i < wheelObjects.length; i++) {
      var wheelObject = wheelObjects[i];
      var wheelAABB = GetMeshAABB(wheelObject);

      var position = wheelAABB.getCenter();
      position = Vector.subtract(position, carMeshCenter);
      position.y += rideHeightOffset;
      
      var radius = Math.max(...Vector.toArray(wheelAABB.getSize())) / 2;
      console.log(radius);

      // Skidmarks
      var skidmarks = wheelObject.addComponent(new renderer.TrailRenderer());
      skidmarks.width = Math.min(...Vector.toArray(wheelAABB.getSize())) * 0.5;

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

      this.wheels[i] = new Wheel(this, position, wheelParent, {
        ...settings,
        radius: radius,
      });
      this.wheels[i].wheelModel = wheelModel;
      this.wheels[i].skidmarks = skidmarks;

      // this.wheels[i].graph = graphsManager.createGraph();

      // if (wheelModel) {
      //   this.wheels[i].wheelModel = wheelObject.addChild(wheelModel.copy());
      // }

      // if (staticWheelModel) {
      //   this.wheels[i].staticWheelModel = wheelObject.addChild(staticWheelModel.copy());
      // }
    }

    // Smoke
    var smokeObject = new GameObject("Smoke");
    this.gameObject.addChild(smokeObject);
    var smoke = smokeObject.addComponent(new renderer.ParticleSystem(300));

    smoke.material = renderer.CreateLitMaterial({
      albedoTexture: renderer.loadTexture(smokeTexture),
      albedo: [2, 2, 2, 1],
    }, renderer.programContainers.particle);
    smoke.material.doubleSided = true;

    smoke.emitPosition = (dst) => {
      dst.x = 0;
      dst.y = 2;
      dst.z = 0;
    };
    smoke.emitVelocity = (dst) => {
      dst.x = (Math.random() - 0.5);
      dst.y = (Math.random() - 0.5) + 0.5;
      dst.z = -2;
    };
    smoke.startSize = (dst) => {
      Vector.fill(Math.random() * 0.4 + 0.2, dst);
    };
    smoke.endSize = (dst) => Vector.fill(3, dst);
    smoke.emitHealth = 2.5;
    smoke.gravityScale = 0;
    // smoke.wind = (dst) => Vector.zero(dst);
    smoke.drag = 0.1;
    smoke.orientation = "faceCamera";
    smoke.localParticles = false;
    this.smoke = smoke;
  };

  this.fixedUpdate = function(fixedDeltaTime) {
    if (this.frozen) {
      return;
    }

    Matrix.copy(this.gameObject.transform.worldMatrix, carWorldMatrix);

    Matrix.inverse(carWorldMatrix, inverseWorldMatrix);
    Matrix.removeTranslation(inverseWorldMatrix);

    // var localVelocity = Matrix.transformVector(inverseWorldMatrix, this.rb.velocity);
    Matrix.transformVector(inverseWorldMatrix, this.rb.angularVelocity, localAngularVelocity);

    // var forward = Vector.negate(Matrix.getForward(carWorldMatrix));
    Matrix.getForward(carWorldMatrix, forward);
    Vector.negate(forward, forward);
    // var sideways = Matrix.getRight(carWorldMatrix);
    Matrix.getRight(carWorldMatrix, sideways);

    var forwardVelocity = Vector.dot(this.rb.velocity, forward);
    this.forwardVelocity = forwardVelocity;
    var sidewaysVelocity = Vector.dot(this.rb.velocity, sideways);

    var carSlipAngle = -Math.atan2(sidewaysVelocity, Math.abs(forwardVelocity));
    if (isNaN(carSlipAngle) || !isFinite(carSlipAngle)) carSlipAngle = 0;

    for (let i = 0; i < this.wheels.length; i++) {
      let wheel = this.wheels[i];

      // Turn wheel
      Matrix.identity(m);
      Matrix.transform([
        ["translate", wheel.position],
        // ["ry", currentSteerAngle]
      ], m);
      wheel.model.transform.matrix = m;

      // Bruh
      let wheelWorldMatrix = wheel.model.transform.worldMatrix;
      Matrix.getUp(wheelWorldMatrix, wheel.up);
      let up = wheel.up;
      Vector.negate(up, down);

      Matrix.transformVector(carWorldMatrix, wheel.position, wheel.worldPos);
      let worldPos = wheel.worldPos;

      this.rb.GetPointVelocity(worldPos, wheelVelocity);
      Vector.multiplyTo(wheelVelocity, fixedDeltaTime);

      let ray = { origin: worldPos, direction: down }; // this is an object !
      let hit = physicsEngine.Raycast(ray.origin, ray.direction)?.firstHit;

      wheel.isGrounded = hit && hit.distance < wheel.suspensionTravel + wheel.radius;

      // Change model transform
      if (wheel.wheelModel) {
        let modelTransform = wheel.wheelModel.transform;

        modelTransform.position.x = wheel.camberAngle / 100;
        modelTransform.position.y = -(wheel.isGrounded ? hit.distance - wheel.radius : wheel.suspensionTravel);
        modelTransform.position.z = 0;

        // !
        modelTransform.rotation = Quaternion.euler(wheel.angle, 0, wheel.camberAngle * Math.PI / 180);
        // modelTransform.rotation = Quaternion.euler(wheel.angle * -wheel.side, wheel.side == 1 ? Math.PI : 0, wheel.camberAngle * Math.PI / 180);
      }
      if (wheel.staticWheelModel) {
        let modelTransform = wheel.staticWheelModel.transform;

        modelTransform.position.x = wheel.camberAngle / 100;
        modelTransform.position.y = -(wheel.isGrounded ? hit.distance - wheel.radius : wheel.suspensionTravel);
        modelTransform.position.z = 0;

        // !
        modelTransform.rotation = Quaternion.euler(0, wheel.side == 1 ? Math.PI : 0, wheel.camberAngle * Math.PI / 180);
      }

      // Set skidmarks emit position
      if (wheel.skidmarks) {
        if (wheel.isGrounded) {
          wheel.skidmarks.emitPosition = Vector.add(Vector.add(hit.point, new Vector(0, 0.01, 0)), wheelVelocity);
          wheel.skidmarks.emitNormal = hit.normal;
        }
        else {
          wheel.skidmarks.emitPosition = Vector.add(Vector.add(worldPos, Vector.multiply(up, -wheel.radius)), wheelVelocity);
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

    var highestSkidFreq = 1;
    var highestSkidVolume = 0;

    var lambdaAccumulated = new Array(this.wheels.length).fill(0);

    var iters = 20;
    var dt = fixedDeltaTime / iters;
    for (let count = 0; count < iters; count++) {
      // Reset normal forces
      for (var wheel of this.wheels) {
        wheel.normalForce = 0;
      }

      // Bottom out
      var wheelIndex = 0;
      for (let wheel of this.wheels) {
        wheel.bottomOutStrength = 0;

        let ray = wheel.ray;
        let hit = wheel.groundHit;

        if (wheel.isGrounded && hit && hit.distance < wheel.suspensionTravel + wheel.radius) {
          let furthestPoint = Vector.add(ray.origin, Vector.multiply(ray.direction, wheel.radius + wheel.stopLength));
          let C = -Vector.dot(Vector.subtract(hit.point, furthestPoint), hit.normal);

          if (C < 0) {
            wheel.isGrounded = true;

            let r = Vector.cross(Vector.subtract(furthestPoint, this.rb.position), hit.normal);

            let jacobian = [
              hit.normal.x,
              hit.normal.y,
              hit.normal.z,
              r.x,
              r.y,
              r.z
            ];

            let it = this.rb.inverseWorldInertia;

            let JM = [
              jacobian[0] / this.rb.mass,
              jacobian[1] / this.rb.mass,
              jacobian[2] / this.rb.mass,
              jacobian[3] * it[0],
              jacobian[4] * it[5],
              jacobian[5] * it[10]
            ];

            let beta = 0.15;
            let bias = beta / fixedDeltaTime * (C);
            let JMJ = multiply1DMatrices(JM, jacobian);

            let velocityMatrix = [
              this.rb.velocity.x,
              this.rb.velocity.y,
              this.rb.velocity.z,
              this.rb.angularVelocity.x,
              this.rb.angularVelocity.y,
              this.rb.angularVelocity.z
            ];

            let JV = multiply1DMatrices(jacobian, velocityMatrix);
            let lambda = -(JV + bias) / JMJ;

            if (lambdaAccumulated[wheelIndex] + lambda < 0) {
              lambda = -lambdaAccumulated[wheelIndex];
            }
            lambdaAccumulated[wheelIndex] += lambda;

            this.rb.velocity = Vector.add(this.rb.velocity, Vector.multiply(new Vector(jacobian[0], jacobian[1], jacobian[2]), lambda / this.rb.mass));
            this.rb.angularVelocity = Vector.add(this.rb.angularVelocity, Matrix.transformVector(this.rb.inverseWorldInertia, Vector.multiply(new Vector(jacobian[3], jacobian[4], jacobian[5]), lambda)));
            // this.rb.angularVelocity = Vector.add(this.rb.angularVelocity, divideVectorAndVector(Vector.multiply(new Vector(jacobian[3], jacobian[4], jacobian[5]), lambda), this.rb.inertia));

            wheel.normalForce = Math.abs(lambdaAccumulated[wheelIndex] / fixedDeltaTime);
            wheel.bottomOutStrength = Math.max(wheel.bottomOutStrength, Math.abs(lambdaAccumulated[wheelIndex]));
          }
        }

        wheelIndex++;
      }

      // Suspension
      for (let wheel of this.wheels) {
        let ray = wheel.ray;
        let hit = wheel.groundHit;
        let worldPos = wheel.worldPos;
        let up = wheel.up;
        let wheelVelocity = this.rb.GetPointVelocity(worldPos);

        if (wheel.isGrounded) {
          let rayDist = hit.distance;

          let springError = wheel.suspensionTravel - (rayDist - wheel.radius);
          // let springError = 1 - (rayDist - wheel.radius) / wheel.suspensionTravel;
          let currentSpringForce = Vector.multiply(ray.direction, springError * -wheel.suspensionForce);
          let currentDampingForce = Vector.multiply(Vector.project(Vector.subtract(wheelVelocity, Vector.projectOnPlane(this.rb.velocity, hit.normal)), up), -wheel.suspensionDamping);
          let totalForce = Vector.add(currentSpringForce, currentDampingForce);
          this.rb.AddImpulseAtPosition(Vector.multiply(totalForce, dt), worldPos);

          wheel.normalForce += Vector.length(totalForce);
          wheel.compressionAmount = clamp(springError / wheel.suspensionTravel, 0, 1);
        }
      }

      for (let wheel of this.wheels) {
        let slipAngle = 0;
        let forwardVelocity = 0;

        // Bruh
        let wheelWorldMatrix = wheel.model.transform.worldMatrix;
        // let wheelWorldMatrix = carWorldMatrix; // This does not work when the wheels are 90 deg turned
        // let up = Matrix.getUp(wheelWorldMatrix);
        let forward = Matrix.getForward(wheelWorldMatrix);
        let sideways = Matrix.getRight(wheelWorldMatrix);

        let worldPos = Matrix.transformVector(carWorldMatrix, wheel.position);
        let wheelVelocity = this.rb.GetPointVelocity(worldPos);

        // forward = Vector.negate(forward);

        if (wheel.isGrounded) {
          forwardVelocity = Vector.dot(wheelVelocity, forward);
          let sidewaysVelocity = Vector.dot(wheelVelocity, sideways);

          // Friction
          // wheelVelocity = this.rb.GetPointVelocity(wheel.contactPoint);

          let roadFriction = wheel.groundHit.gameObject?.customData?.friction ?? 1;
          wheel.roadFriction = roadFriction;

          // wheel.angularVelocity += currentDriveTorque / wheel.inertia * dt;

          // wheel.slipAnglePeak = findPeak(x => { // bruh performance heavy
          //   return advancedFy(x * 180 / Math.PI, wheel.normalForce, wheel.camberAngle, wheel.advancedSlipAngleCoeffs);
          // });

          slipAngle = -Math.atan(sidewaysVelocity / Math.abs(forwardVelocity));
          // if (Math.abs(forwardVelocity) < 0.02) {
          //   slipAngle = clamp(sidewaysVelocity * 0.01, -0.1, 0.1);
          // }
          slipAngle *= Math.min((sidewaysVelocity ** 2 + forwardVelocity ** 2) * 10, 1);
          if (isNaN(slipAngle) || !isFinite(slipAngle)) slipAngle = 0;
          let a = slipAngle / wheel.slipAnglePeak;
          wheel.lastA = a;

          var slipRatio = -(wheel.angularVelocity * wheel.radius + forwardVelocity) / Math.abs(forwardVelocity) * Math.min(Math.abs(forwardVelocity) / 2, 1);
          if (isNaN(slipRatio)) slipRatio = 0;
          if (!isFinite(slipRatio)) slipRatio = Math.sign(slipRatio);
          var s = slipRatio / wheel.slipRatioPeak;

          var rho = Math.sqrt(s * s + a * a);

          var Fx = (_slipRatio) => {
            return magicFormula(_slipRatio, wheel.slipRatioCoeffs) * roadFriction * wheel.friction * wheel.forwardFriction;
          };
          var Fy = ( _slipAngle) => {
            return advancedFy(_slipAngle * 180 / Math.PI, wheel.normalForce, wheel.camberAngle, wheel.advancedSlipAngleCoeffs) * roadFriction * wheel.friction * wheel.sidewaysFriction;
            // return magicFormula(_slipAngle * 180 / Math.PI - wheel.camberAngle * wheel.camberAngleCoeff, wheel.slipAngleCoeffs) * roadFriction * wheel.friction * wheel.sidewaysFriction;
          };

          // if (count == iters - 1) {
          //   wheel.graph.plot(performance.now(), a);
          // }

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
        }

        var skidFreq = 0.8 + clamp((Math.abs(slipRatio) - 0.2) * 0.7, 0, 0.8);
        if (skidFreq > highestSkidFreq) {
          highestSkidFreq = skidFreq;
        }

        var skidVolume = 0;
        if (wheel.isGrounded && !wheel.groundHit.gameObject?.customData.offroad && ((Math.abs(slipAngle) > 0.2 && Math.abs(forwardVelocity) > 0.5) || Math.abs(slipRatio) > 0.2)) {
          skidVolume = clamp(Math.abs(slipRatio) - 0.2, 0, 1) + clamp((Math.abs(slipAngle) - 0.2) * (1 - Math.exp(-Math.abs(forwardVelocity) * 0.06)), 0, 1);
          skidVolume *= wheel.friction * wheel.forwardFriction * wheel.roadFriction;

          if (skidVolume > highestSkidVolume) {
            highestSkidVolume = skidVolume;
          }
        }

        if (wheel.skidmarks) {
          wheel.skidmarks.emit = clamp(clamp(skidVolume * 20 * (wheel.isGrounded ? 1 : 0.01 * 0), 0, 0.7) * (wheel.isGrounded ? clamp(wheel.normalForce / 5000, 0, 1) * wheel.friction * wheel.forwardFriction * wheel.roadFriction : 0), 0, 1); // bruh, what even is this
        // wheel.skidmarks.emit);
        }

        wheel.slipRatio = slipRatio;
      }
    }

    // Emit smoke
    for (let wheel of this.wheels) {
      wheel.angle += wheel.angularVelocity * fixedDeltaTime;

      if (wheel.isGrounded && !wheel.groundHit.gameObject?.customData.offroad) {
        let wheelWorldMatrix = wheel.model.transform.worldMatrix;
        let forward = Vector.negate(Matrix.getForward(wheelWorldMatrix));
        let forwardVelocity = Vector.dot(this.rb.velocity, forward);

        let speedDiff = wheel.angularVelocity * wheel.radius - forwardVelocity;
        speedDiff *= wheel.roadFriction * wheel.forwardFriction * wheel.friction;
        if (Math.abs(speedDiff) > 5) {
          let up = Matrix.getUp(wheelWorldMatrix);
          let worldPos = Matrix.transformVector(carWorldMatrix, wheel.position);
          Vector.addTo(worldPos, Vector.multiply(up, -wheel.radius));
          this.smoke.emitPosition = (dst) => Vector.set(dst, worldPos);

          let sideways = Matrix.getRight(wheelWorldMatrix);
          let driveForwardVector = Quaternion.QxV(Quaternion.angleAxis(-Math.PI / 2, sideways), wheel.groundHit.normal);
          // let [ tangent, bitangent ] = Vector.formOrthogonalBasis(driveForwardVector);
          let basis = Matrix.basis(sideways, Vector.cross(sideways, driveForwardVector), driveForwardVector);

          this.smoke.emitVelocity = (dst) => {
            new Vector((Math.random() - 0.5), Math.random() * 0.5, 3.5, dst);
            Matrix.transformVector(basis, dst, dst);
            // v.y += 0.5;
          };
          
          this.smoke.alpha = clamp((Math.abs(speedDiff) - 5) / 10, 0, 1) * 0.1;
          this.smoke.emit();

          // gamepadManager.vibrate(20, 0.5, 0.1);
        }
      }
    }

    // Drag
    this.rb.angularVelocity.x *= 0.995;
    this.rb.angularVelocity.y *= 0.995;
    this.rb.angularVelocity.z *= 0.995;

    // Skid audio
    if (this.skidSource && this.skidGain) {
      this.skidGain.gain.value += (highestSkidVolume * 0.5 - this.skidGain.gain.value) * 0.1;
      this.skidSource.playbackRate.value = highestSkidFreq;//clamp(0.8 + highestSkidVolume * 0.8, 1, 1.4);
    }

    // Offroad audio
    if (this.offroadSource && this.offroadGain) {
      if (this.wheels.some(w => w.isGrounded && w.groundHit.gameObject?.customData.offroad)) {
        let g = clamp(Vector.length(this.rb.velocity) / 3, 0, 0.7);
        if (isFinite(g)) {
          this.offroadGain.gain.value = g;
        }

        let r = clamp(0.8 + Vector.length(this.rb.velocity) / 15, 1, 1.4);
        if (isFinite(r)) {
          this.offroadSource.playbackRate.value = r;
        }
      }
      else {
        this.offroadGain.gain.value = 0;
      }
    }
  };

  this.destroy = function() {
    physicsEngine.eventHandler.removeEvent("fixedUpdate", this.fixedUpdateFunction);
    this.gameObject.delete();
  };

  function getWheelModels(parent) {
    return parent.getChildren("Wheel", true, false);
  }
}

function Car(scene, physicsEngine, settings = {}) {
  if (!(scene instanceof Scene)) {
    throw new Error("Scene is not of class 'Scene'");
  }

  if (!(physicsEngine instanceof PhysicsEngine)) {
    throw new Error("physicsEngine is not of class 'PhysicsEngine'");
  }

  var _this = this;
  var renderer = scene.renderer;
  this.path = settings.path ?? renderer.path ?? "./";

  this.renderer = renderer;
  this.physicsEngine = physicsEngine;
  
  var perlin = new Perlin();

  // var graphsManager = new GraphsManager();

  var keybindings = this.keybindings = settings.keybindings ?? new Keybindings(renderer, new GamepadManager(), {
    "resetGame": {
      keyboard: "Escape",
      controller: "Menu"
    },
    "resetCar": {
      keyboard: "KeyR",
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
    "cameraMode": {
      keyboard: "KeyC",
      controller: "RB"
    },
    "turnCamera": {
      keyboard: ["ArrowLeft", "ArrowRight"],
      controller: "RSHorizontal"
    },
  });

  this.canMove = true;
  this.frozen = false;
  this.simulateFriction = true;
  this.resetPosition = Vector.zero();
  this.resetRotation = Quaternion.identity();
  this.bottomOffset = Vector.zero();

  this.mainCamera = new Camera({position: new Vector(0, 0, -3), near: 0.1, far: 1000, fov: 35});

  var resizeEvent = () => {
    this.mainCamera.setAspect(renderer.aspect);
  };
  renderer.on("resize", resizeEvent);
  resizeEvent();

  var cameraSettings = settings.camera ?? {};
  this.followCamera = new TPPFollowCamera(this);
  this.followCamera.followDistance = cameraSettings.followDistance ?? 5;
  this.followCamera.followHeight = cameraSettings.followHeight ?? 0.4;
  this.followCamera.followSpeed = cameraSettings.followSpeed ?? 0.05;
  this.followCamera.pitch = cameraSettings.pitch ?? 0.15;
  this.followCamera.accelerationSpeed = cameraSettings.accelerationSpeed ?? 0.05;
  this.followCamera.accelerationEffect = cameraSettings.accelerationEffect ?? 0.3;

  var cameraControllers = [
    this.followCamera,
    new SpectatorCamera(this),
    new HoodFollowCamera(this),
    new InteriorFollowCamera(this),
    new PhotoCamera(this),
  ];
  var currentCameraControllerIndex = 0;

  this.engine = new Engine({
    torque: settings.torque
  });
  this.clutch = new Clutch();
  this.frontDiffConnector = new RotationConnector();
  this.rearDiffConnector = new RotationConnector();
  this.wheels = [];
  this.wings = settings.wings ?? [];

  this.drivetrain = settings.drivetrain ?? "RWD";

  var isChangingGear = false;
  this.canDriveWhenChangingGear = settings.canDriveWhenChangingGear ?? false;
  this.gearChangeTime = settings.gearChangeTime ?? 0.35;
  this.currentGear = 1;
  this.gearRatios = settings.gearRatios ?? [2.66, 1.78, 1.3, 1, 0.74];
  this.reverseGearRatio = settings.reverseGearRatio ?? 2.9;
  this.allGearRatios = [this.reverseGearRatio, ...this.gearRatios];

  this.differentialRatio = settings.differentialRatio ?? 3.42;
  this.differentialType = settings.differential ?? Car.ENUMS.DIFFERENTIAL.OPEN;
  this.LSDFactor = settings.LSDFactor ?? 0.05;

  this.activateAutoCountersteer = settings.activateAutoCountersteer ?? true;
  this.autoCountersteerMinVel = 2;
  this.autoCountersteer = 0.6;
  this.autoCountersteerVelocityMultiplier = 0.2;

  this.steerSpeed = 0.05;
  this.steerVelocity = settings.steerVelocity ?? 50;//150;
  this.steerGamma = 2;

  this.ackermannSteering = settings.ackermannSteering ?? true;
  this.maxSteerAngle = settings.maxSteerAngle ?? 35;

  var steeringWheelModelInitialTransform;
  this.steeringWheelModelMaxRotation = Math.PI * 1.5;

  var ebrakeTorque = settings.ebrakeTorque ?? 4000;
  this.brakeTorque = settings.brakeTorque ?? 1500;//2000;
  this.ABS = settings.ABS ?? true;
  this.TCS = settings.TCS ?? false;
  this.antiRoll = settings.antiRoll ?? 7000;
  var rideHeightOffset = settings.rideHeightOffset ?? 0;

  this.controlScheme = settings.controlScheme ?? Car.ControlScheme.Keyboard;
  var steerInput = 0;
  var driveInput = 0;
  var brakeInput = 1;
  var ebrakeInput = 0;
  var clutchInput = 1;
  var targetClutchInput = 1;

  let highestSkidFreq = 1;
  let highestSkidVolume = 0;
  let activateTCS = false;

  // Object pool
  var carWorldMatrix = Matrix.identity();
  var inverseWorldMatrix = Matrix.identity();

  var localAngularVelocity = new Vector();
  var forward = new Vector();
  var sideways = new Vector();
  var m = new Matrix();
  var wheelVelocity = new Vector();
  var down = new Vector();

  let _tempQuat = new Quaternion();
  let _tempVector = new Vector();

  // Paths
  this.smokeTexture = this.path + "assets/textures/smoke.png";
  this.skidAudioSource = this.path + "cargame/skid.wav";
  this.offroadAudioSource = this.path + "assets/sound/gravelRoad.wav";
  this.bottomOutAudioSource = this.path + "assets/sound/bottomOut.wav";

  // Audio
  var hasPlayedBottomOutSound = false;

  var initAudio = () => {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    this.audioContext = new AudioContext();

    this.mainGainNode = this.audioContext.createGain();
    this.mainGainNode.connect(this.audioContext.destination);
    
    loadSample(this.audioContext, this.skidAudioSource).then(sample => {
      var { source, gainNode } = playSample(this.audioContext, sample);
      this.skidSource = source;
      this.skidGain = gainNode;
      this.skidGain.connect(this.mainGainNode);
  
      gainNode.gain.value = 0;
    });

    loadSample(this.audioContext, this.offroadAudioSource).then(sample => {
      var { source, gainNode } = playSample(this.audioContext, sample);
      this.offroadSource = source;
      this.offroadGain = gainNode;
      this.offroadGain.connect(this.mainGainNode);
  
      gainNode.gain.value = 0;
    });

    loadSample(this.audioContext, this.bottomOutAudioSource).then(sample => {
      this.bottomOutSample = sample;
    });

    this.engine.setupAudio(this.audioContext, this.mainGainNode);

    this.horn = new Horn(this.audioContext);
  };
  
  var suspendAudio = () => {
    this.audioContext.suspend();
  };

  var resumeAudio = () => {
    this.audioContext.resume();
  };
  
  initAudio();
  window.addEventListener("click", resumeAudio, { once: true });

  // Lights
  var lightMaterials = {};
  var brightsAreOn = false;

  this.brakeLightTurnonTime = 0.1;
  var brakeLightAmount = 0;

  this.fixedUpdateFunction = (dt) => {
    this.fixedUpdate(dt);
  };
  physicsEngine.on("fixedUpdate", this.fixedUpdateFunction);

  this.freeze = function() {
    this.frozen = true;
    this.rb.frozen = true;

    suspendAudio();
  };

  this.unfreeze = function() {
    this.frozen = false;
    this.rb.frozen = false;
    
    resumeAudio();
  };

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
  };

  function getWheelModels(parent) {
    return [
      parent.getChild(/(wheel_*rr)|(rr_*wheel)|(^rr$)/gmi, true) || parent.getChild("RearRightWheel", true),
      parent.getChild(/(wheel_*rl)|(rl_*wheel)|(^rl$)/gmi, true) || parent.getChild("RearLeftWheel", true),
      parent.getChild(/(wheel_*fr)|(fr_*wheel)|(^fr$)/gmi, true) || parent.getChild("FrontRightWheel", true),
      parent.getChild(/(wheel_*fl)|(fl_*wheel)|(^fl$)/gmi, true) || parent.getChild("FrontLeftWheel", true)
    ];
  }

  this.getCurrentCameraController = function() {
    return cameraControllers[currentCameraControllerIndex];
  };
  
  this.setup = async function(src) {
    if (typeof src == "string") {
      this.gameObject = scene.add(await renderer.loadGLTF(src));
    }
    else if (src instanceof GameObject) {
      this.gameObject = src;
    }

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
    Vector.addTo(this.rb.COMOffset, settings.COMOffset ?? Vector.zero());
    // this.rb.COMOffset.z += 0.25;
    // this.rb.gravityScale = 0;
    
    this.rb.inertia = new Vector(
      this.rb.mass / 12 * (boxSize.y ** 2 + boxSize.z ** 2),
      this.rb.mass / 12 * (boxSize.x ** 2 + boxSize.z ** 2),
      this.rb.mass / 12 * (boxSize.y ** 2 + boxSize.x ** 2)
    );
    // this.rb.inertia = Vector.fill(this.rb.mass);

    // var colliderVis = renderer.CreateShape("cube");
    // var md = colliderVis.meshRenderer.meshData[0];
    // md.applyTransform(Matrix.scale(Vector.compMultiply(boxSize, new Vector(0.4, 0.4, 0.4))));
    // // md.applyTransform(Matrix.scale(Vector.compMultiply(boxSize, new Vector(0.4, 0.5, 0.5))));
    // // colliderVis.meshRenderer.materials[0].setUniform("albedo", [0, 0, 0, 0]);

    // // colliderVis.transform.scale = Vector.divide(boxSize, 2);
    // // this.gameObject.addChild(colliderVis);
    // this.gameObject.meshRenderer = colliderVis.meshRenderer;
    // this.gameObject.addComponent(new MeshCollider());

    // var centerVis = renderer.CreateShape("sphere");
    // centerVis.transform.scale = Vector.fill(0.2);
    // this.gameObject.addChild(centerVis);

    this.gameObject.addComponent(this.rb);
    this.gameObject.addComponent(new BoxCollider(new AABB(
      Vector.divide(boxSize, -2),
      Vector.divide(boxSize, 2)
    ), -1000));

    // var wheelModel = this.gameObject.getChild("WheelModel", true);
    // var staticWheelModel = this.gameObject.getChild("WheelModelStatic", true);

    for (var i = 0; i < wheelObjects.length; i++) {
      var wheelObject = wheelObjects[i];
      var wheelAABB = GetMeshAABB(wheelObject);

      var position = wheelAABB.getCenter();
      position = Vector.subtract(position, carMeshCenter);
      position.y += rideHeightOffset;
      
      var radius = Math.max(...Vector.toArray(wheelAABB.getSize())) / 2;

      // Skidmarks
      var skidmarks = wheelObject.addComponent(new renderer.TrailRenderer());
      skidmarks.width = Math.min(...Vector.toArray(wheelAABB.getSize())) * 0.5;

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

      this.wheels[i] = new Wheel(this, position, wheelParent, {
        ...settings,
        radius: radius,
      });
      this.wheels[i].wheelModel = wheelModel;
      this.wheels[i].skidmarks = skidmarks;

      this.bottomOffset.y = position.y - radius - this.wheels[i].suspensionTravel - this.gameObject.transform.position.y;

      // this.wheels[i].graph = graphsManager.createGraph();

      // if (wheelModel) {
      //   this.wheels[i].wheelModel = wheelObject.addChild(wheelModel.copy());
      // }

      // if (staticWheelModel) {
      //   this.wheels[i].staticWheelModel = wheelObject.addChild(staticWheelModel.copy());
      // }
    }

    this.track = Vector.distance(this.wheels[0].position, this.wheels[1].position);
    this.wheelBase = Vector.distance(this.wheels[0].position, this.wheels[2].position);

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
    let rearCamber = settings.rearCamber ?? 0;
    this.wheels[0].camberAngle = rearCamber * -this.wheels[0].side;
    this.wheels[1].camberAngle = rearCamber * -this.wheels[1].side;
    let frontCamber = settings.frontCamber ?? 0;
    this.wheels[2].camberAngle = frontCamber * -this.wheels[2].side;
    this.wheels[3].camberAngle = frontCamber * -this.wheels[3].side;

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

    lightMaterials.mainFront = FindMaterials("LampWhite", this.gameObject, true)[0];
    lightMaterials.mainRear = FindMaterials("LampRedLight", this.gameObject, true)[0];
    lightMaterials.brake = FindMaterials("LampRed", this.gameObject, true)[0];
    lightMaterials.turnSignal = FindMaterials("LampOrange", this.gameObject, true)[0];
    lightMaterials.reverseRear = FindMaterials("Reverse", this.gameObject, true)[0];

    this.setLightEmission("mainRear", [1, 0, 0]);

    var on = false;
    setInterval(() => {
      on = !on;
      this.setLightEmission("turnSignal", on ? [50, 5, 0] : [0, 0, 0]);
    }, 400);

    // Lamps
    this.lamps = {
      brightsLeft: this.gameObject.getChild("BrightsLeft", true)?.children[0]?.getComponent("Light"),
      brightsRight: this.gameObject.getChild("BrightsRight", true)?.children[0]?.getComponent("Light"),
    };

    if (this.lamps.brightsLeft) this.lamps.brightsLeft.color = [0, 0, 0];
    if (this.lamps.brightsRight) this.lamps.brightsRight.color = [0, 0, 0];

    // Smoke
    var smokeObject = new GameObject("Smoke");
    this.gameObject.addChild(smokeObject);
    var smoke = smokeObject.addComponent(new renderer.ParticleSystem(300));

    smoke.material = renderer.CreateLitMaterial({
      albedoTexture: renderer.loadTexture(this.smokeTexture),
      albedo: [2, 2, 2, 1],
    }, renderer.programContainers.particle);
    smoke.material.doubleSided = true;

    smoke.emitPosition = (dst) => {
      dst.x = 0;
      dst.y = 2;
      dst.z = 0;
    };
    smoke.emitVelocity = (dst) => {
      dst.x = (Math.random() - 0.5);
      dst.y = (Math.random() - 0.5) + 0.5;
      dst.z = -2;
    };
    smoke.startSize = (dst) => {
      Vector.fill(Math.random() * 0.4 + 0.2, dst);
    };
    smoke.endSize = (dst) => Vector.fill(3, dst);
    smoke.emitHealth = 2.5;
    smoke.gravityScale = 0;
    // smoke.wind = (dst) => Vector.zero(dst);
    smoke.drag = 0.1;
    smoke.orientation = "faceCamera";
    smoke.localParticles = false;
    this.smoke = smoke;

    // Steering wheel
    this.steeringWheelModel = this.gameObject.getChild("SteeringWheel", true);
    if (this.steeringWheelModel) {
      steeringWheelModelInitialTransform = Matrix.copy(this.steeringWheelModel.transform.matrix);
    }

    // Interior camera
    var interiorCamera = new GameObject("InteriorCamera");
    interiorCamera.transform.position = new Vector(-0.3, 0.35, -0.5);
    interiorCamera.transform.rotation = Quaternion.euler(0, Math.PI, 0);
    this.gameObject.addChild(interiorCamera);

    // Hood camera
    var hoodCamera = new GameObject("HoodCamera");
    hoodCamera.transform.position = new Vector(0, 0.5, 0.8);
    hoodCamera.transform.rotation = Quaternion.euler(0, Math.PI, 0);
    this.gameObject.addChild(hoodCamera);

    // Set camera position
    cameraControllers[currentCameraControllerIndex].onReset();
  };

  this.destroy = function() {
    this.audioContext.close();
    window.removeEventListener("click", resumeAudio);

    physicsEngine.eventHandler.removeEvent("fixedUpdate", this.fixedUpdateFunction);
    
    this.gameObject.delete();

    // graphsManager.delete();
  };

  this.reset = function() {
    this.rb.position.y += 2;
    this.rb.rotation = Quaternion.euler(0, 0 * Math.PI / 2, 0);
    this.gameObject.transform.position = this.rb.position;
    this.gameObject.transform.rotation = this.rb.rotation;

    this.rb.velocity = Vector.zero();
    this.rb.angularVelocity = Vector.zero();
    this.rb.rotation = Quaternion.identity();
    this.rb.inverseWorldInertia = Matrix.identity();
    this.rb._worldCOMOffset = Vector.zero();
    this.rb.torque = Vector.zero();

    this.currentGear = 1;
    this.engine.angularVelocity = 0;
    this.clutch.angularVelocity = 0;

    for (var wheel of this.wheels) {
      wheel.angle = 0;
      wheel.angularVelocity = 0;
      wheel.normalForce = 0;
      wheel.isGrounded = false;
    }

    steerInput = 0;

    this.mainCamera.transform.matrix = Matrix.identity();
    cameraControllers[currentCameraControllerIndex].onReset();
  };

  this.resetGame = function() {
    this.reset();

    this.rb.position = Vector.copy(this.resetPosition);
    this.rb.rotation = Quaternion.copy(this.resetRotation);
    
    this.gameObject.transform.position = this.rb.position;
    this.gameObject.transform.rotation = this.rb.rotation;

    cameraControllers[currentCameraControllerIndex].onReset(this.mainCamera);
  };

  this.renderUI = function(ui) {
    var rpm = this.engine.getRPM();

    var center = {x: ui.width - 140, y: ui.height - 120};
    DrawGuage(ui, rpm, 0, this.engine.maxRPM, center.x, center.y, 100);

    ui.setTextXAlign("center");
    ui.setTextYAlign("middle");

    // RPM
    ui.text(Math.floor(rpm), center.x, center.y - 60, 20, "white");

    // Gear
    ui.roundedRectangle(center.x - 25, center.y - 10 - 30, 50, 55, "rgba(0, 0, 0, 0.25)", 10);
    var redStart = this.engine.maxRPM * 0.9;
    ui.text(isChangingGear ? "N" : this.currentGear == 0 ? "R" : this.currentGear, center.x, center.y - 10, 50, rpm > redStart ? "red" : "white");

    // Speed
    ui.text(Math.abs(Math.floor(this.forwardVelocity * 3.6)), center.x, center.y + 40, 35, "white");
    ui.text("km/h", center.x, center.y + 65, 15, "white");

    // ABS + TCS
    if (this.ABS) ui.text("ABS", center.x - 50, center.y - 22, 15, "red");
    if (this.TCS) ui.text("TCS", center.x - 50, center.y + 2, 15, "blue");

    ui.resetTextXAlign();
    ui.resetTextYAlign();

    // Inputs
    var inputsWidth = 15;
    var inputsSpacing = 25;
    var inputsX = 50;
    ui.rectangle(inputsX, center.y - 30, inputsWidth, 100, "rgba(0, 0, 0, 0.5)");
    ui.rectangle(inputsX, center.y - 30 + 100 * (1 - driveInput), inputsWidth, 100 * driveInput, "white");

    ui.rectangle(inputsX + inputsSpacing, center.y - 30, inputsWidth, 100, "rgba(0, 0, 0, 0.5)");
    ui.rectangle(inputsX + inputsSpacing, center.y - 30 + 100 * (1 - brakeInput), inputsWidth, 100 * brakeInput, "red");

    ui.rectangle(inputsX + inputsSpacing * 2, center.y - 30, inputsWidth, 100, "rgba(0, 0, 0, 0.5)");
    ui.rectangle(inputsX + inputsSpacing * 2, center.y - 30 + 100 * (1 - ebrakeInput), inputsWidth, 100 * ebrakeInput, "orange");

    ui.rectangle(inputsX + inputsSpacing * 3, center.y - 30, inputsWidth, 100, "rgba(0, 0, 0, 0.5)");
    ui.rectangle(inputsX + inputsSpacing * 3, center.y - 30 + 100 * (1 - clutchInput), inputsWidth, 100 * clutchInput, "lime");

    // var x = ui.width / 2;
    // var y = ui.height / 2;
    // var scale = 10;
    // ui.line(x, y, x - this.sidewaysVelocity * scale, y - this.forwardVelocity * scale, 2, "lime");
  };

  this.update = function(dt) {
    if (this.frozen) {
      return;
    }

    if (this.horn) {
      if (keybindings.getInputDown("horn")) {
        this.horn.start();
      }
      if (keybindings.getInputUp("horn")) {
        this.horn.stop();
      }
    }

    if (keybindings.getInputDown("brights")) {
      brightsAreOn = !brightsAreOn;

      if (this.lamps.brightsLeft) this.lamps.brightsLeft.color = brightsAreOn ? [3000, 3000, 3000] : [200, 200, 200];
      if (this.lamps.brightsRight) this.lamps.brightsRight.color = brightsAreOn ? [3000, 3000, 3000] : [200, 200, 200];

      this.setLightEmission("mainFront", brightsAreOn ? [200, 200, 200] : [1, 1, 1]);
    }

    if (keybindings.getInputDown("cameraMode")) {
      cameraControllers[currentCameraControllerIndex].onDeactivate(this.mainCamera);

      currentCameraControllerIndex++;
      currentCameraControllerIndex %= cameraControllers.length;

      cameraControllers[currentCameraControllerIndex].onActivate(this.mainCamera);
    }

    if (keybindings.getInputDown("resetGame")) {
      this.resetGame();
    }

    if (this.rb.position.y < -100) {
      this.resetGame();
    }

    // if (this.frozen) {
    //   return;
    // }

    if (this.canMove) {
      var forward = Vector.negate(Matrix.getForward(carWorldMatrix)); // bruh optimize
      var forwardVelocity = Vector.dot(this.rb.velocity, forward);

      // Drive and brake
      if (this.controlScheme == Car.ControlScheme.Controller) {
        let driveInputData = keybindings.getInputAndInputMethod("drive");
        let targetDriveInput = clamp(driveInputData.value, 0, 1);

        if (driveInputData.method == "keyboard") {
          driveInput += (targetDriveInput - driveInput) * 0.1;
        }
        else if (driveInputData.method == "controller") {
          driveInput = targetDriveInput;
        }

        if (Vector.lengthSqr(this.rb.velocity) < 0.1 && brakeInput > 0.1 && driveInput < 0.01) {
          brakeInput = 1;
        }
        else {
          let brakeInputData = keybindings.getInputAndInputMethod("brake");
          let targetBrakeInput = Math.pow(brakeInputData.value, 3);

          if (brakeInputData.method == "keyboard") {
            brakeInput += (targetBrakeInput - brakeInput) * 0.1;
          }
          else if (brakeInputData.method == "controller") {
            brakeInput = targetBrakeInput;
          }
        }
      }
      else if (this.controlScheme == Car.ControlScheme.Keyboard) {
        var d = clamp(keybindings.getInput("drive"), 0, 1) - keybindings.getInput("brake");

        var targetDriveInput = clamp(Math.abs(d), 0, 1);
        driveInput = targetDriveInput;//(targetDriveInput - driveInput) * 0.3;
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

      // E-brake
      ebrakeInput += (keybindings.getInput("ebrake") - ebrakeInput) * 0.2;

      // Change gear
      var incGear = (inc = 1) => {
        this.currentGear += inc;
        this.currentGear = clamp(this.currentGear, 0, this.allGearRatios.length - 1);
      };

      if (!isChangingGear) {
        if (keybindings.getInputDown("gearDown") && this.currentGear > 0) {
          isChangingGear = true;
          setTimeout(() => {
            incGear(-1);
            isChangingGear = false;
          }, this.gearChangeTime * 1000);
        }
        if (keybindings.getInputDown("gearUp") && this.currentGear < this.allGearRatios.length - 1) {
          isChangingGear = true;
          setTimeout(() => {
            incGear(1);
            isChangingGear = false;
          }, this.gearChangeTime * 1000);
        }
      }

      // Clutch
      // clutchInput = Math.max(
      //   ebrakeInput,
      //   keybindings.getInput("clutch"),
      //   forwardVelocity * 3.6 < 11 ? (1 - driveInput * 0.4) : 0
      // );

      // targetClutchInput = Math.max(
      //   ebrakeInput,
      //   keybindings.getInput("clutch"),
      //   clutchInput - (this.engine.getRPM() - this.engine.minRPM) * 0.001
      // );
      // targetClutchInput = clamp(targetClutchInput, 0, 1);

      // clutchInput += (targetClutchInput - clutchInput) * 0.3;

      // if (isChangingGear) {
      //   clutchInput = 1;
      //   targetClutchInput = 1;
      // }

      if (isChangingGear && !this.canDriveWhenChangingGear && keybindings.getInput("clutch") < 0.05) {
        driveInput = 0;
      }

      // Reset
      if (keybindings.getInputDown("resetCar")) {
        this.reset();
      }
    }
    else {
      driveInput = 0;
      brakeInput = 0;
      ebrakeInput = 1;
      clutchInput = 1;
    }

    // brakeInput = 1;
    
    brakeLightAmount += Math.sign((brakeInput > 1e-6 ? 1 : 0) - brakeLightAmount) / this.brakeLightTurnonTime * dt;
    brakeLightAmount = clamp(brakeLightAmount, 0, 1);

    this.setLightEmission("reverseRear", this.currentGear == 0 ? [50, 50, 50] : [0, 0, 0]);
    this.setLightEmission("brake", [Math.pow(brakeLightAmount, 5) * 50, 0, 0]);
    // this.setLightEmission("mainRear", brakeInput > 0 ? [50, 0, 0] : [0, 0, 0]);
  
    this.engine.update();
  };

  this.fixedUpdate = function(fixedDeltaTime) {
    if (this.frozen) {
      return;
    }

    this.cameraControls(fixedDeltaTime);

    Matrix.copy(this.gameObject.transform.worldMatrix, carWorldMatrix);

    Matrix.inverse(carWorldMatrix, inverseWorldMatrix);
    Matrix.removeTranslation(inverseWorldMatrix);

    // var localVelocity = Matrix.transformVector(inverseWorldMatrix, this.rb.velocity);
    Matrix.transformVector(inverseWorldMatrix, this.rb.angularVelocity, localAngularVelocity);

    // var forward = Vector.negate(Matrix.getForward(carWorldMatrix));
    Matrix.getForward(carWorldMatrix, forward);
    Vector.negate(forward, forward);
    // var sideways = Matrix.getRight(carWorldMatrix);
    Matrix.getRight(carWorldMatrix, sideways);

    var forwardVelocity = Vector.dot(this.rb.velocity, forward);
    this.forwardVelocity = forwardVelocity;
    var sidewaysVelocity = Vector.dot(this.rb.velocity, sideways);

    var carSlipAngle = -Math.atan2(sidewaysVelocity, Math.abs(forwardVelocity));
    if (isNaN(carSlipAngle) || !isFinite(carSlipAngle)) carSlipAngle = 0;

    // Controller steer input
    var userInput = -deadZone(this.canMove ? keybindings.getInput("steer") : 0, 0.1);
    userInput = Math.pow(Math.abs(userInput), this.steerGamma) * Math.sign(userInput);
    userInput = clamp(userInput, -1, 1);

    // Steer limiting
    userInput *= Math.exp(-Math.abs(forwardVelocity) / this.steerVelocity);

    // //
    // if (forwardVelocity * forwardVelocity > 0.1) {
    //   var mu = this.wheels.reduce((acc, w) => acc + w.sidewaysFriction * w.friction, 0) / this.wheels.length;
    //   var maxTheta = Math.atan(this.wheelBase * mu * Math.abs(physicsEngine.gravity.y) / (forwardVelocity * forwardVelocity));
    //   var maxSteerInput = Math.abs(maxTheta / (this.maxSteerAngle / 180 * Math.PI)) + 0.1;
    //   userInput = clamp(userInput, -maxSteerInput, maxSteerInput);
    // }
    
    // Smooth steering
    steerInput += (userInput - steerInput) * this.steerSpeed;
    // steerInput += -Math.sign(steerInput - userInput) * Math.min(Math.abs(steerInput - userInput), 0.05);

    var acs = this.activateAutoCountersteer && (Math.abs(sidewaysVelocity) > 0.5 || forwardVelocity > this.autoCountersteerMinVel) ?
      -carSlipAngle / (this.maxSteerAngle / 180 * Math.PI) * this.autoCountersteer
      - localAngularVelocity.y * this.autoCountersteerVelocityMultiplier * Math.sign(forwardVelocity)
      : 0;
    var currentSteerInput = clamp(steerInput + acs, -1, 1);

    // Set steering wheel model rotation
    if (this.steeringWheelModel) {
      // this.steeringWheelModel.transform.rotation = Quaternion.angleAxis(currentSteerInput * this.steeringWheelModelMaxRotation, Matrix.getForward(steeringWheelModelInitialTransform));

      Matrix.copy(steeringWheelModelInitialTransform, m);
      Matrix.transform([
        ["rz", -currentSteerInput * this.steeringWheelModelMaxRotation]
      ], m);
      this.steeringWheelModel.transform.matrix = m;
    }

    for (let i = 0; i < this.wheels.length; i++) {
      let wheel = this.wheels[i];
      let currentSteerAngle = wheel.turn ? currentSteerInput * this.maxSteerAngle * Math.PI / 180 : 0;

      // Ackermann steering
      if (this.ackermannSteering && ((i == 2 && currentSteerInput > 0) || (i == 3 && currentSteerInput < 0))) {
        currentSteerAngle = Math.sign(currentSteerInput) * Math.atan(this.wheelBase / (this.track + this.wheelBase / Math.tan(Math.abs(currentSteerAngle))));
      }

      // Turn wheel
      Matrix.identity(m);
      Matrix.transform([
        ["translate", wheel.position],
        ["ry", currentSteerAngle]
      ], m);
      wheel.model.transform.matrix = m;

      // Bruh
      let wheelWorldMatrix = wheel.model.transform.worldMatrix;
      Matrix.getUp(wheelWorldMatrix, wheel.up);
      let up = wheel.up;
      Vector.negate(up, down);

      Matrix.transformVector(carWorldMatrix, wheel.position, wheel.worldPos);
      let worldPos = wheel.worldPos;

      this.rb.GetPointVelocity(worldPos, wheelVelocity);
      Vector.multiplyTo(wheelVelocity, fixedDeltaTime);

      let ray = { origin: worldPos, direction: down }; // this is an object !
      let hit = physicsEngine.Raycast(ray.origin, ray.direction)?.firstHit;

      // Simulate bumpy road
      if (hit && hit.gameObject?.customData.bumpiness) {
        let noiseScale = hit.gameObject?.customData.bumpinessNoiseScale ?? 3;
        if (isNaN(noiseScale)) {
          console.error(noiseScale);
          throw new Error("Bumpiness noise scale is NaN");
        }

        let bumpiness = hit.gameObject?.customData.bumpiness;
        if (isNaN(bumpiness)) {
          console.error(bumpiness);
          throw new Error("Bumpiness value is NaN");
        }

        hit.distance -= (perlin.noise(hit.point.x * noiseScale, hit.point.z * noiseScale) + 1) * 0.5 * bumpiness;
      }

      wheel.isGrounded = hit && hit.distance < wheel.suspensionTravel + wheel.radius;

      // Change model transform
      if (wheel.wheelModel) {
        let modelTransform = wheel.wheelModel.transform;

        modelTransform.position.x = wheel.camberAngle / 100;
        modelTransform.position.y = -(wheel.isGrounded ? hit.distance - wheel.radius : wheel.suspensionTravel);
        modelTransform.position.z = 0;

        // !
        modelTransform.rotation = Quaternion.euler(wheel.angle, 0, wheel.camberAngle * Math.PI / 180);
        // modelTransform.rotation = Quaternion.euler(wheel.angle * -wheel.side, wheel.side == 1 ? Math.PI : 0, wheel.camberAngle * Math.PI / 180);
      }
      if (wheel.staticWheelModel) {
        let modelTransform = wheel.staticWheelModel.transform;

        modelTransform.position.x = wheel.camberAngle / 100;
        modelTransform.position.y = -(wheel.isGrounded ? hit.distance - wheel.radius : wheel.suspensionTravel);
        modelTransform.position.z = 0;

        // !
        modelTransform.rotation = Quaternion.euler(0, wheel.side == 1 ? Math.PI : 0, wheel.camberAngle * Math.PI / 180);
      }

      // Set skidmarks emit position
      if (wheel.skidmarks) {
        if (wheel.isGrounded) {
          wheel.skidmarks.emitPosition = Vector.add(Vector.add(hit.point, new Vector(0, 0.01, 0)), wheelVelocity);
          wheel.skidmarks.emitNormal = hit.normal;
        }
        else {
          wheel.skidmarks.emitPosition = Vector.add(Vector.add(worldPos, Vector.multiply(up, -wheel.radius)), wheelVelocity);
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

    highestSkidFreq = 1;
    highestSkidVolume = 0;
    activateTCS = false;
    var lastEngineRPM = this.engine.getRPM();
    let getClutchInput = keybindings.getInput("clutch");

    var lambdaAccumulated = new Array(this.wheels.length).fill(0);

    var iters = 20;
    var dt = fixedDeltaTime / iters;
    for (let count = 0; count < iters; count++) {
      // Clutch input

      var rpmChange = (this.engine.getRPM() - lastEngineRPM) * dt;

      targetClutchInput = Math.max(
        ebrakeInput,
        getClutchInput,
        clutchInput - (this.engine.getRPM() - (this.engine.minRPM + 800)) * 0.002 - rpmChange * 20
      );
      targetClutchInput = clamp(targetClutchInput, 0, 1);
      // clutchInput = targetClutchInput;
      clutchInput += (targetClutchInput - clutchInput) * 0.3;

      if (isChangingGear) {
        clutchInput = 1;
        targetClutchInput = 1;
      }

      lastEngineRPM = this.engine.getRPM();
      //

      this.engine.fixedUpdate(dt, activateTCS);
      activateTCS = false;

      clutchConstraint(this.engine, this.clutch, dt, 1, 1, Math.pow(1 - clutchInput, 4) * this.clutch.impulseCapacity);

      let totalGearRatio = (this.currentGear == 0 ? -1 : 1) * this.allGearRatios[this.currentGear] * this.differentialRatio;
      if (
        this.differentialType == Car.ENUMS.DIFFERENTIAL.OPEN ||
        this.differentialType == Car.ENUMS.DIFFERENTIAL.LSD
      ) {
        let LSDFactor = this.differentialType == Car.ENUMS.DIFFERENTIAL.LSD ? this.LSDFactor : 0;

        if (this.drivetrain == "RWD") {
          differentialConstraint(this.clutch, this.wheels[0], this.wheels[1], dt, totalGearRatio, LSDFactor);
        }
        else if (this.drivetrain == "FWD") {
          differentialConstraint(this.clutch, this.wheels[2], this.wheels[3], dt, totalGearRatio, LSDFactor);
        }
        else if (this.drivetrain == "AWD") {
          differentialConstraint(this.rearDiffConnector, this.wheels[0], this.wheels[1], dt, totalGearRatio, LSDFactor);
          differentialConstraint(this.frontDiffConnector, this.wheels[2], this.wheels[3], dt, totalGearRatio, LSDFactor);
          differentialConstraint(this.clutch, this.rearDiffConnector, this.frontDiffConnector, dt, 1);
        }
      }
      else if (this.differentialType == Car.ENUMS.DIFFERENTIAL.LOCKED) {
        if (this.drivetrain == "RWD" || this.drivetrain == "AWD") {
          gearConstraint(this.clutch, this.wheels[0], dt, 1, 1 / totalGearRatio);
          gearConstraint(this.clutch, this.wheels[1], dt, 1, 1 / totalGearRatio);
        }
        if (this.drivetrain == "FWD" || this.drivetrain == "AWD") {
          gearConstraint(this.clutch, this.wheels[2], dt, 1, 1 / totalGearRatio);
          gearConstraint(this.clutch, this.wheels[3], dt, 1, 1 / totalGearRatio);
        }
      }

      // Reset normal forces
      for (var wheel of this.wheels) {
        wheel.normalForce = 0;
      }

      // Bottom out
      simulateBottomOut(fixedDeltaTime, lambdaAccumulated);

      // Suspension
      simulateSuspension(dt);

      // Rollbars
      simulateRollbars(dt);

      // Friction
      if (this.simulateFriction) {
        simulateFriction(dt, sidewaysVelocity);
      }
    }

    // Emit smoke
    for (let wheel of this.wheels) {
      wheel.angle += wheel.angularVelocity * fixedDeltaTime;

      if (wheel.isGrounded && !wheel.groundHit.gameObject?.customData.offroad) {
        let wheelWorldMatrix = wheel.model.transform.worldMatrix;
        let forward = Vector.negate(Matrix.getForward(wheelWorldMatrix));
        let forwardVelocity = Vector.dot(this.rb.velocity, forward);

        let speedDiff = wheel.angularVelocity * wheel.radius - forwardVelocity;
        speedDiff *= wheel.roadFriction * wheel.forwardFriction * wheel.friction;
        if (Math.abs(speedDiff) > 5) {
          let up = Matrix.getUp(wheelWorldMatrix);
          let worldPos = Matrix.transformVector(carWorldMatrix, wheel.position);
          Vector.addTo(worldPos, Vector.multiply(up, -wheel.radius));
          this.smoke.emitPosition = (dst) => Vector.set(dst, worldPos);

          let sideways = Matrix.getRight(wheelWorldMatrix);
          let driveForwardVector = Quaternion.QxV(Quaternion.angleAxis(-Math.PI / 2, sideways), wheel.groundHit.normal);
          // let [ tangent, bitangent ] = Vector.formOrthogonalBasis(driveForwardVector);
          let basis = Matrix.basis(sideways, Vector.cross(sideways, driveForwardVector), driveForwardVector);

          this.smoke.emitVelocity = (dst) => {
            new Vector((Math.random() - 0.5), Math.random() * 0.5, 3.5, dst);
            Matrix.transformVector(basis, dst, dst);
            // v.y += 0.5;
          };
          
          this.smoke.alpha = clamp((Math.abs(speedDiff) - 5) / 10, 0, 1) * 0.1;
          this.smoke.emit();

          // gamepadManager.vibrate(20, 0.5, 0.1);
        }
      }
    }

    // Downforce
    for (let wing of this.wings) {
      wing.applyForce(this.rb, forwardVelocity);
    }

    // Drag
    this.rb.angularVelocity.x *= 0.995;
    this.rb.angularVelocity.y *= 0.995;
    this.rb.angularVelocity.z *= 0.995;

    // Skid audio
    if (this.skidSource && this.skidGain) {
      this.skidGain.gain.value += (highestSkidVolume * 0.5 - this.skidGain.gain.value) * 0.1;
      this.skidSource.playbackRate.value = highestSkidFreq;//clamp(0.8 + highestSkidVolume * 0.8, 1, 1.4);
    }

    // Offroad audio
    if (this.offroadSource && this.offroadGain) {
      if (this.wheels.some(w => w.isGrounded && w.groundHit.gameObject?.customData.offroad)) {
        let g = clamp(Vector.length(this.rb.velocity) / 3, 0, 0.7);
        if (isFinite(g)) {
          this.offroadGain.gain.value = g;
        }

        let r = clamp(0.8 + Vector.length(this.rb.velocity) / 15, 1, 1.4);
        if (isFinite(r)) {
          this.offroadSource.playbackRate.value = r;
        }
      }
      else {
        this.offroadGain.gain.value = 0;
      }
    }

    // Bottom out audio
    let bottomOutStrength = Math.max(...this.wheels.map(w => w.bottomOutStrength));
    if (bottomOutStrength > 0 && this.bottomOutSample && !hasPlayedBottomOutSound) {
      let { source, gainNode } = playSample(this.audioContext, this.bottomOutSample);
      source.loop = false;
      source.playbackRate.value = 0.9 + Math.random() * 0.2;

      gainNode.gain.value = clamp(bottomOutStrength / 3000, 0, 1.5);
      gainNode.connect(this.mainGainNode);
      
      hasPlayedBottomOutSound = true;
      setTimeout(() => {
        hasPlayedBottomOutSound = false;
      }, 100);
    }

    // updateEngineRPM();
  };

  this.setLightEmission = function(lightName, value = [0, 0, 0]) {
    var mat = lightMaterials[lightName];
    if (mat) {
      if (!Array.isArray(value)) {
        value = [value, value, value];
      }
      mat.setUniform("emissiveFactor", value);
    }
  };

  this.cameraControls = function(dt) {
    var cameraController = cameraControllers[currentCameraControllerIndex];
    cameraController.update(this.mainCamera, dt);
  };

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

  function RotationConnector() {
    this.angularVelocity = 0;
    this.inertia = 0.005 * 10;
  }

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

    // var hasLoadedSound = false;
    var rpmChange = 1;
    // var audioFolder = _this.path + "cargame/engineSound/x8";
    // var audioFolder = _this.path + "cargame/engineSound/i6";
    // var samples = [
    //   { rpm: 1000 * 2, on: audioFolder + "/low_on.wav" },
    //   { rpm: 1600 * 2, on: audioFolder + "/med_on.wav" },
    //   { rpm: 3100 * 2, on: audioFolder + "/high_on.wav" }
    // ];
    
    var folder = _this.path + "cargame/engineSound/i6/";
    // var folder = _this.path + "cargame/engineSound/x8/";
    var baseMult = 1.4;
    var samples = [
      { baseRPM: 750, from: -5000, to: 1000, on: folder + "idle.wav", off: folder + "idle.wav", interior_on: folder + "int_idle.wav", interior_off: folder + "int_idle.wav" },
      { baseRPM: 1125, from: 1000, to: 2500, on: folder + "low_on.wav", off: folder + "low_off.wav", interior_on: folder + "int_low_on.wav", interior_off: folder + "int_low_off.wav" },
      { baseRPM: 1900, from: 2500, to: 5000, on: folder + "med_on.wav", off: folder + "med_off.wav", interior_on: folder + "int_med_on.wav", interior_off: folder + "int_med_off.wav" },
      { baseRPM: 3500, from: 1000, to: 15000, on: folder + "high_on.wav", off: folder + "high_off.wav", interior_on: folder + "int_high_on.wav", interior_off: folder + "int_high_off.wav" }
    ];
    // var samples = [
    //   { baseRPM: 1500, on: folder + "low_on.wav" },
    //   { baseRPM: 4000, on: folder + "med_on.wav" },
    //   { baseRPM: 7000, on: folder + "high_on.wav" }
    // ];

    this.setupAudio = async function(context, mainGainNode) {
      for (let i of samples) {
        if (i.on) {
          loadSample(context, i.on).then(sample => {
            let { source, gainNode } = playSample(context, sample);
            i.onSource = source;
            i.onGain = gainNode;
            gainNode.connect(mainGainNode);
        
            gainNode.gain.value = 0;
          });
        }

        if (i.off) {
          loadSample(context, i.off).then(sample => {
            let { source, gainNode } = playSample(context, sample);
            i.offSource = source;
            i.offGain = gainNode;
            gainNode.connect(mainGainNode);
        
            gainNode.gain.value = 0;
          });
        }

        if (i.interior_on) {
          loadSample(context, i.interior_on).then(sample => {
            let { source, gainNode } = playSample(context, sample);
            i.interiorOnSource = source;
            i.interiorOnGain = gainNode;
            gainNode.connect(mainGainNode);
        
            gainNode.gain.value = 0;
          });
        }

        if (i.interior_off) {
          loadSample(context, i.interior_off).then(sample => {
            let { source, gainNode } = playSample(context, sample);
            i.interiorOffSource = source;
            i.interiorOffGain = gainNode;
            gainNode.connect(mainGainNode);
        
            gainNode.gain.value = 0;
          });
        }
      }
    };

    this.update = function() {
      // RPM limiter
      if (this.getRPM() >= this.maxRPM) {
        this.canThrottle = false;

        clearTimeout(throttleTimeout);
        throttleTimeout = setTimeout(() => {
          this.canThrottle = true;
        }, this.rpmLimiterDelay);
      }

      this.handleAudio();
    };

    this.fixedUpdate = function(dt, activateTCS = false) {
      var currentTorque = this.torqueLookup(this.getRPM()) * this.torque;

      if (this.canThrottle) {
        var virtualDriveInput = driveInput;

        if (this.getRPM() < this.minRPM) {
          virtualDriveInput = clamp(clamp((this.minRPM - this.getRPM()) / 100, 0, 0.4) + virtualDriveInput, 0, 1);
        }

        // bruh works surprisingly well... (on friction approx. eq. to 1)
        if (activateTCS) {
          virtualDriveInput *= 0.2;
        }

        // var targetRPM = driveInput * this.maxRPM;
        // if (this.getRPM() < targetRPM) {
          this.angularVelocity += virtualDriveInput * /*clamp(Math.abs(this.getRPM() - targetRPM) / 500, 0, 1) **/ currentTorque / this.inertia * dt;
        // }

        if (virtualDriveInput && this.getRPM() > this.maxRPM) {
          this.angularVelocity = this.maxRPM / radPerSecToRPM + 10;
        }

        rpmChange -= (rpmChange - virtualDriveInput) * 0.11;
      }
      else {
        rpmChange -= (rpmChange - 0) * 0.11;
      }

      // Friction
      this.angularVelocity += Math.min(Math.abs(this.angularVelocity), this.friction / this.inertia * dt) * -Math.sign(this.angularVelocity);
    };

    this.handleAudio = function() {
      var rpm = clamp(this.getRPM(), 0, this.maxRPM);

      for (let sample of samples) {
        var x = rpm;
        var a = sample.from;
        var b = sample.to;
        var w = (b - a) / 2;
        var o = (a + b) / 2;
        var f = 750 * 1.5 * 2;

        // var volume = Math.exp(-(10 ** (-6.7)) * Math.pow(rpm - sample.baseRPM, 2)) * (Math.max(0, rpmChange) * 2 / 3 + 1 / 3);
        var volume = Math.max(0, Math.min(1, w / f - Math.abs((x - o) / f) + 0.5));
        var rate = rpm / (sample.baseRPM * baseMult);

        if (isFinite(volume) && isFinite(rate)) {
          if (_this.getCurrentCameraController() instanceof InteriorFollowCamera) {
            if (sample.interiorOnGain) {
              sample.interiorOnGain.gain.value = volume * 0.3 * rpmChange;
              sample.interiorOnSource.playbackRate.value = rpm / (sample.baseRPM * baseMult);
            }

            if (sample.interiorOffGain) {
              sample.interiorOffGain.gain.value = volume * 0.4 * (1 - rpmChange); 
              sample.interiorOffSource.playbackRate.value = rpm / (sample.baseRPM * baseMult);
            }

            if (sample.onGain) {
              sample.onGain.gain.value = 0;
            }
            if (sample.offGain) {
              sample.offGain.gain.value = 0;
            }
          }
          else {
            if (sample.onGain) {
              sample.onGain.gain.value = volume * 0.3 * rpmChange;
              sample.onSource.playbackRate.value = rpm / (sample.baseRPM * baseMult);
            }

            if (sample.offGain) {
              sample.offGain.gain.value = volume * 0.4 * (1 - rpmChange); 
              sample.offSource.playbackRate.value = rpm / (sample.baseRPM * baseMult);
            }

            if (sample.interiorOnGain) {
              sample.interiorOnGain.gain.value = 0;
            }
            if (sample.interiorOffGain) {
              sample.interiorOffGain.gain.value = 0;
            }
          }
        }
      }

      // Engine sound
      // var rpm = clamp(this.getRPM(), 0, this.maxRPM);
      // var i = 0;

      // var a = 3000;
      // var b = 6000;
      // var os = [0, (a + b) / 2, this.maxRPM]; // yes, very intuative....
      // var ws = [a, (b - a) / 2, os[2] - b];

      // for (var sample of samples) {
      //   if (sample.onSource && sample.onGain) {
      //     var x = rpm;
      //     var o = os[i];
      //     var w = ws[i];
      //     var falloff = 500;//1000
      //     var g = Math.max(0, Math.min(1, w / falloff - Math.abs((x - o) / falloff) + 0.5));
      //     g *= 0.3;

      //     // var g = Math.exp(-(10 ** (-6.7)) * Math.pow(rpm - sample.rpm, 2)) * (Math.max(0, rpmChange) * 2 / 3 + 1 / 3) * 0.3;
      //     if (isFinite(g)) {
      //       sample.onGain.gain.value = g;
      //     }

      //     var pbr = rpm / sample.rpm;
      //     if (isFinite(pbr)) {
      //       sample.onSource.playbackRate.value = pbr;
      //     }
      //   }
        
      //   i++;
      // }

      // for (var sample of samples) {
      //   if (sample.onSource && sample.onGain) {
      //     var g = Math.exp(-(10 ** (-6.7)) * Math.pow(rpm - sample.rpm, 2)) * (Math.max(0, rpmChange) * 2 / 3 + 1 / 3) * 0.3;
      //     if (isFinite(g)) {
      //       sample.onGain.gain.value = g;
      //     }
      //     var pbr = rpm / sample.rpm;
      //     if (isFinite(pbr)) {
      //       sample.onSource.playbackRate.value = pbr;
      //     }
      //   }
      // }
    };

    this.getRPM = function() {
      return this.angularVelocity * radPerSecToRPM;
    };

    this.torqueLookup = function(rpm) {
      return (-Math.pow(Math.abs((rpm - 4600) / 145), 1.4) + 309) / 309;
    };
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

  {
    let _r = new Vector();
    let _furthestPoint = new Vector();

    var simulateBottomOut = (fixedDeltaTime, lambdaAccumulated) => {
      let wheelIndex = 0;
      for (let wheel of this.wheels) {
        // Bruh
        // var wheelWorldMatrix = wheel.model.transform.worldMatrix;
        // var up = Matrix.getUp(wheelWorldMatrix);

        // var worldPos = Matrix.transformVector(carWorldMatrix, wheel.position);
        // var wheelVelocity = this.rb.GetPointVelocity(worldPos);

        // var ray = {origin: worldPos, direction: Vector.negate(up)};
        // var hit = physicsEngine.Raycast(ray.origin, ray.direction).firstHit;

        wheel.bottomOutStrength = 0;

        let ray = wheel.ray;
        let hit = wheel.groundHit;
        // let worldPos = wheel.worldPos;
        // let up = wheel.up;
        // let wheelVelocity = this.rb.GetPointVelocity(worldPos);

        if (wheel.isGrounded && hit && hit.distance < wheel.suspensionTravel + wheel.radius) {
          Vector.multiply(ray.direction, wheel.radius + wheel.stopLength, _tempVector);
          Vector.add(ray.origin, _tempVector, _furthestPoint);

          Vector.subtract(hit.point, _furthestPoint, _tempVector);
          let C = -Vector.dot(_tempVector, hit.normal);

          // let furthestPoint = Vector.add(ray.origin, Vector.multiply(ray.direction, wheel.radius + wheel.stopLength));
          // let C = -Vector.dot(Vector.subtract(hit.point, furthestPoint), hit.normal);

          if (C < 0) {
            wheel.isGrounded = true;

            Vector.subtract(_furthestPoint, this.rb.position, _tempVector);
            Vector.cross(_tempVector, hit.normal, _r);
            // let r = Vector.cross(Vector.subtract(_furthestPoint, this.rb.position), hit.normal);

            let jacobian = [
              hit.normal.x,
              hit.normal.y,
              hit.normal.z,
              _r.x,
              _r.y,
              _r.z
            ];

            let it = this.rb.inverseWorldInertia;

            let JM = [
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

            let beta = 0.15;
            let bias = beta / fixedDeltaTime * (C);
            let JMJ = multiply1DMatrices(JM, jacobian);

            let velocityMatrix = [
              this.rb.velocity.x,
              this.rb.velocity.y,
              this.rb.velocity.z,
              this.rb.angularVelocity.x,
              this.rb.angularVelocity.y,
              this.rb.angularVelocity.z
            ];

            let JV = multiply1DMatrices(jacobian, velocityMatrix);
            let lambda = -(JV + bias) / JMJ;

            if (lambdaAccumulated[wheelIndex] + lambda < 0) {
              lambda = -lambdaAccumulated[wheelIndex];
            }
            lambdaAccumulated[wheelIndex] += lambda;

            Vector.addTo(this.rb.velocity, Vector.multiply(new Vector(jacobian[0], jacobian[1], jacobian[2]), lambda / this.rb.mass));
            Vector.addTo(this.rb.angularVelocity, Matrix.transformVector(this.rb.inverseWorldInertia, Vector.multiply(new Vector(jacobian[3], jacobian[4], jacobian[5]), lambda)));
            // this.rb.angularVelocity = Vector.add(this.rb.angularVelocity, divideVectorAndVector(Vector.multiply(new Vector(jacobian[3], jacobian[4], jacobian[5]), lambda), this.rb.inertia));

            wheel.normalForce = Math.abs(lambdaAccumulated[wheelIndex] / fixedDeltaTime);
            wheel.bottomOutStrength = Math.max(wheel.bottomOutStrength, Math.abs(lambdaAccumulated[wheelIndex]));


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
    };
  }

  {
    let _wheelVelocity = new Vector();
    let currentSpringForce = new Vector();
    let currentDampingForce = new Vector();
    let totalForce = new Vector();

    var simulateSuspension = (dt) => {
      for (let wheel of this.wheels) {
        let ray = wheel.ray;
        let hit = wheel.groundHit;
        let worldPos = wheel.worldPos;
        let up = wheel.up;
        this.rb.GetPointVelocity(worldPos, _wheelVelocity);

        if (wheel.isGrounded) {
          let rayDist = hit.distance;

          let springError = wheel.suspensionTravel - (rayDist - wheel.radius);
          // let springError = 1 - (rayDist - wheel.radius) / wheel.suspensionTravel;

          // Spring force
          Vector.multiply(ray.direction, springError * -wheel.suspensionForce, currentSpringForce);
          
          // Damping force
          Vector.projectOnPlane(this.rb.velocity, hit.normal, _tempVector);
          Vector.subtract(_wheelVelocity, _tempVector, _tempVector);
          Vector.project(_tempVector, up, _tempVector);
          Vector.multiply(_tempVector, -wheel.suspensionDamping, currentDampingForce);
          
          // Total force
          Vector.add(currentSpringForce, currentDampingForce, totalForce);
          
          // Impulse
          Vector.multiply(totalForce, dt, _tempVector);
          this.rb.AddImpulseAtPosition(_tempVector, worldPos);

          wheel.normalForce += Vector.length(totalForce);
          wheel.compressionAmount = clamp(springError / wheel.suspensionTravel, 0, 1);
        }
      }
    };
  }

  {
    var simulateRollbars = (dt) => {
      for (let rollbar of this.rollbars) {
        let aComp = rollbar.a.compressionAmount ?? 0;
        let bComp = rollbar.b.compressionAmount ?? 0;
        let force = (aComp - bComp) * this.antiRoll;

        if (rollbar.a.isGrounded) {
          Vector.multiply(rollbar.a.up, (rollbar.b.isGrounded ? 1 : 2) * force * dt, _tempVector);
          this.rb.AddImpulseAtPosition(_tempVector, rollbar.a.worldPos);
        }

        if (rollbar.b.isGrounded) {
          Vector.multiply(rollbar.b.up, (rollbar.a.isGrounded ? 1 : 2) * -force * dt, _tempVector);
          this.rb.AddImpulseAtPosition(_tempVector, rollbar.b.worldPos);
        }
      }
    };
  }

  {
    let forward = new Vector();
    let sideways = new Vector();
    let worldPos = new Vector();
    let wheelVelocity = new Vector();
    let driveSidewaysVector = new Vector();
    let driveForwardVector = new Vector();

    var simulateFriction = (dt, sidewaysVelocity) => {
      for (let wheel of this.wheels) {
        let slipAngle = 0;
        let forwardVelocity = 0;

        let wheelWorldMatrix = wheel.model.transform.worldMatrix;
        // let wheelWorldMatrix = carWorldMatrix; // This does not work when the wheels are 90 deg turned

        // let up = Matrix.getUp(wheelWorldMatrix);
        Matrix.getForward(wheelWorldMatrix, forward);
        // forward = Vector.negate(forward);
        Matrix.getRight(wheelWorldMatrix, sideways);

        Matrix.transformVector(carWorldMatrix, wheel.position, worldPos);
        this.rb.GetPointVelocity(worldPos, wheelVelocity);

        // Ebrake
        if (ebrakeInput > 0.1 && wheel.ebrake) {
          // wheel.angularVelocity = -forwardVelocity / wheel.radius * (1 - ebrakeInput);
          wheel.angularVelocity += -Math.sign(wheel.angularVelocity) * Math.min(ebrakeInput * ebrakeTorque, Math.abs(wheel.angularVelocity) / dt) * dt;
        }

        if (wheel.isGrounded) {
          forwardVelocity = Vector.dot(wheelVelocity, forward);
          let sidewaysVelocity = Vector.dot(wheelVelocity, sideways);

          if (brakeInput != 0) {
            if (this.ABS) { // bruh, ABS ignores max brake torque
              let a = wheel.lastA ?? 0;
              let targetSlip = wheel.slipRatioPeak * Math.sqrt(Math.max(0.01, 1 - a * a)) * Math.sign(forwardVelocity);
              let w = lerp(-forwardVelocity / wheel.radius, (targetSlip * Math.abs(forwardVelocity) - forwardVelocity) / wheel.radius, brakeInput);

              wheel.angularVelocity = Math.abs(forwardVelocity) < 1 ? 0 : w;
            }
            else {
              wheel.angularVelocity += -Math.sign(wheel.angularVelocity) * Math.min(brakeInput * this.brakeTorque / wheel.inertia, Math.abs(wheel.angularVelocity) / dt) * dt;
              // wheel.angularVelocity = -forwardVelocity / wheel.radius * (1 - brakeInput);
            }
          }


          // Friction
          // wheelVelocity = this.rb.GetPointVelocity(wheel.contactPoint);

          const isOffroad = wheel.groundHit.gameObject?.customData?.offroad;
          const wheelFriction = isOffroad ? wheel.offroadFriction : wheel.friction;
          let roadFriction = wheel.groundHit.gameObject?.customData?.friction ?? 1;
          wheel.roadFriction = roadFriction;

          // wheel.angularVelocity += currentDriveTorque / wheel.inertia * dt;

          // wheel.slipAnglePeak = findPeak(x => { // bruh performance heavy
          //   return advancedFy(x * 180 / Math.PI, wheel.normalForce, wheel.camberAngle, wheel.advancedSlipAngleCoeffs);
          // });

          // let currentSteerAngle = wheel.turn ? currentSteerInput * this.maxSteerAngle * Math.PI / 180 : 0;
          slipAngle = -Math.atan(sidewaysVelocity / Math.abs(forwardVelocity));// - currentSteerAngle * Math.sign(forwardVelocity); // Not needed when using wheel transform instead of car transform
          // if (Math.abs(forwardVelocity) < 0.02) {
          //   slipAngle = clamp(sidewaysVelocity * 0.01, -0.1, 0.1);
          // }
          // slipAngle *= Math.min((sidewaysVelocity ** 2 + forwardVelocity ** 2) * 10, 1);
          if (isNaN(slipAngle) || !isFinite(slipAngle)) slipAngle = 0;
          let a = slipAngle / wheel.slipAnglePeak;
          wheel.lastA = a;

          // // TCS
          // if (this.TCS && Math.abs(currentDriveTorque) > 0.01 && Math.abs(forwardVelocity) > 0.5) {
          //   var TCStargetSlip = -wheel.slipRatioPeak * Math.sqrt(Math.max(0.01, 1 - a * a)) * Math.sign(forwardVelocity);
          //   var targetAngularVelocity = (TCStargetSlip * Math.abs(forwardVelocity) - forwardVelocity) / wheel.radius;
          //   wheel.angularVelocity = clamp(wheel.angularVelocity, -Math.abs(targetAngularVelocity), Math.abs(targetAngularVelocity));
          // }

          var slipRatio = -(wheel.angularVelocity * wheel.radius + forwardVelocity) / Math.abs(forwardVelocity) * Math.min(Math.abs(forwardVelocity) / 2, 1);
          if (isNaN(slipRatio)) slipRatio = 0;
          if (!isFinite(slipRatio)) slipRatio = Math.sign(slipRatio);
          var s = slipRatio / wheel.slipRatioPeak;

          if (this.TCS && Math.abs(wheel.angularVelocity * wheel.radius + forwardVelocity) > 1) {
            activateTCS = true;
          }

          var rho = Math.sqrt(s * s + a * a);

          var Fx = (_slipRatio) => {
            return magicFormula(_slipRatio, wheel.slipRatioCoeffs) * roadFriction * wheelFriction * wheel.forwardFriction;
          };
          var Fy = ( _slipAngle) => {
            return advancedFy(_slipAngle * 180 / Math.PI, wheel.normalForce, wheel.camberAngle, wheel.advancedSlipAngleCoeffs) * roadFriction * wheelFriction * wheel.sidewaysFriction;
            // return magicFormula(_slipAngle * 180 / Math.PI - wheel.camberAngle * wheel.camberAngleCoeff, wheel.slipAngleCoeffs) * roadFriction * wheelFriction * wheel.sidewaysFriction;
          };

          // if (count == iters - 1) {
          //   wheel.graph.plot(performance.now(), a);
          // }

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
          
          Vector.projectOnPlane(sideways, wheel.groundHit.normal, driveSidewaysVector);
          Quaternion.angleAxis(-Math.PI / 2, driveSidewaysVector, _tempQuat);
          Quaternion.QxV(_tempQuat, wheel.groundHit.normal, driveForwardVector);
          if (!isNaN(finalForceX)) {
            Vector.multiply(driveForwardVector, finalForceX * dt, _tempVector);
            this.rb.AddImpulseAtPosition(_tempVector, wheel.contactPoint);
          }
          if (!isNaN(finalForceY)) {
            Vector.multiply(driveSidewaysVector, finalForceY * dt, _tempVector);
            this.rb.AddImpulseAtPosition(_tempVector, wheel.contactPoint);
          }

          // if (renderer.debugMode && count == 0) {
          //   Debug.Vector(worldPos, driveForwardVector, 1, [1, 0, 0]);
          //   Debug.Vector(worldPos, driveSidewaysVector, 1, [0, 1, 0]);
          // }



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
          // Allows for braking mid-air
          if (brakeInput != 0 && !this.ABS) {
            wheel.angularVelocity += -Math.sign(wheel.angularVelocity) * Math.min(brakeInput * this.brakeTorque, Math.abs(wheel.angularVelocity) / dt) * dt;
          }
        }

        // Skid audio frequency
        var skidFreq = 0.8 + clamp((Math.abs(slipRatio) - 0.2) * 0.7, 0, 0.8);
        if (skidFreq > highestSkidFreq) {
          highestSkidFreq = skidFreq;
        }

        // Skid audio volume
        let skidVolume = 0;
        if (wheel.isGrounded && !wheel.groundHit.gameObject?.customData.offroad) {
          skidVolume = smoothstep(rho, 1, 1.1);

          let totalForwardVelocity = wheel.angularVelocity * wheel.radius + forwardVelocity;
          let velocity = totalForwardVelocity ** 2 + sidewaysVelocity ** 2;
          skidVolume *= smoothstep(velocity, 0, 2);

          if (skidVolume > highestSkidVolume) {
            highestSkidVolume = skidVolume;
          }
        }

        // if (wheel.isGrounded && !wheel.groundHit.gameObject?.customData.offroad && ((Math.abs(slipAngle) > 0.2 && Math.abs(forwardVelocity) > 0.5) || Math.abs(slipRatio) > 0.2)) {
        //   skidVolume = clamp(Math.abs(slipRatio) - 0.2, 0, 1) + clamp((Math.abs(slipAngle) - 0.2) * (1 - Math.exp(-Math.abs(forwardVelocity) * 0.06)), 0, 1);
        //   skidVolume *= wheel.friction * wheel.forwardFriction * wheel.roadFriction;

        //   if (skidVolume > highestSkidVolume) {
        //     highestSkidVolume = skidVolume;
        //   }
        // }

        // Skidmark intensity
        if (wheel.skidmarks) {
          wheel.skidmarks.emit = clamp(clamp(skidVolume * 20 * (wheel.isGrounded ? 1 : 0.01 * 0), 0, 0.7) * (wheel.isGrounded ? clamp(wheel.normalForce / 5000, 0, 1) * wheel.friction * wheel.forwardFriction * wheel.roadFriction : 0), 0, 1); // bruh, what even is this
        }

        wheel.slipRatio = slipRatio;
      }
    };
  }

  function DrawGuage(ui, t, min, max, x, y, size = 100) {
    t = clamp(t, min - 100, max + 100);

    var redStart = Math.PI * 2.1;

    ui.beginPath();
    ui.arc(x, y, size - size * 0.125 / 2, Math.PI * 0.75, redStart);
    ui.lineWidth(size * 0.125);
    ui.strokeStyle("rgba(0, 0, 0, 0.25)");
    ui.stroke();

    ui.beginPath();
    ui.arc(x, y, size - size * 0.125 / 2, redStart, Math.PI * 2.25);
    ui.lineWidth(size * 0.125);
    ui.strokeStyle("rgba(255, 0, 0, 0.25)");
    ui.stroke();

    ui.beginPath();
    ui.arc(x, y, size - size * 0.125 / 2, Math.PI * 0.75, ui.mapValue(t, min, max, Math.PI * 0.75, Math.PI * 2.25));
    ui.lineWidth(size * 0.125);
    ui.strokeStyle("white");
    ui.stroke();
  
    // var tickColor = "#333";
    // var meterColor = "rgb(255, 40, 40)";
  
    // ui.setTextXAlign("center");
    // ui.setTextYAlign("center");
  
    // var steps = max / 1000;
    // var tickSize = 0.9;
    // var number = 0;
    // for (var i = 0; i <= 270; i += 270 / steps) {
    //   var angle = (i + 135) * Math.PI / 180;
    //   ui.line(x + Math.cos(angle) * size, y + Math.sin(angle) * size, x + Math.cos(angle) * (size * tickSize), y + Math.sin(angle) * (size * tickSize), tickColor, 2);
    //   ui.text(number, x + Math.cos(angle) * (size * tickSize * 0.9), y + Math.sin(angle) * (size * tickSize * 0.9), size / 8, tickColor);
  
    //   number++;
    // }
  
    // ui.resetTextXAlign();
    // ui.resetTextYAlign();
  
    // var tickSize = 0.95;
    // for (var i = 0; i <= 270; i += 270 / steps / 5) {
    //   var angle = (i + 135) * Math.PI / 180;
    //   ui.line(x + Math.cos(angle) * size, y + Math.sin(angle) * size, x + Math.cos(angle) * (size * tickSize), y + Math.sin(angle) * (size * tickSize), tickColor, 1);
    // }
  
    // var angle = (ui.mapValue(t, min, max, 0, 270) + 135) * Math.PI / 180;
  
    // ui.beginPath();
    // ui.lineTo(x + Math.cos(angle + Math.PI / 2) * size * 0.03, y + Math.sin(angle + Math.PI / 2) * size * 0.02);
    // ui.lineTo(x - Math.cos(angle + Math.PI / 2) * size * 0.03, y - Math.sin(angle + Math.PI / 2) * size * 0.02);
    // ui.lineTo(
    //   x + Math.cos(angle) * size * 0.95 - Math.cos(angle + Math.PI / 2) * size * 0.01,
    //   y + Math.sin(angle) * size * 0.95 - Math.sin(angle + Math.PI / 2) * size * 0.01
    // );
    // ui.lineTo(
    //   x + Math.cos(angle) * size * 0.95 + Math.cos(angle + Math.PI / 2) * size * 0.01,
    //   y + Math.sin(angle) * size * 0.95 + Math.sin(angle + Math.PI / 2) * size * 0.01
    // );
    // ui.closePath();
    // ui.fillStyle(meterColor);
    // ui.fill();
  
    // ui.save();
    // ui.beginPath();
    // ui.arc(x, y, size * 0.3, 0, Math.PI * 2);
    // ui.clip();
  
    // ui.clearScreen(); // Do not remove, stupid!
  
    // ui.restore();
  }
}
Car.ENUMS = {
  DIFFERENTIAL: { OPEN: 0, LOCKED: 1, LSD: 2 }
};

Car.ControlScheme = {
  Keyboard: 0,
  Controller: 1,
};

function Wheel(car, position = Vector.zero(), model, settings = {}) {
  this.position = position;
  this.model = model;
  this.side = 1;

  this.offroadFriction = settings.offroadFriction ?? 0.5;
  this.friction = settings.friction ?? 1;
  this.forwardFriction = settings.forwardFriction ?? 1;
  this.sidewaysFriction = settings.sidewaysFriction ?? 1;
  this.radius = settings.radius ?? 0.35;
  this.camberAngle = 0;
  this.camberAngleCoeff = settings.camberAngleCoeff ?? 1;

  this.stopLength = settings.stopLength ?? 0.01;
  this.suspensionTravel = settings.suspensionTravel ?? 0.15;
  this.suspensionDamping = settings.suspensionDamping ?? 2500;
  this.suspensionForce = settings.suspensionForce ?? 50000;

  this.angle = 0;
  this.angularVelocity = 0;
  this.mass = settings.wheelMass ?? 20;
  this.inertia = this.mass * this.radius * this.radius / 2;

  this.slipRatioCoeffs = settings.slipRatioCoeffs ?? [16, 1.5, 1.1, -1.4];
  this.slipAngleCoeffs = settings.slipAngleCoeffs ?? [0.2/*0.15*/, 1.5, 1.1, -1.4];

  this.advancedSlipAngleCoeffs = [
    1.799, // Force falloff after peak (1 < x < 2)
    0,
    1688, // Amplitude
    1000, //2140, //930 // The higher this value is the closer the peak is to 0 (*)
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
    return advancedFy(x * 180 / Math.PI, car.rb.mass * 9.82 / 4, this.camberAngle, this.advancedSlipAngleCoeffs);
  });

  this.drive = true;
  this.turn = true;
  this.ebrake = true;

  this.isGrounded = false;
  this.normalForce = 0;
  
  this.up = new Vector();
  this.worldPos = new Vector();
}

function Wing(position, liftCoeff = 0.1) {
  this.position = position;
  this.liftCoeff = liftCoeff;

  this.applyForce = function(rb, velocity) {
    var force = Vector.multiply(Vector.down(), this.liftCoeff * velocity * velocity);
    var position = Matrix.transformVector(rb.gameObject.transform.worldMatrix, this.position);

    rb.AddForceAtPosition(force, position);
  };
}

export {
  Car,
  Trailer,
  Wing
};

function loadSample(context, url) {
  return fetch(url)
    .then(response => response.arrayBuffer())
    .then(buffer => context.decodeAudioData(buffer));
}

function playSample(context, sample) {
  var gainNode = context.createGain();
  // gainNode.connect(context.destination);

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

function GraphsManager() {
  var graphs = [];

  var container = document.createElement("div");
  document.body.appendChild(container);
  container.style = `
    position: fixed;
    top: 0;
    left: 0;
    z-index: 1000000;

    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;

    pointer-events: none;

    transform-origin: 0 0;
    transform: scale(0.4);
  `;

  this.createGraph = function(props = {}) {
    var graph = new Graph(props);
    container.appendChild(graph.dom);

    graphs.push(graph);
    return graph;
  };

  this.delete = function() {
    container.remove();
  };
}

function Graph(props = {}) {
  this.name = props.name ?? "Untitled graph";
  this.width = props.width ?? 400;
  this.height = props.height ?? 200;

  var dataPoints = [];

  this.createDom = function() {
    var canvas = this.canvas = this.dom = document.createElement("canvas");
    canvas.width = this.width;
    canvas.height = this.height;
    canvas.style = `
      position: static;
    `;

    this.gc = new GameCanvas({
      element: canvas,
      noFullscreen: true,
      publicMethods: false
    });

    canvas.style.backgroundColor = "rgba(0, 0, 0, 0.25)";
  };

  this.createDom();
  
  this.plot = function(x, y) {
    dataPoints.push({
      x,
      y
    });

    this.redraw();
  };

  this.redraw = function() {
    this.gc.clearScreen();

    // var X = dataPoints.map(d => d.x);
    // var Y = dataPoints.map(d => d.y);

    // this.minX = Math.min(...timestamps);
    this.maxX = dataPoints[dataPoints.length - 1].x;//Math.max(...X);
    this.minX = this.maxX - 10_000;
    // this.minY = Math.min(...values);
    // this.maxY = Math.max(...values);
    this.minY = -2;
    this.maxY = 2;

    // dataPoints.sort((a, b) => a.timestamp - b.timestamp);

    this.gc.line(0, this.gc.height / 2, this.gc.width, this.gc.height / 2, "black", 1);
    this.gc.line(0, this.gc.height * 0.25, this.gc.width, this.gc.height * 0.25, "gray", 1);
    this.gc.line(0, this.gc.height * 0.75, this.gc.width, this.gc.height * 0.75, "gray", 1);

    for (var i = dataPoints.length - 1; i >= 1; i--) {
      var p1 = this.dataToScreen(dataPoints[i]);
      var p2 = this.dataToScreen(dataPoints[i - 1]);
      this.gc.line(p1.x, p1.y, p2.x, p2.y, "red", 2);

      if (p1.x < 0) {
        break;
      }
    }
  };

  this.dataToScreen = function(dataPoint) {
    return {
      x: this.gc.mapValue(dataPoint.x, this.minX, this.maxX, 0, this.gc.width),
      y: this.gc.mapValue(dataPoint.y, this.minY, this.maxY, this.gc.height, 0)
    };
  };
}

class CameraController {
  update() {}
  onActivate() {}
  onDeactivate() {}
  onReset() {}
}

class TPPFollowCamera extends CameraController {
  #f = new Vector();

  #y = 0;
  #yVel = 0;

  #smoothTurnAngle = 0;

  #currentFollowDistance = 5;
  #cameraCarForward = Vector.zero();
  #shakeCounter = 0;
  #cameraShakeTarget = Vector.zero();
  #cameraShake = Vector.zero();

  CAMERA_FOLLOW_MODES = { FOLLOW_VELOCITY: 1, FOLLOW_DIRECTION: 2, FOLLOW_INVERSE_DIRECTION: 3 };
  followMode = this.CAMERA_FOLLOW_MODES.FOLLOW_VELOCITY;
  followDistance = 5;
  followHeight = 0.4;
  followSpeed = 0.05;
  pitch = 0.15;
  accelerationSpeed = 0.05;
  accelerationEffect = 0.3;

  constructor(car) {
    super();
    this.car = car;
  }

  resetForward() {
    this.#cameraCarForward = Matrix.getForward(this.car.gameObject.transform.worldMatrix);
    this.#yVel = 0;
    this.#y = this.car.rb.position.y + 0.15 + this.followHeight / Math.sqrt(1 + this.followHeight ** 2) * this.followDistance;
  }

  onReset() {
    this.resetForward();
  }

  onActivate() {
    this.resetForward();
  }

  update(camera, dt) {
    var carWorldMatrix = this.car.gameObject.transform.worldMatrix;
    var up = Matrix.getUp(carWorldMatrix);
    var forward = Vector.negate(Matrix.getForward(carWorldMatrix));

    var upAcceleration = Vector.dot(this.car.rb.acceleration, up);
    var forwardAcceleration = Vector.dot(this.car.rb.acceleration, forward);
    if (!isNaN(forwardAcceleration)) {
      this.#currentFollowDistance -= (this.#currentFollowDistance - this.followDistance * (1 + forwardAcceleration / dt * this.accelerationEffect)) * this.accelerationSpeed;
    }

    var followDistance = this.#currentFollowDistance;
    var followHeight = this.followHeight;
    var followSpeed = this.followSpeed;
    var pitch = this.pitch;

    var cameraTurnAngle = deadZone(this.car.keybindings.getInput("turnCamera") || 0, 0.09) * Math.PI / 2 * 2;
    // var cameraTurnAngle = deadZone(this.car.keybindings.gamepadManager.getAxis("RSHorizontal"), 0.09) * Math.PI;
    this.#smoothTurnAngle += (cameraTurnAngle - this.#smoothTurnAngle) * 0.27;

    // var carForward = Matrix.getForward(this.car.gameObject.transform.worldMatrix);
    var planeVelocity = Vector.projectOnPlane(this.car.rb.velocity, Vector.up());

    var targetForward;
    if (this.followMode == this.CAMERA_FOLLOW_MODES.FOLLOW_VELOCITY) {
      if (Vector.length(planeVelocity) > 1) {
        targetForward = Vector.negate(Vector.normalize(planeVelocity));
        // targetForward = Vector.slerp(targetForward, Vector.negate(forward), 0.2 * 0);
        // cameraCarForward = Vector.negate(targetForward);
      }
      else {
        targetForward = Vector.negate(forward);
      }
    }
    else if (this.followMode == this.CAMERA_FOLLOW_MODES.FOLLOW_DIRECTION) {
      targetForward = Vector.negate(forward);
    }
    else if (this.followMode == this.CAMERA_FOLLOW_MODES.FOLLOW_INVERSE_DIRECTION) {
      targetForward = Vector.slerp(
        this.car.gameObject.transform.forward,
        Vector.normalize(Vector.projectOnPlane(Vector.negate(this.car.rb.velocity), this.car.gameObject.transform.up)),
        -0.5
      );
    }
    // targetForward = Quaternion.QxV(Quaternion.angleAxis(cameraTurnAngle, this.car.gameObject.transform.up/*Vector.up()*/), targetForward);

    this.#cameraCarForward = Vector.slerp(this.#cameraCarForward, targetForward, followSpeed);
    var currentForward = Vector.copy(this.#cameraCarForward);
    currentForward = Quaternion.QxV(Quaternion.angleAxis(this.#smoothTurnAngle, this.car.gameObject.transform.up), currentForward);

    var finalCameraDir = null;

    var origin = Vector.add(this.car.rb.position, new Vector(0, 0.15, 0));
    Vector.set(this.#f, this.car.rb.velocity);
    Vector.multiplyTo(this.#f, dt);
    Vector.addTo(origin, this.#f);
    var dirNorm = Vector.normalize(Vector.add(currentForward, new Vector(0, followHeight, 0)));

    var hit = this.car.physicsEngine.Raycast(origin, dirNorm);
    if (hit && hit.firstHit && hit.firstHit.distance < followDistance) {
      var d = hit.firstHit.distance;
      // currentFollowDist = clamp(d - 0.2, 0.5, followDistance);
      var h = Math.sqrt(followDistance * followDistance - d * d + (followHeight * d) ** 2) / d;

      var newDir = Vector.normalize(Vector.add(currentForward, new Vector(0, h, 0)));
      hit = this.car.physicsEngine.Raycast(origin, newDir);
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

    var springAcc = ((origin.y + finalCameraDir.y) - this.#y) * 70;
    this.#yVel += springAcc * dt;
    this.#yVel += -this.#yVel * 7 * dt;
    this.#yVel += -9.82 * dt;
    this.#y += this.#yVel * dt;

    camera.transform.position = Vector.add(origin, finalCameraDir);
    camera.transform.position.y = this.#y;
    camera.transform.matrix = Matrix.lookAt(camera.transform.position, origin);
    
    Matrix.rotateX(camera.transform.matrix, pitch, camera.transform.matrix);

    // Camera shake
    var forwardSpeed = Math.abs(Vector.dot(this.car.rb.velocity, forward));

    var maxShake = 0.02;
    var shakePerKMPH = 0.02;

    if (this.#shakeCounter % 3 == 0) {
      var shakeAmount = maxShake * clamp((forwardSpeed - 100 / 3.6) * shakePerKMPH, 0, 1);
      this.#cameraShakeTarget = new Vector(
        (Math.random() - 0.5) * 2 * shakeAmount,
        (Math.random() - 0.5) * 2 * shakeAmount,
        0
      );
    }
    this.#cameraShake = Vector.lerp(this.#cameraShake, this.#cameraShakeTarget, 0.15);
    Matrix.rotateX(camera.transform.matrix, this.#cameraShake.x, camera.transform.matrix);
    Matrix.rotateY(camera.transform.matrix, this.#cameraShake.y, camera.transform.matrix);

    this.#shakeCounter++;

    // var euler = Quaternion.toEulerAngles(this.mainCamera.transform.rotation);
    // euler[0] += 0.2;
    // this.mainCamera.transform.rotation = Quaternion.euler(euler[0], euler[1], euler[2]);
  
    camera.updateFrustum();
  }
}

class HoodFollowCamera extends CameraController {
  #vdt = new Vector();

  constructor(car) {
    super();
    this.car = car;
  }

  onActivate(camera) {
    camera.setFOV(30);
  }

  update(camera, dt) {
    var hoodCamera = this.car.gameObject.getChild("HoodCamera", true);
    if (hoodCamera) {
      camera.transform.matrix = hoodCamera.transform.worldMatrix;

      Vector.set(this.#vdt, this.car.rb.velocity);
      Vector.multiplyTo(this.#vdt, dt);
      Vector.addTo(camera.transform.position, this.#vdt);
    }
  }
}

class InteriorFollowCamera extends CameraController {
  #cameraCarForward = Vector.zero();
  #oldFOV = 45;

  velocityBias = 0.3;
  followSpeed = 0.15;

  constructor(car) {
    super();
    this.car = car;
  }

  resetForward() {
    this.#cameraCarForward = Matrix.getForward(this.car.gameObject.transform.worldMatrix);
  }

  onReset() {
    this.resetForward();
  }

  onActivate() {
    this.#oldFOV = this.car.mainCamera.getFOV();
    this.car.mainCamera.setFOV(25);
    this.resetForward();
  }

  onDeactivate() {
    this.car.mainCamera.setFOV(this.#oldFOV);
  }

  update(camera, dt) {
    var interiorCamera = this.car.gameObject.getChild("InteriorCamera", true);
    if (interiorCamera) {
      var forwardSpeed = -Vector.dot(this.car.gameObject.transform.forward, this.car.rb.velocity);

      var lookDir = this.car.currentGear === 0 ? 
        Vector.negate(this.car.gameObject.transform.forward) :
        forwardSpeed < 0.2 ?
          this.car.gameObject.transform.forward : 
          Vector.slerp(this.car.gameObject.transform.forward, Vector.normalize(Vector.projectOnPlane(Vector.negate(this.car.rb.velocity), this.car.gameObject.transform.up)), this.velocityBias);

      this.#cameraCarForward = Vector.slerp(this.#cameraCarForward, lookDir, this.followSpeed);

      camera.transform.matrix = Matrix.lookInDirection(
        Vector.add(interiorCamera.transform.worldPosition, Vector.multiply(this.car.rb.velocity, dt)),
        this.#cameraCarForward,
        this.car.gameObject.transform.up// Vector.up()
      );

      // this.mainCamera.transform.matrix = interiorCamera.transform.worldMatrix;
      // this.mainCamera.transform.position = Vector.add(this.mainCamera.transform.position, Vector.multiply(this.rb.velocity, dt));
    }
  }
}

class PhotoCamera extends CameraController {
  #cameraEulerAngles = Vector.zero();
  #initialFov = 45;

  constructor(car) {
    super();
    this.car = car;
    this.#initialFov = this.car.mainCamera.getFOV();
  }

  onReset() {
  }

  onActivate() {
    this.car.rb.frozen = true;
  }

  onDeactivate() {
    this.car.mainCamera.setFOV(this.#initialFov);
    this.car.rb.frozen = false;
  }

  update(camera, dt) {
    var oldFov = camera.getFOV();

    var x = quadraticCurve(deadZone(this.car.keybindings.gamepadManager.getAxis("RSHorizontal"), 0.08));
    var y = quadraticCurve(deadZone(this.car.keybindings.gamepadManager.getAxis("RSVertical"), 0.08));
    this.#cameraEulerAngles.x -= y * 0.07 * clamp(oldFov / 45, 0, 1);
    this.#cameraEulerAngles.y -= x * 0.07 * clamp(oldFov / 45, 0, 1);

    var vertical = quadraticCurve(deadZone(this.car.keybindings.gamepadManager.getAxis("LSVertical")));
    var horizontal = quadraticCurve(deadZone(this.car.keybindings.gamepadManager.getAxis("LSHorizontal")));

    var speed = 15;
    var c = Math.cos(this.#cameraEulerAngles.x);
    camera.transform.position.x -= vertical * Math.cos(this.#cameraEulerAngles.y + Math.PI / 2) * speed * dt * c;
    camera.transform.position.z -= vertical * -Math.sin(this.#cameraEulerAngles.y + Math.PI / 2) * speed * dt * c;
    camera.transform.position.y -= vertical * Math.sin(this.#cameraEulerAngles.x) * speed * dt;

    camera.transform.position.x += horizontal * Math.cos(this.#cameraEulerAngles.y) * speed * dt;
    camera.transform.position.z += horizontal * -Math.sin(this.#cameraEulerAngles.y) * speed * dt;

    flyCamera(this.car.renderer, camera, this.#cameraEulerAngles, dt);

    var fovInc = 1 + 0.03 * (this.car.keybindings.gamepadManager.getButton("LS") - this.car.keybindings.gamepadManager.getButton("RS"));
    var newFov = oldFov * fovInc;
    newFov = clamp(newFov, 0.1, 89);
    camera.setFOV(newFov);

    camera.transform.rotation = Quaternion.eulerVector(this.#cameraEulerAngles);
  }
}

class SpectatorCamera extends CameraController {
  // #vdt = new Vector();

  #origin = new Vector();

  constructor(car) {
    super();
    this.car = car;
  }

  onActivate(camera) {
    Vector.set(this.#origin, camera.transform.worldPosition);
  }

  update(camera, dt) {
    let distance = Vector.distance(this.#origin, this.car.rb.position);
    let fov = 100 / Math.max(0, distance - 5) ** 0.7;
    fov = clamp(fov, 6, 35);
    camera.setFOV(fov);

    camera.transform.matrix = Matrix.lookAt(this.#origin, this.car.rb.position);

    // var hoodCamera = this.car.gameObject.getChild("HoodCamera", true);
    // if (hoodCamera) {
    //   camera.transform.matrix = hoodCamera.transform.worldMatrix;

    //   Vector.set(this.#vdt, this.car.rb.velocity);
    //   Vector.multiplyTo(this.#vdt, dt);
    //   Vector.addTo(camera.transform.position, this.#vdt);
    // }
  }
}

function Horn(audioContext) {
  let createOscillator = (frequency) => {
    let oscillator = audioContext.createOscillator();
    oscillator.type = "square";
    oscillator.frequency.value = frequency;
    oscillator.connect(audioContext.destination);

    return oscillator;
  };

  let o1 = null;
  let o2 = null;

  this.start = function() {
    o1 = createOscillator(500);
    o2 = createOscillator(405);

    o1.start();
    o2.start();
  };

  this.stop = function() {
    o1?.stop();
    o2?.stop();
  };
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