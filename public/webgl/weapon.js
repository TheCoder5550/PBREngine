import Quaternion from "../engine/quaternion.mjs";
import Vector from "../engine/vector.mjs";
import Matrix from "../engine/matrix.mjs";
import { clamp, lerp } from "../engine/helper.mjs";

var WEAPONENUMS = {
  FIREMODES: {SINGLE: 0, BURST: 1, AUTO: 2},
  GUNMODES: {DEFAULT: 0, ADS: 1, AIM: 2}
};

var bulletTrails = [];

function updateBulletTrails(dt = 1 / 60) {
  for (var i = 0; i < bulletTrails.length; i++) {
    var trail = bulletTrails[i];
    trail.update(dt);
    if (trail.health <= 0) {
      trail.bulletTrailObject.meshRenderer.removeInstance(trail.instance);
      bulletTrails.splice(i, 1);
      i--;
    }
  }
}

function Weapon(settings = {}) {
  this.reloadTime = def(settings.reloadTime, 1000);
  this.sequentialReloading = def(settings.sequentialReloading, false);
  this.roundsPerSecond = def(settings.roundsPerSecond, 7);
  this.magSize = def(settings.magSize, 19);
  this.roundsInMag = this.magSize;
  this.fireMode = def(settings.fireMode, WEAPONENUMS.FIREMODES.SINGLE);

  this.fireSoundPlayers = [];
  this.readyFireSoundPlayers = [];
  for (var i = 0; i < def(settings.fireSoundBufferSize, 20); i++) {
    var audio = new Audio(def(settings.fireSound, "../assets/sound/drumGun2.wav"));
    // audio.playbackRate = 0.8 + Math.random() * 0.4;

    var audioSource = audioContext.createMediaElementSource(audio);
    audioSource.connect(masterVolume);

    this.fireSoundPlayers.push(audio);
    this.readyFireSoundPlayers.push(audio);
  }
  this.dryFireSoundPlayer = new Audio(def(settings.dryFireSound, "../assets/sound/dryFire.wav"));
  audioContext.createMediaElementSource(this.dryFireSoundPlayer).connect(masterVolume);

  this.reloadSoundPlayer = new Audio(def(settings.reloadSound, "../assets/sound/reload.wav"));
  audioContext.createMediaElementSource(this.reloadSoundPlayer).connect(masterVolume);

  if (settings.doneReloadingSound) {
    this.doneReloadingSoundPlayer = new Audio(settings.doneReloadingSound);
    audioContext.createMediaElementSource(this.doneReloadingSoundPlayer).connect(masterVolume);
  }

  var reloadTimeouts = [];
  this.isReloading = false;
  this.isFiring = false;
  var fireTimer = 0;
  var currentSpreeRound = 0;

  this.fireAnimationTime = 0;
  this.reloadAnimationTime = 0;

  this.weaponObject = def(settings.weaponObject, null);

  var initialWeaponScale;
  if (this.weaponObject) {
    initialWeaponScale = Vector.copy(this.weaponObject?.transform?.scale);
  }

  this.muzzleObject = this.weaponObject ? this.weaponObject.getChild("MuzzleOffset", true) : null;
  this.adsObject = this.weaponObject ? this.weaponObject.getChild("ADSOffset", true) : null;

  // Movement
  this.adsMovementSpeed = def(settings.adsMovementSpeed, 0.75);

  //this.shellCasingModel = null;
  //this.muzzleFlashModel = null;

  // this.shellCasings = [];

  // this.muzzleFlashRotation = 0;

  this.GunModes = {DEFAULT: 0, ADS: 1, AIM: 2};
  this.mode = this.GunModes.DEFAULT;

  // Recoil
  this.recoil = def(settings.recoil, () => {
    return {x: -1, y: (Math.random() - 0.5) * 0.2, z: 0};
  });
  this.recoilOffset = {x: 0, y: 0, z: 0};
  this.recoilOffsetTarget = {x: 0, y: 0, z: 0};
  this.recoilOffsetVelocity = {x: 0, y: 0, z: 0};

  this.modelRecoil = {
    translation: Vector.zero(),
    velocity: Vector.zero(),
    rotation: Vector.zero(),
    angularVelocity: Vector.zero(),

    fireForce: new Vector(0, 0, 4),
    fireTorque: new Vector(1, 0, 0),

    translationReturn: -600,
    translationDamping: -30,
    rotationReturn: -600,
    rotationDamping: -30
  };

  this.bulletsPerShot = def(settings.bulletsPerShot, 1);

  this.bulletSpread = def(settings.bulletSpread, 0.05);
  this.aimBulletSpread = def(settings.aimBulletSpread, 0.5);
  this.ADSBulletSpread = def(settings.ADSBulletSpread, 0);

  this.scope = def(settings.scope, new Scope());
  this.ADSSpeed = def(settings.ADSSpeed, 0.3);
  var adsT = 0;

  this.crosshairType = def(settings.crosshairType, 0);

  this.weaponModelOffset = def(settings.weaponModelOffset, Vector.zero());
  this.weaponModelADSOffset = def(settings.weaponModelADSOffset, Vector.zero());
  this.swayTime = 0;
  var currentPlayerVelYOffset = 0;
  this.swayRotation = {x: 0, y: 0, z: 0};

  this.muzzleOffset = {x: 0, y: 0.06, z: 0};

  /*this.bullets = [];
  this.bulletVelocity = def(settings.bulletVelocity, 800);*/
  this.bulletDamage = def(settings.bulletDamage, 20);
  this.bulletDamageHeadMultiplier = def(settings.bulletDamageHeadMultiplier, 2);

  // this.bulletTrails = [];

  this.onFire = () => {};

  var playDoneReloading = () => {
    if (this.doneReloadingSoundPlayer) {
      this.doneReloadingSoundPlayer.currentTime = 0;
      this.doneReloadingSoundPlayer.play();
    }
  };

  this.playAnimation = function(name) {
    this.weaponObject.animationController?.play(name);
  }

  this.getSpeed = function() {
    if (this.mode == this.GunModes.ADS) {
      return this.adsMovementSpeed;
    }

    return 1;
  }

  this.getCurrentSensitivity = function() {
    return (this.mode == this.GunModes.ADS ? this.scope.ADSMouseSensitivity : 1);
  }

  this.fire = function() {
    window.muzzleFlashEnabled = false;

    if (this.isReloading && this.sequentialReloading) {
      this.cancelReload();
      // return false;
    }

    if (!this.isFiring && !this.isReloading) {
      this.isFiring = true;
      fireTimer = 1 / this.roundsPerSecond;

      // this.fireTimeout = setTimeout(() => {
      //   this.isFiring = false;
      //   if (this.fireMode == WEAPONENUMS.FIREMODES.AUTO && this.roundsInMag > 0 && renderer.mouse.left)
      //     this.fire();
      // }, 1000 / this.roundsPerSecond);

      if (this.roundsInMag > 0) {
        //this.shellCasings.push(new Shellcasing(this));
        this.fireAnimationTime = 0;

        this.roundsInMag--;

        window.muzzleFlashEnabled = true;

        // if (currentSpreeRound < 4) { // Remove recoil climb after 4 shots
          this.recoilOffsetTarget = {...this.recoilOffset};
        // }
        var currentRecoil = this.recoil();
        this.recoilOffsetVelocity = Vector.add(this.recoilOffsetVelocity, currentRecoil);

        Vector.addTo(this.modelRecoil.velocity, this.modelRecoil.fireForce);
        Vector.addTo(this.modelRecoil.angularVelocity, this.modelRecoil.fireTorque);

        /*if (this.muzzleFlashModel) {
          this.muzzleFlashRotation = Math.random() * Math.PI * 2;
          this.muzzleFlashModel.hidden = false;
          setTimeout(() => {
            this.muzzleFlashModel.hidden = true;
          }, 10);
        }*/

        // Vector.addTo(player.velocity, Vector.multiply(player.forward, -1));

        this.playAnimation("Fire");

        var currentSpread = this.bulletSpread;
        if (this.mode == this.GunModes.AIM) currentSpread *= this.aimBulletSpread;
        if (this.mode == this.GunModes.ADS) currentSpread *= lerp(this.ADSBulletSpread, 1, adsT);

        var rot = player.getHeadRotation();
        var origin = player.getHeadPos();

        for (var i = 0; i < this.bulletsPerShot; i++) {
          var direction = Matrix.transformVector(Matrix.transform([
            ["rz", -rot.z],
            ["ry", -rot.y],
            ["rx", -rot.x],
            ["rx", (Math.random() - 0.5) * 2 * currentSpread],
            ["ry", (Math.random() - 0.5) * 2 * currentSpread],
          ]), {x: 0, y: 0, z: -1});

          // Create trail
          var trailPos = this.muzzleObject ? Matrix.getPosition(this.muzzleObject.transform.getWorldMatrix()) : player.position;
          var trailVel = Vector.add(Vector.multiply(direction, 50), player.velocity);
          var trail = new BulletTrail(trailPos, trailVel, direction);
          bulletTrails.push(trail);

          // Get scene hit
          var hit = physicsEngine.Raycast(origin, direction).firstHit;

          // Detect enemy hits
          var maxDistance = (hit && hit.point) ? hit.distance : Infinity;
          for (var enemy of enemies) {
            var enemyHit = enemy.fireBullet(this, origin, direction, maxDistance);
            if (enemyHit) {
              hitmarker.markHit(enemyHit.type == 0 ? "body" : "head");
            }
          }

          if (hit && hit.point) {
            trail.health = hit.distance / 50;

            // Create bullethole
            var mat =  Matrix.lookAt(Vector.add(hit.point, Vector.multiply(hit.normal, 0.0001 + Math.random() * 0.005)), Vector.add(hit.point, hit.normal), Vector.normalize({x: 1, y: 0.1, z: 0}));
            Matrix.transform([
              ["scale", Vector.fill(0.05)]
            ], mat);

            if (bulletHoles) {
              var currentInstance = bulletHoles.meshRenderer.addInstance(mat);

              setTimeout((function(inst) {
                return function() {
                  bulletHoles.meshRenderer.removeInstance(inst);
                };
              })(currentInstance), 15000);
            }

            // Sparks
            var [ tangent, bitangent ] = Vector.formOrthogonalBasis(hit.normal);
            var basis = Matrix.basis(tangent, bitangent, hit.normal);
   
            sparks.emitVelocity = () => {
              var v = new Vector((Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3, 2 * Math.random());
              return Matrix.transformVector(basis, v);
            };
            sparks.emitPosition = () => hit.point;
            sparks.emit(10);
          }
        }
    
        if (this.readyFireSoundPlayers.length > 0) {
          var audioPlayer = this.readyFireSoundPlayers.shift();
          audioPlayer.currentTime = 0;
          audioPlayer.play();
          audioPlayer.onended = () => {
            this.readyFireSoundPlayers.push(audioPlayer);
          }
    
          this.fireSoundPlayers.push(audioPlayer);
        }

        this.onFire({
          origin: origin,
          direction: direction,
          trailHealth: trail.health
        });

        return true;
      }
      else {
        this.dryFireSoundPlayer.currentTime = 0;
        this.dryFireSoundPlayer.play();
      }
    }

    return false;
  }

  this.reload = function() {
    if (!this.isReloading && this.roundsInMag != this.magSize) {
      this.unADS();
      this.isReloading = true;
      this.reloadAnimationTime = 0;
  
      if (this.sequentialReloading) {
        this.seqReload();
      }
      else {
        this.reloadSoundPlayer.currentTime = 0;
        this.reloadSoundPlayer.play();

        this.playAnimation("Reload");

        reloadTimeouts[0] = setTimeout(() => {
          playDoneReloading();

          this.roundsInMag = this.magSize;
          this.isReloading = false;
        }, this.reloadTime);
      }
    }
  }

  this.seqReload = () => {
    if (this.roundsInMag < this.magSize) {
      this.roundsInMag++;

      this.reloadSoundPlayer.currentTime = 0;
      this.reloadSoundPlayer.play();

      this.playAnimation("Reload");
      
      reloadTimeouts[0] = setTimeout(() => {
        this.seqReload();
      }, this.reloadTime);
    }
    else {
      playDoneReloading();
      this.isReloading = false;
    }
  }

  this.cancelReload = function() {
    if (this.isReloading) {
      for (var to of reloadTimeouts) {
        clearTimeout(to);
      }
      reloadTimeouts = [];

      this.isReloading = false;
      this.reloadAnimationTime = 1;

      this.reloadSoundPlayer.pause();
    }
  }

  this.ADS = function() {
    if (this.mode != this.GunModes.ADS && !this.isReloading) {
      this.mode = this.GunModes.ADS;
      targetFov = this.scope.ADSFOV;
      targetWeaponFov = this.scope.ADSWeaponFOV;

      if (this.scope.sniperScope && this.weaponObject) {
        this.weaponObject.visible = false;
      }
    }
  }

  this.unADS = function() {
    if (this.mode == this.GunModes.ADS) {
      this.mode = this.GunModes.DEFAULT;
      targetFov = defaultFov;
      targetWeaponFov = defaultWeaponFov;

      if (this.scope.sniperScope && this.weaponObject) {
        this.weaponObject.visible = true;
      }
    }
  }

  // this.getWeaponOffset = function() {
  //   if (this.mode == this.GunModes.ADS) {
  //     if (this.weaponObject.getChild("ADSOffset")) {
  //       return Vector.add(Vector.multiply(Matrix.getPosition(this.weaponObject.getChild("ADSOffset").matrix), -1), {x: 0, y: 0, z: -0.2});
  //     }
  //     return this.weaponModelADSOffset;
  //   }
  //   return Vector.add(this.weaponModelOffset, {x: Math.sin(this.swayTime * 2) * 0.01, y: Math.sin(this.swayTime * 4 % Math.PI) * 0.02 - clamp(currentPlayerVelYOffset * 0.005, -0.07, 0.07), z: 0});
  // }

  this.update = function(dt) {
    this.fireAnimationTime += dt;
    this.reloadAnimationTime += dt;

    fireTimer -= dt;
    if (fireTimer <= 0 && this.isFiring) {
      this.isFiring = false;
      window.muzzleFlashEnabled = false;

      if (this.fireMode == WEAPONENUMS.FIREMODES.AUTO && this.roundsInMag > 0 && renderer.mouse.left) {
        currentSpreeRound++;
        this.fire();
      }
      else {
        currentSpreeRound = 0;
      }
    }

    if (this.weaponObject) {
      // var baseMatrix = Matrix.transform([
      //   ["translate", this.getWeaponOffset()],
      //   ["rx", this.swayRotation.x],
      //   ["ry", this.swayRotation.y],
      //   ["scale", this.weaponObject.scale]
      // ], player.getHandMatrix(adsT));

      // var baseMatrix = Matrix.transform([
      //   ["translate", Vector.lerp(this.weaponModelADSOffset, this.weaponModelOffset, adsT)],
      //   ["translate", this.modelRecoilTranslation],
      //   // ["rz", this.modelRecoilRotation.z],
      //   // ["ry", this.modelRecoilRotation.y],
      //   // ["rx", this.modelRecoilRotation.x],
      //   ["scale", this.weaponObject.scale]
      // ], player.getHandMatrix(adsT));

      var rot = player.handRotation;//player.getHeadRotation();
      var ops = [
        ["translate", player.getHeadPos()],
        ["rz", -rot.z],
        ["ry", -rot.y],
        ["rx", -rot.x],
        ["translate", Vector.multiply(player.handOffset, adsT)],
        ["translate", Vector.multiply(new Vector(Math.cos(player.walkTime * 0.5) * 0.005, Math.pow(Math.sin(player.walkTime * 0.5), 2) * 0.01, 0), adsT)], // Weapon bobbing
        ["rz", player.handRotOffset.z * adsT],
        ["ry", player.handRotOffset.y * adsT],
        ["rx", player.handRotOffset.x * adsT],

        ["translate", Vector.lerp(this.weaponModelADSOffset, this.weaponModelOffset, adsT)],
        ["translate", this.modelRecoil.translation],
        ["rz", this.modelRecoil.rotation.z * adsT],
        ["ry", this.modelRecoil.rotation.y * adsT],
        ["rx", this.modelRecoil.rotation.x * adsT],

        ["translate", Vector.multiply({x: 0, y: -clamp(currentPlayerVelYOffset * 0.005, -0.08, 0.08), z: 0}, adsT)] // Jump and fall bobbing

        // ["rx", this.swayRotation.x],
        // ["ry", this.swayRotation.y],
      ];
      var baseMatrix = Matrix.transform(ops);

      if (this.adsObject) {
        Matrix.transform([["translate", new Vector(0, 0, this.scope.adsDepth * (1 - adsT))]], baseMatrix);

        var localADSOffset = Matrix.inverse(this.adsObject.transform.getWorldMatrix(this.weaponObject));
        localADSOffset[12] *= initialWeaponScale.x;
        localADSOffset[13] *= initialWeaponScale.y;
        localADSOffset[14] *= initialWeaponScale.z;
        Matrix.lerp(localADSOffset, Matrix.identity(), adsT, localADSOffset);

        baseMatrix = Matrix.multiply(baseMatrix, localADSOffset);
      }

      Matrix.transform([
        ["scale", initialWeaponScale]
      ], baseMatrix);

      this.weaponObject.transform.matrix = baseMatrix;
    }
  }

  this.fixedUpdate = function(dt) {
    this.swayTime += dt * Vector.length({x: player.velocity.x, y: player.velocity.z}) / 3;
    currentPlayerVelYOffset += (player.velocity.y - currentPlayerVelYOffset) * 0.2;

    adsT += -(adsT - (this.mode == this.GunModes.ADS ? 0 : 1)) * this.ADSSpeed;

    // Camera rotation
    this.recoilOffsetVelocity = Vector.add(this.recoilOffsetVelocity, Vector.multiply(Vector.subtract(this.recoilOffsetTarget, this.recoilOffset), 2 * dt * 60));
    this.recoilOffsetVelocity = Vector.add(this.recoilOffsetVelocity, Vector.multiply(this.recoilOffsetVelocity, -1 * 0.3 * dt * 60));
    this.recoilOffset = Vector.add(this.recoilOffset, Vector.multiply(this.recoilOffsetVelocity, dt));

    // Model translation
    Vector.addTo(this.modelRecoil.velocity, Vector.multiply(this.modelRecoil.translation, this.modelRecoil.translationReturn * dt)); // Return
    Vector.addTo(this.modelRecoil.velocity, Vector.multiply(this.modelRecoil.velocity, this.modelRecoil.translationDamping * dt)); // Damping

    // Model rotation
    Vector.addTo(this.modelRecoil.angularVelocity, Vector.multiply(this.modelRecoil.rotation, this.modelRecoil.rotationReturn * dt)); // Return
    Vector.addTo(this.modelRecoil.angularVelocity, Vector.multiply(this.modelRecoil.angularVelocity, this.modelRecoil.rotationDamping * dt)); // Damping

    Vector.addTo(this.modelRecoil.translation, Vector.multiply(this.modelRecoil.velocity, dt));
    Vector.addTo(this.modelRecoil.rotation, Vector.multiply(this.modelRecoil.angularVelocity, dt));
  
    /*for (var casing of this.shellCasings) {
      casing.update(dt);
    }*/

    /*for (var c = 0; c < 10; c++) {
      for (var bullet of this.bullets) {
        bullet.update(dt / 10);
      }
    }*/
  }
}

function Scope(settings = {}) {
  this.sniperScope = def(settings.sniperScope, false);
  this.scopeDelay = def(settings.scopeDelay, 0);

  this.adsDepth = def(settings.adsDepth, -0.2);
  this.ADSWeaponFOV = def(settings.ADSWeaponFOV, 20);
  this.ADSFOV = def(settings.ADSFOV, 25);
  this.ADSMouseSensitivity = def(settings.ADSMouseSensitivity, 0.75);
}

function BulletTrail(pos, velocity, lookDirection) {
  this.position = Vector.copy(pos);
  this.velocity = Vector.copy(velocity);
  this.direction = Vector.copy(lookDirection);

  Vector.addTo(this.position, Vector.multiply(this.velocity, 0.005));

  this.health = 1;

  var matrix = Matrix.identity();
  this.instance = null;
  this.bulletTrailObject = scene.root.getChild("BulletTrail");
  if (this.bulletTrailObject) {
    this.instance = this.bulletTrailObject.meshRenderer.addInstance(Matrix.transform([
      ["translate", this.position]
    ]));
  }

  this.update = function(dt) {
    Vector.addTo(this.position, Vector.multiply(this.velocity, dt));
    this.health -= dt;

    this.updateInstance();
  }

  this.updateInstance = function() {
    var cameraPos = Matrix.getPosition(mainCamera.cameraMatrix);
    var lookDir = Vector.projectOnPlane(Vector.subtract(cameraPos, this.position), this.direction);

    Matrix.lookAt(this.position, Vector.add(this.position, lookDir), this.direction, matrix);
    Matrix.transform([["scale", new Vector(0.2, 1.5, 1)]], matrix);

    this.bulletTrailObject.meshRenderer.updateInstance(this.instance, matrix);
  }
}

function Bullet(parent, position, direction, bulletVelocity) {
  this.parent = parent;
  this.position = {...position};
  this.direction = {...direction};
  this.reverseDirection = multiplyVector(this.direction, -1);
  this.velocity = bulletVelocity;

  this.hit = false;

  this.update = function(step) {
    if (!this.hit) {
      this.position.x += this.direction.x * this.velocity * step;
      this.position.y += this.direction.y * this.velocity * step;
      this.position.z += this.direction.z * this.velocity * step;

      for (var enemy of enemies) {
        var AABBs = [enemy.getBodyAABB(), enemy.getHeadAABB()];
        var i = 0;
        for (var AABB of AABBs) {
          if (pointInsideBox(this.position, AABB)) {
            this.handleHit(enemy, i == 1);
          }
          else {
            var rayhit = rayToBox(this.position, this.reverseDirection, AABB);
            if (rayhit !== false && rayhit < this.velocity * step) {
              this.handleHit(enemy, i == 1);
            }
          }
          
          i++;
        }
      }
    }
  }

  this.handleHit = function(enemy, headshot = false) {
    this.hit = true;
    this.parent.bullets.splice(this.parent.bullets.indexOf(this), 1);

    enemy.takeDamage(this.parent.bulletDamage * (headshot ? this.parent.bulletDamageHeadMultiplier : 1));

    hitmarkAlpha.lerp(1, 0, 300);
    hitmarkSpacing.lerp(7, 10, 300);
    hitmarkColor = (headshot ? [255, 0, 0] : [255, 255, 255]);
  }
}

function Shellcasing(parent, shellCasingModel) {
  this.parent = parent;
  this.shellCasingModel = this.parent.shellCasingModel;

  var mat = multMat4Mat4(this.parent.weaponModel.matrices[0], translationMatrix({x: 0, y: 0.3 * 0.06, z: 0.3 * 0.06}));
  this.position = {x: mat[12], y: mat[13], z: mat[14]};

  var angle = (Math.random() - 0.5) * 0.6 + Math.PI;
  var power = 0.05 + Math.random() * 0.3;
  mat = multMat4Mat4(this.parent.weaponModel.matrices[0], [Math.cos(angle) * power, 0.6, Math.sin(angle) * power, 0]);
  this.velocity = addVector(player.velocity, {x: mat[0], y: mat[1], z: mat[2]});

  this.id = Math.floor(Math.random() * 100000);

  this.lifetime = 1;

  this.update = function(dt) {
    this.velocity.y -= 4 * dt;

    this.position.x += this.velocity.x * dt;
    this.position.y += this.velocity.y * dt;
    this.position.z += this.velocity.z * dt;

    var rot = this.id + elapsedTime * 10;
    this.shellCasingModel.matrices[this.id] = multMat4Mat4(transform(identity(), this.position), transform(identity(), {rx: rot, ry: rot * 1.5, rz: rot * 0.7}));

    this.lifetime -= deltaTime;
    if (this.lifetime <= 0) {
      delete this.shellCasingModel.matrices[this.id];
      this.parent.shellCasings.splice(this.parent.shellCasings.indexOf(this), 1);
    }
  }
}

function def(current, d) {
  return typeof current == "undefined" ? d : current;
}

export {
  WEAPONENUMS,
  bulletTrails,
  updateBulletTrails,
  Weapon,
  Scope,
  BulletTrail,
  Bullet,
  Shellcasing
};