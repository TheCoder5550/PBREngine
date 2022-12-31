import Vector from "./vector.mjs";

function Softbody(physicsEngine, md) {
  this.pressure = 2;
  this.constraintIterations = 10;//5;

  var colliders = [
    // new PlaneCollider(new Vector(1, 0, 0), new Vector(-1, 0, 0)),
    // new PlaneCollider(new Vector(-1, 0, 0), new Vector(1, 0, 0)),
    // new PlaneCollider(new Vector(0, 0, 5), new Vector(0, 0, -1)),
    new PlaneCollider(new Vector(0, 0, -4.5), new Vector(0, 0, 1)),

    new PlaneCollider(new Vector(0, -5, 0), new Vector(0.1, 1, 0)),
  ];

  var pointMasses = [];
  var springs = [];

  var poss = md.data.position.bufferData;
  var inds = md.data.indices.bufferData;

  for (var i = 0; i < poss.length; i += 3) {
    var v = Vector.fromArray(poss, i, 1, 3);
    var pm = new PointMass(v, i);

    console.log(v.z);
    if (v.z > -3) {
      pm.fixed = true;
    }

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

  this.update = function(dt) {
    time += dt;
    colliders[0].position.z = -4 + Math.sin(time * 2) * 0.7;

    var volume = getMeshVolume(md); // bruh might need to be inside iteration for loop

    for (var j = 0; j < inds.length; j += 3) {
      var a = pointMasses[inds[j + 0] * 3].position;
      var b = pointMasses[inds[j + 1] * 3].position;
      var c = pointMasses[inds[j + 2] * 3].position;

      var ax = (b.x - a.x);
      var ay = (b.y - a.y);
      var az = (b.z - a.z);

      var bx = (c.x - a.x);
      var by = (c.y - a.y);
      var bz = (c.z - a.z);

      normals[j + 0] = ay * bz - az * by;
      normals[j + 1] = az * bx - ax * bz;
      normals[j + 2] = ax * by - ay * bx;
    }

    for (var _ = 0; _  < this.constraintIterations; _++) {
      // var reactionForce = Vector.zero();

      // var volume = getMeshVolume(md);

      for (var j = 0; j < inds.length; j += 3) {
        var p1 = pointMasses[inds[j + 0] * 3];
        var p2 = pointMasses[inds[j + 1] * 3];
        var p3 = pointMasses[inds[j + 2] * 3];

        var a = p1.position;
        var b = p2.position;
        var c = p3.position;

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

        var orthogonalVector = new Vector(normals[j], normals[j + 1], normals[j + 2]);
        // var orthogonalVector = Vector.cross(Vector.subtract(b, a), Vector.subtract(c, a));

        Vector.multiplyTo(orthogonalVector, this.pressure / volume / 2);
        Vector.addTo(p1.position, orthogonalVector);
        Vector.addTo(p2.position, orthogonalVector);
        Vector.addTo(p3.position, orthogonalVector);

        // Vector.addTo(reactionForce, Vector.multiply(orthogonalVector, -0.01));
      }

      // for (var i in pointMasses) {
      //   var pointMass = pointMasses[i];
      //   Vector.addTo(pointMass.position, reactionForce);
      // }

      // shuffleArrayChunks(springs, 3);
      // shuffleArray(springs);
      // springs.reverse();
      for (var spring of springs) {
        spring.constrain(dt);
      }

      for (var i in pointMasses) {
        var pointMass = pointMasses[i];
        
        for (var collider of colliders) {
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

    for (var i in pointMasses) {
      var pointMass = pointMasses[i];
      pointMass.update(dt);

      poss[pointMass.index + 0] = pointMass.position.x;
      poss[pointMass.index + 1] = pointMass.position.y;
      poss[pointMass.index + 2] = pointMass.position.z;
    }

    md.setAttribute("position", md.data.position);

    md.recalculateNormals();
  }

  this.setSpringStrength = function(strength) {
    for (var spring of springs) {
      spring.strength = strength;
    }
  }

  this.applyImpulse = function(impulse) {
    for (var i in pointMasses) {
      var pointMass = pointMasses[i];
      Vector.addTo(pointMass.position, impulse);
    }
  }

  function PointMass(position, index) {
    var initialVelocity = Vector.copy(position);
    this.position = position;
    this.oldPosition = Vector.copy(position);

    this.fixed = false;
    this.index = index;

    this.mass = 1;

    this.update = function(dt) {
      if (!this.fixed) {
        var velocity = this.getVelocity();
        // Vector.multiplyTo(velocity, 0.99);

        this.oldPosition = Vector.copy(this.position);

        Vector.addTo(this.position, velocity);
        Vector.addTo(this.position, Vector.multiply(physicsEngine.gravity, dt * dt));
      }
      else {
        this.position = Vector.copy(initialVelocity);
        this.oldPosition = Vector.copy(initialVelocity);
      }
    }

    this.getVelocity = function() {
      return Vector.subtract(this.position, this.oldPosition);
    }
  }

  function Spring(p1, p2, len) {
    this.p1 = p1;
    this.p2 = p2;
    this.len = len ?? Vector.distance(this.p1.position, this.p2.position);
    this.strength = 0.5;

    this.constrain = function(dt) {
      var diff = Vector.subtract(this.p1.position, this.p2.position);
      var distance = Vector.length(diff);
      var error = this.len - distance;
      var dir = Vector.divide(diff, distance);

      if (distance < 1e-6) return;

      if (this.p1.fixed && !this.p2.fixed) {
        Vector.addTo(this.p2.position, Vector.multiply(dir, -error * this.strength));
      }
      else if (this.p2.fixed && !this.p1.fixed) {
        Vector.addTo(this.p1.position, Vector.multiply(dir, error * this.strength));
      }
      else if (!this.p1.fixed && !this.p2.fixed) {
        Vector.addTo(this.p1.position, Vector.multiply(dir, error / 2 * this.strength));
        Vector.addTo(this.p2.position, Vector.multiply(dir, -error / 2 * this.strength));
      }
    }
  }
}

function PlaneCollider(position, normal) {
  this.position = position;
  this.normal = Vector.normalize(normal);

  this.constrain = function(pointMass) {
    var diff = Vector.subtract(pointMass.position, this.position);
    var d = Vector.dot(diff, this.normal);
    if (d < 0) {
      pointMass.position = Vector.add(Vector.projectOnPlane(diff, this.normal), this.position);
    }
  }
}

function getMeshVolume(meshData) {
  var volume = 0;

  if (meshData.data.position && meshData.data.indices) {
    var poss = meshData.data.position.bufferData;
    var inds = meshData.data.indices.bufferData;

    for (var j = 0; j < inds.length; j += 3) {
      var a = Vector.fromArray(poss, inds[j + 0] * 3, 1, 3);
      var b = Vector.fromArray(poss, inds[j + 1] * 3, 1, 3);
      var c = Vector.fromArray(poss, inds[j + 2] * 3, 1, 3);

      volume += Math.abs(Vector.dot(a, Vector.cross(b, c)) / 6);
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