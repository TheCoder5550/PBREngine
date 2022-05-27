import Vector from "./engine/vector.mjs";
import { AABB } from "./engine/physics.mjs";
import { AABBTriangleToAABB, capsuleToTriangle } from "./engine/algebra.mjs";

class PlayerPhysicsBase {
  constructor(pos = Vector.zero()) {
    this.physicsEngine = null;

    this.rotation = Vector.zero();
    this.position = Vector.copy(pos);
    this.startPosition = Vector.copy(pos);
    this.velocity = Vector.zero();

    this.crouching = false;
    this.standHeight = 2;
    this.crouchHeight = 1.1;
    this.height = this.standHeight;
    this.colliderRadius = 0.5;

    this.walkSpeed = 5;

    this.walkAcceleration = 150 * 0.3;
    this.runningAcceleration = 225 * 0.3;
    this.friction = 10;

    this.coyoteTime = 0.11;
    this.jumpBuffering = 0.08;
    this.groundCounter = 0;
    this.jumpCounter = 0;

    this.collisionIterations = 3;
    this.grounded = false;
    this.fakeGroundNormal = Vector.zero();
    this.realGroundNormal = Vector.zero();

    // Health
    this.maxHealth = 100;
    this.health = this.maxHealth;

    // Kills
    this.kills = 0;
    this.deaths = 0;
    this.killStreak = 0;

    this.STATES = { IN_LOBBY: 0, PLAYING: 1, DEAD: 2 };
    this.state = this.STATES.IN_LOBBY;

    Object.defineProperty(this, "dead", {
      get: () => {
        return this.state === this.STATES.DEAD;
      }
    });
  }

  fixedUpdate(dt) {
    this.simulatePhysicsStep(dt);
  }

  simulatePhysicsStep(dt) {
    this.height = this.crouching ? this.crouchHeight : this.standHeight;

    // Gravity
    this.velocity.y -= 18 * dt;

    // Jumping
    if (this.grounded) {
      this.groundCounter = this.coyoteTime;
    }

    this.groundCounter -= dt;
    this.jumpCounter -= dt;

    // Ground friction/drag
    if (this.grounded) {
      var projectedVelocity = Vector.projectOnPlane(this.velocity, this.fakeGroundNormal);//{x: this.velocity.x, y: 0, z: this.velocity.z};
      var speed = Vector.length(projectedVelocity);
      this.velocity = Vector.add(this.velocity, Vector.multiply(Vector.normalize(projectedVelocity), -speed * dt * this.friction));

      // Sliding / turning
      if (this.crouching && speed > 10) {
        var v = Vector.rotateAround({
          x: Vector.length(Vector.projectOnPlane(this.velocity, this.fakeGroundNormal)),
          y: 0,
          z: 0
        }, this.fakeGroundNormal, -this.rotation.y + Math.PI / 2);
        
        this.velocity.x = v.x;
        this.velocity.z = v.z;
      }
    }

    this.position = Vector.add(this.position, Vector.multiply(this.velocity, dt));

    // Fix bouncing when going down slope
    if (this.grounded) {
      this.position.y -= 0.05;
    }

    this.solveCollisions();

    // Reset when out-of-bounds
    if (this.position.y < -30) {
      this.position = this.startPosition;
      this.velocity = Vector.zero();
    }
  }

  solveCollisions() {
    this.grounded = false;

    var radiusOffset = new Vector(0, this.colliderRadius, 0);
    var playerAABB = new AABB(
      {x: this.position.x - this.colliderRadius * 2, y: this.position.y - this.colliderRadius * 2,               z: this.position.z - this.colliderRadius * 2},
      {x: this.position.x + this.colliderRadius * 2, y: this.position.y + this.colliderRadius * 2 + this.height, z: this.position.z + this.colliderRadius * 2}
    );
    var q = this.physicsEngine.octree.queryAABB(playerAABB);

    for (var iter = 0; iter < this.collisionIterations; iter++) {
      if (q) {
        for (var k = 0; k < q.length; k++) {
          if (!AABBTriangleToAABB(q[k][0], q[k][1], q[k][2], playerAABB)) { // bruh redundant?
            continue;
          }

          var col = capsuleToTriangle(
            Vector.add(this.position, new Vector(0, this.standHeight / 2 - this.height * 0.5 + this.colliderRadius, 0)),
            Vector.subtract(Vector.add(this.position, new Vector(0, this.standHeight / 2 + this.height / 2, 0)), radiusOffset),
            this.colliderRadius,
            q[k][0], q[k][1], q[k][2],
            true
          );
          // var col = capsuleToTriangle(Vector.add(this.position, radiusOffset), Vector.subtract(Vector.add(this.position, new Vector(0, this.height, 0)), radiusOffset), this.colliderRadius, q[k][0], q[k][1], q[k][2], true);
          
          if (col && !Vector.equal(col.normal, Vector.zero(), 0.001)) {
            var dp = Vector.dot(Vector.up(), col.normal);
            var normal = dp > 0.75 ? Vector.up() : col.normal;
            var depth = col.depth / Vector.dot(normal, col.normal);

            this.position = Vector.add(this.position, Vector.multiply(normal, depth));
            this.velocity = Vector.projectOnPlane(this.velocity, normal);

            var isGround = Vector.dot(normal, Vector.up()) > 0.7;
            if (isGround) {
              this.fakeGroundNormal = normal;
              this.realGroundNormal = col.normal;
              this.grounded = true;
            }
          }
        }
      }
    }
  }

  applyInputs(inputs, dt) {
    var vertical = (inputs.forward || 0) - (inputs.back || 0);
    var horizontal = (inputs.left || 0) - (inputs.right || 0);
  
    if (vertical || horizontal) {
      var direction = Vector.rotateAround({
        x: vertical,
        y: 0,
        z: -horizontal
      }, {x: 0, y: 1, z: 0}, -this.getHeadRotation().y + Math.PI / 2);
  
      if (this.grounded) {
        direction = Vector.normalize(Vector.projectOnPlane(direction, this.realGroundNormal));
      }
      else {
        direction = Vector.normalize(direction);
      }

      // this.position = Vector.add(this.position, Vector.multiply(direction, this.walkSpeed * dt));
  
      var currentAcceleration = this.runningAcceleration;//renderer.getKey(16) ? this.runningAcceleration : this.walkAcceleration;
      currentAcceleration *= (this.grounded ? this.crouching ? 0.5 : 1 : 0.1);
      // if (this.getCurrentWeapon()) {
      //   currentAcceleration *= this.getCurrentWeapon().getSpeed();
      // }

      this.velocity = Vector.add(this.velocity, Vector.multiply(direction, currentAcceleration * dt));
    }
  
    // Jumping
    // if (renderer.getKeyDown(32)) {
    if (inputs.jump) {
      this.jumpCounter = this.jumpBuffering;
    }
  
    if (inputs.jump && this.jumpCounter > 0 && this.groundCounter > 0) {
      this.velocity.y = 6;
      this.position.y += 0.05;
  
      this.jumpCounter = 0;
      this.groundCounter = 0;
    }
  
    // Crouching
    if (this.grounded) {
      if (inputs.crouching && !this.crouching) {
        this.position.y -= 0.5;
      }
      if (!inputs.crouching && this.crouching) {
        this.position.y += 0.5;
      }
    }

    this.crouching = inputs.crouching;
  }

  getHeadRotation() {
    if (this.getCurrentWeapon?.()) {
      return Vector.add(this.rotation, this.getCurrentWeapon().recoilOffset);
    }
    
    return this.rotation;
  }

  get forward() {
    return Vector.rotateAround(new Vector(1, 0, 0), Vector.up(), -this.getHeadRotation().y + Math.PI / 2);
  }
}

export default PlayerPhysicsBase;