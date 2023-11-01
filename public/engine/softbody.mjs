import { clamp } from "./helper.mjs";
import Vector from "./vector.mjs";

function Softbody(physicsEngine, md) {
  physicsEngine.on("fixedUpdate", (dt) => {
    this.update(dt);
  });

  this.pressure = 2 * 0.2;
  this.constraintIterations = 10;//5;

  var colliders = [
    new CapsuleCollider(new Vector(0, 5, 0), new Vector(0, 1.1, 0), 0.3),
    new CapsuleCollider(new Vector(0, 5, 0), new Vector(0, 1.1, 0), 0.3),

    // Ground floor
    new PlaneCollider(new Vector(0, -1, 0), new Vector(0, 1, 0)),

    // // Roof
    // new PlaneCollider(new Vector(0, -3.5, 0), new Vector(0.3, -1, 0)),

    // Sides
    new PlaneCollider(new Vector(1, 0, 0), new Vector(-1, 0, 0)),
    new PlaneCollider(new Vector(-1, 0, 0), new Vector(1, 0, 0)),
    new PlaneCollider(new Vector(0, 0, 1), new Vector(0, 0, -1)),
    new PlaneCollider(new Vector(0, 0, -1), new Vector(0, 0, 1)),
  ];

  // colliders[0].a = new Vector(10, 1, 0);
  // colliders[0].b = new Vector(-10, 1, 0);

  // colliders[1].a = new Vector(0, 1, 10);
  // colliders[1].b = new Vector(0, 1, -10);

  let scene = physicsEngine.scene;
  let renderer = scene.renderer;
  let visualMesh = scene.add(renderer.CreateShape("sphere", null, 0));
  visualMesh.castShadows = false;
  visualMesh.meshRenderer.materials[0].setUniform("albedo", [0.4, 0, 0, 1]);

  var pointMasses = [];
  var springs = [];

  var poss = md.data.position.bufferData;
  var inds = md.data.indices.bufferData;

  for (var i = 0; i < poss.length; i += 3) {
    var v = Vector.fromArray(poss, i, 1, 3);
    var pm = new PointMass(v, i);

    // console.log(v.z);
    // if (v.z > -3) {
    //   pm.fixed = true;
    // }

    pointMasses[i] = pm;
  }
  // pointMasses[0].fixed = true;
  // pointMasses[3].fixed = true;
  // pointMasses[6].fixed = true;

  var edgesDone = [];

  var shuffledIndices = new Uint32Array(inds);
  shuffleArrayChunks(shuffledIndices, 3);

  for (var j = 0; j < inds.length; j += 3) {
    for (var e = 0; e < 3; e++) {
      var p1 = pointMasses[shuffledIndices[j + e] * 3];
      var p2 = pointMasses[shuffledIndices[j + (e + 1) % 3] * 3];
      if (!edgeIsDone(p1, p2)) {
        springs.push(new Spring(p1, p2));
        edgesDone.push([p1, p2]);
      }
    }
  }

  function edgeIsDone(p1, p2) {
    return edgesDone.some(e => (e[0] == p1 && e[1] == p2) || (e[0] == p2 && e[1] == p1));
  }

  var normals = new Float32Array(inds.length);

  var time = 0;

  let orthogonalVector = new Vector();

  this.update = function(dt) {
    time += dt;

    colliders[0].a = new Vector(10, 2 - Math.sin(time) * 2.2, 0);
    colliders[0].b = new Vector(-10, 2 - Math.sin(time) * 2.2, 0);

    colliders[1].a = new Vector(0, 2 - Math.sin(time) * 2.2, 10);
    colliders[1].b = new Vector(0, 2 - Math.sin(time) * 2.2, -10);

    // colliders[0].a = new Vector(10, 2 - Math.min(1, time) * 2, 0);
    // colliders[0].b = new Vector(-10, 2 - Math.min(1, time) * 2, 0);

    // colliders[1].a = new Vector(0, 2 - Math.min(1, time) * 2, 10);
    // colliders[1].b = new Vector(0, 2 - Math.min(1, time) * 2, -10);

    // colliders[0].b = new Vector(0, 2 - Math.sin(time) * 2, 0);
    // colliders[0].position.y = 3 + Math.sin(time * 2) * 6.5;

    var volume = getMeshVolume(md); // bruh might need to be inside iteration for loop

    for (let j = 0; j < inds.length; j += 3) {
      let a = pointMasses[inds[j + 0] * 3].position;
      let b = pointMasses[inds[j + 1] * 3].position;
      let c = pointMasses[inds[j + 2] * 3].position;

      let ax = (b.x - a.x);
      let ay = (b.y - a.y);
      let az = (b.z - a.z);

      let bx = (c.x - a.x);
      let by = (c.y - a.y);
      let bz = (c.z - a.z);

      normals[j + 0] = ay * bz - az * by;
      normals[j + 1] = az * bx - ax * bz;
      normals[j + 2] = ax * by - ay * bx;
    }

    for (let _ = 0; _ < this.constraintIterations; _++) {
      // Reset forces
      for (let i in pointMasses) {
        let pointMass = pointMasses[i];
        Vector.zero(pointMass.forceToAdd);
      }
      // var reactionForce = Vector.zero();

      // var volume = getMeshVolume(md);

      // Pressure
      for (let j = 0; j < inds.length; j += 3) {
        let p1 = pointMasses[inds[j + 0] * 3];
        let p2 = pointMasses[inds[j + 1] * 3];
        let p3 = pointMasses[inds[j + 2] * 3];

        // let a = p1.position;
        // let b = p2.position;
        // let c = p3.position;

        // var ax = (b.x - a.x);
        // var ay = (b.y - a.y);
        // var az = (b.z - a.z);

        // var bx = (c.x - a.x);
        // var by = (c.y - a.y);
        // var bz = (c.z - a.z);

        // var orthogonalVector = {
        //   x: ay * bz - az * by,
        //   y: az * bx - ax * bz,
        //   z: ax * by - ay * bx
        // };

        orthogonalVector.x = normals[j];
        orthogonalVector.y = normals[j + 1];
        orthogonalVector.z = normals[j + 2];
        // var orthogonalVector = Vector.cross(Vector.subtract(b, a), Vector.subtract(c, a));

        Vector.multiplyTo(orthogonalVector, this.pressure / volume / 2);
        Vector.addTo(p1.forceToAdd, orthogonalVector);
        Vector.addTo(p2.forceToAdd, orthogonalVector);
        Vector.addTo(p3.forceToAdd, orthogonalVector);
        // Vector.addTo(p1.position, orthogonalVector);
        // Vector.addTo(p2.position, orthogonalVector);
        // Vector.addTo(p3.position, orthogonalVector);

        // Vector.addTo(reactionForce, Vector.multiply(orthogonalVector, -0.01));
      }

      // for (var i in pointMasses) {
      //   var pointMass = pointMasses[i];
      //   Vector.addTo(pointMass.position, reactionForce);
      // }

      // Springs
      // shuffleArrayChunks(springs, 3);
      // shuffleArray(springs);
      // springs.reverse();
      for (let spring of springs) {
        spring.constrain(dt);
      }

      // Colliders
      // Every other iteration can be skipped since colliders are big and pretty stable
      if (_ % 3 === 0 || _ === this.constraintIterations - 1) {
        for (let i in pointMasses) {
          let pointMass = pointMasses[i];
          
          for (let collider of colliders) {
            collider.constrain(pointMass);
          }

          // var l = -3;
          // if (pointMass.position.y < l) {
          //   pointMass.position.y = l;

          //   // var vel = pointMass.getVelocity();
          //   // Vector.addTo(pointMass.position, Vector.multiply(vel, -0.5));
          // }
        }
      }

      // Apply all forces for current iteration
      for (let i in pointMasses) {
        let pointMass = pointMasses[i];
        Vector.addTo(pointMass.position, pointMass.forceToAdd);
      }
    }

    for (let i in pointMasses) {
      let pointMass = pointMasses[i];
      pointMass.update(dt);

      poss[pointMass.index + 0] = pointMass.position.x;
      poss[pointMass.index + 1] = pointMass.position.y;
      poss[pointMass.index + 2] = pointMass.position.z;
    }

    // Update physics mesh
    // md.setAttribute("position", md.data.position);
    // md.recalculateNormals();

    // Update visual mesh
    let subdivided = md.getSubdivision(1, true);
    let visualMeshData = visualMesh.meshRenderer.meshData[0];

    visualMeshData.vaos = new WeakMap();
    visualMeshData.setAttribute("indices", subdivided.indices);
    visualMeshData.setAttribute("position", subdivided.position);

    visualMeshData.recalculateNormals();
    // this.recalculateTangents();
  };

  this.setSpringStrength = function(strength) {
    for (var spring of springs) {
      spring.strength = strength;
    }
  };

  this.applyImpulse = function(impulse) {
    for (var i in pointMasses) {
      var pointMass = pointMasses[i];
      Vector.addTo(pointMass.position, impulse);
    }
  };

  function PointMass(position, index) {
    var initialVelocity = Vector.copy(position);
    this.position = position;
    this.oldPosition = Vector.copy(position);

    this.fixed = false;
    this.index = index;

    this.mass = 1;

    this.forceToAdd = Vector.zero();

    let velocity = new Vector();
    let gravityAcc = new Vector();

    this.update = function(dt) {
      if (!this.fixed) {
        this.getVelocity(velocity);
        // Vector.multiplyTo(velocity, 0.99);

        Vector.copy(this.position, this.oldPosition);

        Vector.addTo(this.position, velocity);

        Vector.multiply(physicsEngine.gravity, dt * dt, gravityAcc);
        Vector.addTo(this.position, gravityAcc);
      }
      else {
        Vector.copy(initialVelocity, this.position);
        Vector.copy(initialVelocity, this.oldPosition);
      }
    };

    this.getVelocity = function(dst) {
      dst = dst || new Vector();
      return Vector.subtract(this.position, this.oldPosition, dst);
    };
  }

  function Spring(p1, p2, len) {
    this.p1 = p1;
    this.p2 = p2;
    this.len = len ?? Vector.distance(this.p1.position, this.p2.position);
    this.strength = 0.5;

    let diff = new Vector();
    let dir = new Vector();
    let force = new Vector();

    this.constrain = function() {
      Vector.subtract(this.p1.position, this.p2.position, diff);

      let distance = Vector.length(diff);
      if (distance < 1e-6) return;

      let error = this.len - distance;
      Vector.divide(diff, distance, dir);

      if (this.p1.fixed && !this.p2.fixed) {
        Vector.multiply(dir, -error * this.strength, force);
        // Vector.addTo(this.p2.position, force);
        Vector.addTo(this.p2.forceToAdd, force);
      }
      else if (this.p2.fixed && !this.p1.fixed) {
        Vector.multiply(dir, error * this.strength, force);
        // Vector.addTo(this.p1.position, force);
        Vector.addTo(this.p1.forceToAdd, force);
      }
      else if (!this.p1.fixed && !this.p2.fixed) {
        Vector.multiply(dir, error / 2 * this.strength, force);
        // Vector.addTo(this.p1.position, force);
        Vector.addTo(this.p1.forceToAdd, force);
        
        Vector.multiply(dir, -error / 2 * this.strength, force);
        // Vector.addTo(this.p2.position, force);
        Vector.addTo(this.p2.forceToAdd, force);
      }
    };
  }
}

function PlaneCollider(position, normal) {
  this.position = position;
  this.normal = Vector.normalize(normal);

  let _diff = new Vector();
  let _proj = new Vector();

  this.constrain = function(pointMass) {
    Vector.subtract(pointMass.position, this.position, _diff);
    var d = Vector.dot(_diff, this.normal);
    if (d < 0) {
      Vector.projectOnPlane(_diff, this.normal, _proj);
      Vector.add(_proj, this.position, pointMass.position);
    }
  };
}

const pa = new Vector();
const ba = new Vector();
const diff = new Vector();
const _normal = new Vector();
const _scaledNormal = new Vector();
const bah = new Vector();
const abah = new Vector();

function CapsuleCollider(a, b, radius) {
  this.a = a;
  this.b = b;
  this.radius = radius;

  this.constrain = function(pointMass) {
    Vector.subtract(pointMass.position, this.a, pa);
    Vector.subtract(this.b, this.a, ba);
    const h = clamp(Vector.dot(pa, ba) / Vector.dot(ba, ba), 0, 1);

    Vector.multiply(ba, h, bah);
    Vector.subtract(pa, bah, diff);

    const lengthSqr = Vector.lengthSqr(diff);
    const distanceSqr = lengthSqr - this.radius * this.radius;

    if (distanceSqr < 0) {
      // const distance = Math.sqrt(lengthSqr) - this.radius;
      Vector.normalize(diff, _normal);

      Vector.add(this.a, bah, abah);
      Vector.multiply(_normal, this.radius, _scaledNormal);
      Vector.add(abah, _scaledNormal, pointMass.position);
    }
    
    // let p = pointMass.position;
    // let pa = Vector.subtract(p, this.a);
    // let ba = Vector.subtract(this.b, this.a);
    // let h = clamp(Vector.dot(pa, ba) / Vector.dot(ba, ba), 0, 1);
    // let diff = Vector.subtract(pa, Vector.multiply(ba, h));
    // let normal = Vector.normalize(diff);
    // let distance = Vector.length(diff) - this.radius;

    // if (distance < 0) {
    //   pointMass.position = Vector.add(Vector.add(this.a, Vector.multiply(ba, h)), Vector.multiply(normal, this.radius));

    //   // let diff = Vector.subtract(Vector.add(Vector.add(this.a, Vector.multiply(ba, h)), Vector.multiply(normal, this.radius)), p);
    //   // Vector.addTo(pointMass.forceToAdd, diff);
    // }
  };
}

let _a = new Vector();
let _b = new Vector();
let _c = new Vector();
let _cross = new Vector();

function getMeshVolume(meshData) {
  var volume = 0;

  if (meshData.data.position && meshData.data.indices) {
    var poss = meshData.data.position.bufferData;
    var inds = meshData.data.indices.bufferData;

    for (var j = 0; j < inds.length; j += 3) {
      Vector.fromArray(poss, inds[j + 0] * 3, 1, 3, _a);
      Vector.fromArray(poss, inds[j + 1] * 3, 1, 3, _b);
      Vector.fromArray(poss, inds[j + 2] * 3, 1, 3, _c);

      Vector.cross(_b, _c, _cross);
      volume += Math.abs(Vector.dot(_a, _cross) / 6);
    }
  }
  else {
    return null;
  }
  
  return volume;
}

function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

function shuffleArrayChunks(array, chunkSize = 1) {
  for (let i = floorNearest(array.length - 1, chunkSize); i > 0; i -= chunkSize) {
    const j = floorNearest(Math.random() * (i + 1), chunkSize);

    for (var count = 0; count < chunkSize; count++) {
      [array[i + count], array[j + count]] = [array[j + count], array[i + count]];
    }
  }
}

function floorNearest(x, step) {
  return Math.floor(x / step) * step;
}

export default Softbody;