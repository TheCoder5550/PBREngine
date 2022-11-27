import { Scene, Transform, GameObject } from "./renderer.mjs";
import Vector from "./vector.mjs";
import Perlin from "./perlin.mjs";
import { MeshCollider } from "./physics.mjs";
import { mapValue, lerp } from "./helper.mjs";
import { getTriangleNormal } from "./algebra.mjs";

var perlin = new Perlin();

function Terrain(scene) {
  var _terrain = this;
  this.scene = scene;
  if (!(this.scene instanceof Scene)) {
    throw new Error("scene is not a Scene");
  }
  var renderer = this.scene.renderer;

  this.chunkUpdatesPerFrame = 1;
  this.chunkRes = 41;
  this.minimumChunkSize = 20;
  this.terrainSize = 1000;
  this.uvScale = 1 / 2;
  this.position = Vector.zero();
  this.maxHeight = 400;

  // var chunkOrders = [];
  this.meshPool = [];
  var chunkQueue = [];
  this.quadtree = new TerrainQuadtree({x: this.position.x, z: this.position.z}, this.terrainSize);

  var zeroTransform = new Transform();

  this.terrainMat = null;
  this.loadMaterials = async function() {
    var litTerrain = new renderer.ProgramContainer(await renderer.createProgramFromFile("./assets/shaders/custom/webgl2/litTerrain"));

    var gl = renderer.gl;
    var sRGBInternalFormat = renderer.version == 1 ? (renderer.sRGBExt && (renderer.floatTextures || renderer.textureHalfFloatExt) ? renderer.sRGBExt.SRGB_ALPHA_EXT : gl.RGBA) : gl.SRGB8_ALPHA8;
    var sRGBFormat = renderer.version == 1 ? (renderer.sRGBExt && (renderer.floatTextures || renderer.textureHalfFloatExt) ? renderer.sRGBExt.SRGB_ALPHA_EXT : gl.RGBA) : gl.RGBA;
    var grassAlbedo = await renderer.loadTextureAsync("./assets/textures/Ground037_4K-JPG/Ground037_4K_Color.jpg", {internalFormat: sRGBInternalFormat, format: sRGBFormat});
    var grassNormal = await renderer.loadTextureAsync("./assets/textures/Ground037_4K-JPG/Ground037_4K_Normal.jpg");

    var stoneAlbedo = await renderer.loadTextureAsync("./assets/textures/rocks_ground_06/diffuse.jpg", {internalFormat: sRGBInternalFormat, format: sRGBFormat});
    var stoneNormal = await renderer.loadTextureAsync("./assets/textures/rocks_ground_06/normal.png");

    var snowAlbedo = await renderer.loadTextureAsync("./assets/textures/Snow/albedo.jpg", {internalFormat: sRGBInternalFormat, format: sRGBFormat});
    var snowNormal = await renderer.loadTextureAsync("./assets/textures/Snow/normal.jpg");

    this.terrainMat = renderer.CreateLitMaterial({}, litTerrain);
    this.terrainMat.setUniform("roughness", 1);
    this.terrainMat.setUniform("albedoTextures[0]", [ grassAlbedo, stoneAlbedo, snowAlbedo ]);
    this.terrainMat.setUniform("normalTextures[0]", [ grassNormal, stoneNormal, snowNormal ]);
  }

  // const myWorker = new Worker("./engine/terrainDataWorker.js");
  // myWorker.onmessage = function(e) {
  //   console.log(e);
  // }
  // myWorker.postMessage({
  //   w: 40,
  //   h: 40,
  //   res: 50,
  //   heightFactor: maxHeight,
  //   noiseOffset: new Vector(0, 0, 0),
  //   noiseScale: 0.001,
  //   uvOffset: Vector.zero(),
  //   uvScale: uvScale,
  // });

  this.getHeight = function(i, j) {
    var power = 2;
    var noiseLayers = 2;
    var noiseScale = 0.001;
    
    var heightFalloff = 1;//1 - clamp((Vector.length(new Vector(i, j)) - 400) * 0.005, 0, 1);
    var elevation = Math.pow(Math.abs(LayeredNoise(i * noiseScale, j * noiseScale, noiseLayers)), power) * this.maxHeight * heightFalloff;

    return elevation;
  }

  this.update = function(transform) {
    if (transform) {
      this.quadtree.placeTransform(transform);
    }
    else {
      this.quadtree.placeTransform(zeroTransform);
    }

    // for (var order of chunkOrders) {
    //   if (!order.chunk) {
    //     [order.chunk, order.queueEntry] = createChunk(order, order.position.x, order.position.z, order.size, _terrain.chunkRes, () => {
    //       for (var child of order.children) {
    //         child.cleanup();
    //       }
    //       order.children = [];

    //       if (order.parent) {
    //         order.parent.onChunkGenerated();
    //       }
    //     });
    //   }
    // }
    // chunkOrders = [];

    // chunkQueue.sort((a, b) => {
    //   var da = (a.quadtree.position.x - transform.position.x) ** 2 + (a.quadtree.position.z - transform.position.z) ** 2;
    //   var db = (b.quadtree.position.x - transform.position.x) ** 2 + (b.quadtree.position.z - transform.position.z) ** 2;
    //   return da - db;
    // });

    for (var i = 0; i < this.chunkUpdatesPerFrame; i++) {
      if (chunkQueue.length > 0) {
        var chunk;
        do {
          chunk = chunkQueue.shift();
        }
        while (chunk && chunk.isDeleted);

        if (!chunk.isDeleted) {
          var neighbors = chunk.quadtree.getNeighbors();
          chunk.quadtree.lastNeighborDepths = neighbors.map(n => n?.depth);

          var terrainData = createTerrainData(chunk.quadtree, neighbors, {
            w: chunk.chunkSize,
            h: chunk.chunkSize,
            res: chunk.chunkRes,
            noiseOffset: new Vector(chunk.x, chunk.z, 0),
            uvOffset: new Vector((chunk.x - chunk.chunkSize / 2) * this.uvScale, (chunk.z - chunk.chunkSize / 2) * this.uvScale, 0),
            uvScale: chunk.chunkSize * this.uvScale,
          });

          if (!chunk.terrain.meshRenderer) {
            chunk.terrain.meshRenderer = new this.scene.renderer.MeshRenderer(
              this.terrainMat,
              new renderer.MeshData(terrainData),
            );
          }
          else {
            chunk.terrain.meshRenderer.meshData[0].updateData(terrainData);
          }

          chunk.terrain.visible = true;

          // for (var neighbor of neighbors) {
          //   if (neighbor && neighbor.depth <= chunk.quadtree.depth) {
          //     neighbor.regenerateThisMesh();
          //   }
          // }
        }

        chunk.terrain.isGenerated = true;
        chunk.whenDone();
      }
      else {
        break;
      }
    }
  }

  function TerrainQuadtree(position, size, parent = null, siblingDirection = null, depth = 0) {
    var _quadtree = this;

    this.position = position;
    this.size = size;

    this.children = [];
    this.parent = parent;
    this.siblingDirection = siblingDirection;
    this.depth = depth;
    // this.allMeshes = [];

    this.waitingToCleanMesh = false;

    this.placeTransform = function(transform) {
      var a = this.position.x - transform.position.x;
      var b = this.position.z - transform.position.z;

      if (this.size > _terrain.minimumChunkSize && a * a + b * b < (this.size * 1.5) ** 2) {
        if (this.children.length == 0) {
          this.children.push(new TerrainQuadtree({x: this.position.x - this.size / 4, z: this.position.z - this.size / 4}, this.size / 2, this, {x: -1, z: -1}, this.depth + 1));
          this.children.push(new TerrainQuadtree({x: this.position.x + this.size / 4, z: this.position.z - this.size / 4}, this.size / 2, this, {x: 1, z: -1}, this.depth + 1));
          this.children.push(new TerrainQuadtree({x: this.position.x + this.size / 4, z: this.position.z + this.size / 4}, this.size / 2, this, {x: 1, z: 1}, this.depth + 1));
          this.children.push(new TerrainQuadtree({x: this.position.x - this.size / 4, z: this.position.z + this.size / 4}, this.size / 2, this, {x: -1, z: 1}, this.depth + 1));
        }

        for (var child of this.children) {
          child.placeTransform(transform);
        }

        if (this.isAreaFilled(true)) {
          this.cleanMesh();
        }
        else {
          this.waitingToCleanMesh = true;
        }
      }
      else {
        if (!this.chunk) {
          // console.log("new chunk");

          // chunkOrders.push(this);

          [this.chunk, this.queueEntry] = createChunk(this, this.position.x, this.position.z, this.size, _terrain.chunkRes, () => {
            for (var child of this.children) {
              child.cleanup();
            }
            this.children = [];

            if (this.parent) {
              this.parent.onChunkGenerated();
            }
          });

          // this.highlight();
        }
      }
    }

    this.onChunkGenerated = function() {
      if (this.waitingToCleanMesh && this.isAreaFilled(true)) {
        this.cleanMesh();
        this.waitingToCleanMesh = false;
      }
    }

    this.regenerateThisMesh = function() {
      if (this.chunk) {
        var neighborDepths = this.getNeighbors().map(n => n?.depth);
        if (!Array.isArray(this.lastNeighborDepths) || neighborDepths.every((v, i) => v === this.lastNeighborDepths[i])) {
          return;
        }

        this.cleanMesh();

        [this.chunk, this.queueEntry] = createChunk(this, this.position.x, this.position.z, this.size, _terrain.chunkRes, () => {
          for (var child of this.children) {
            child.cleanup();
          }
          this.children = [];

          if (this.parent) {
            this.parent.onChunkGenerated();
          }
        });
      }
    }

    this.regenerateMesh = function() {
      this.cleanMesh();

      if (this.chunk) {
        [this.chunk, this.queueEntry] = createChunk(this, this.position.x, this.position.z, this.size, _terrain.chunkRes, () => {
          for (var child of this.children) {
            child.cleanup();
          }
          this.children = [];

          if (this.parent) {
            this.parent.onChunkGenerated();
          }
        });
      }

      for (var child of this.children) {
        child.regenerateMesh();
      }
    }

    this.getNeighbors = function() {
      return [
        this._getNeighborInDirection(-1, 0),
        this._getNeighborInDirection(0, -1),
        this._getNeighborInDirection(1, 0),
        this._getNeighborInDirection(0, 1),
      ];
    }

    this._getNeighborInDirection = function(x, z) {
      if (this.parent) {
        var trivialNeighbor = this.parent.children.find(c => c.siblingDirection.x == this.siblingDirection.x + x * 2 && c.siblingDirection.z == this.siblingDirection.z + z * 2);
        if (trivialNeighbor) {
          return trivialNeighbor;
        }

        var p = this.parent._getNeighborInDirection(x, z);
        while (p && p.depth < this.depth && p.children.length > 0) {
          var sgnX = x == 0 ? 1 : -1;
          var sgnZ = z == 0 ? 1 : -1;
          p = p.children.find(c => c.siblingDirection.x == this.siblingDirection.x * sgnX && c.siblingDirection.z == this.siblingDirection.z * sgnZ);
        }
        return p;
      }

      return null;
    }

    this.isAreaFilled = function(ignoreMe = false) {
      if (!ignoreMe && this.chunk && this.chunk.isGenerated) {
        return true;
      }

      if (this.children.length > 0) {
        for (var child of this.children) {
          if (!child.isAreaFilled()) {
            return false;
          }
        }

        return true;
      }

      return false;
    }

    this.cleanup = function() {
      this.cleanMesh();

      for (var child of this.children) {
        child.cleanup();
      }

      this.children = [];
    }

    this.cleanMesh = function() {
      // for (var mesh of this.allMeshes) {
      //   if (mesh.meshRenderer) {
      //     mesh.meshRenderer.meshData[0].cleanup();
      //   }
      //   _terrain.scene.remove(mesh);

      //   mesh.isDeleted = true;
      // }

      // this.allMeshes = [];
      // this.chunk = null;
      
      if (this.chunk) {
        // if (this.chunk.meshRenderer) {
        //   this.chunk.meshRenderer.meshData[0].cleanup();
        // }
        // this.chunk.meshRenderer = null;
        this.chunk.visible = false;

        _terrain.scene.remove(this.chunk);

        _terrain.meshPool.push(this.chunk);

        this.chunk.isDeleted = true;
        this.chunk = null;
      }

      if (this.queueEntry) {
        var queueIndex = chunkQueue.indexOf(this.queueEntry);
        if (queueIndex !== -1) {
          chunkQueue.splice(queueIndex, 1);
        }

        this.queueEntry = null;
      }

      if (this.visInst) {
        aabbVis.meshRenderer.removeInstance(this.visInst);
      }
    }

    this.highlight = function(highlightChildren = false) {
      this.visInst = aabbVis.meshRenderer.addInstance(Matrix.transform([
        ["translate", new Vector(this.position.x, 0, this.position.z)],
        ["sx", this.size / 2],
        ["sy", 20 / 2],
        ["sz", this.size / 2]
      ]));

      if (highlightChildren) {
        for (var child of this.children) {
          child.highlight(true);
        }
      }
    }
  }

  function createChunk(quadtree, x, z, chunkSize, chunkRes, whenDone = () => {}) {
    var pooled = _terrain.meshPool.shift();
    if (pooled) {
      var terrain = pooled;
      terrain.name = "Terrain chunk " + x + "," + z;
      terrain.transform.position = new Vector(x, 0, z);
      terrain.isDeleted = false;
      terrain.isGenerated = false;
      _terrain.scene.add(terrain);

      var queueEntry = {x, z, chunkSize, chunkRes, terrain, whenDone, quadtree};
      chunkQueue.push(queueEntry);

      return [terrain, queueEntry];
    }

    var terrain = _terrain.scene.add(new GameObject("Terrain chunk " + x + "," + z));
    terrain.transform.position = new Vector(x, 0, z);
    terrain.visible = false;
    terrain.addComponent(new MeshCollider());

    var queueEntry = {x, z, chunkSize, chunkRes, terrain, whenDone, quadtree};
    chunkQueue.push(queueEntry);

    // quadtree.allMeshes.push(terrain);

    return [terrain, queueEntry];
  }

  function createTerrainData(quadtree, neighbors, {w = 20, h = 20, res = 5, noiseOffset = Vector.zero(), uvOffset = Vector.zero(), uvScale = 20}) {
    var getHeight = _terrain.getHeight.bind(_terrain);

    // function getNormal(i, j) {
    //   var R = getHeight(i + 1 + noiseOffset.x, j + noiseOffset.y);
    //   var L = getHeight(i - 1 + noiseOffset.x, j + noiseOffset.y);

    //   var T = getHeight(i + noiseOffset.x, j + 1 + noiseOffset.y);
    //   var B = getHeight(i + noiseOffset.x, j - 1 + noiseOffset.y);

    //   var va = Vector.normalize(new Vector(2, R - L, 0));
    //   var vb = Vector.normalize(new Vector(0, T - B, 2));
    //   var r = Vector.cross(va, vb);
    //   r.y *= -1;

    //   return r;
    // }

    var uvs = new Float32Array(res * res * 2);
    var vertices = new Float32Array(res * res * 3);
    var triangles = new Uint32Array((res - 1) * (res - 1) * 6);
    var tangents = new Float32Array(res * res * 3);

    var edgeVertexIndices = [[], [], [], []];

    var normals = new Array(res * res);
    for (var i = 0; i < normals.length; i++) {
      normals[i] = [];
    }

    var counter = 0;
    for (var i = 0; i < res; i++) {
      for (var j = 0; j < res; j++) {
        var x = mapValue(i, 0, res - 1, -w / 2, w / 2);
        var z = mapValue(j, 0, res - 1, -h / 2, h / 2);

        vertices[counter * 3 + 0] = x;
        vertices[counter * 3 + 1] = getHeight(x + noiseOffset.x, z + noiseOffset.y);
        vertices[counter * 3 + 2] = z;

        uvs[counter * 2 + 0] = i / (res - 1) * uvScale + uvOffset.x;
        uvs[counter * 2 + 1] = j / (res - 1) * uvScale + uvOffset.y;

        if (i == 0) {
          edgeVertexIndices[0].push(counter);
        }
        if (j == 0) {
          edgeVertexIndices[1].push(counter);
        }
        if (i == res - 1) {
          edgeVertexIndices[2].push(counter);
        }
        if (j == res - 1) {
          edgeVertexIndices[3].push(counter);
        }

        counter++;
      }
    }

    for (var i = 0; i < 4; i++) {
      var neighbor = neighbors[i];
      if (neighbor && quadtree.depth > neighbor.depth) {
        var stepsize = Math.pow(2, quadtree.depth - neighbor.depth);

        var currentHeight = getHeight(vertices[edgeVertexIndices[i][0] * 3 + 0] + noiseOffset.x, vertices[edgeVertexIndices[i][0] * 3 + 2] + noiseOffset.y);
        var nextHeight = getHeight(vertices[edgeVertexIndices[i][stepsize] * 3 + 0] + noiseOffset.x, vertices[edgeVertexIndices[i][stepsize] * 3 + 2] + noiseOffset.y);

        for (var j = 0; j < res; j++) {
          if (j % stepsize == 0 && j != 0) {
            currentHeight = nextHeight;
            nextHeight = getHeight(vertices[edgeVertexIndices[i][j + stepsize] * 3 + 0] + noiseOffset.x, vertices[edgeVertexIndices[i][j + stepsize] * 3 + 2] + noiseOffset.y);

            vertices[edgeVertexIndices[i][j] * 3 + 1] = currentHeight;
          }
          else {
            vertices[edgeVertexIndices[i][j] * 3 + 1] = lerp(currentHeight, nextHeight, (j % stepsize) / stepsize);
          }
        }
      }
    }

    counter = 0;
    for (var i = 0; i < res - 1; i++) {
      for (var j = 0; j < res - 1; j++) {
        var ind = j + i * res;
        var indices = [
          ind,
          ind + 1,
          ind + res,

          ind + 1,
          ind + res + 1,
          ind + res
        ];

        triangles[counter * 6 + 0] = ind;
        triangles[counter * 6 + 1] = ind + 1;
        triangles[counter * 6 + 2] = ind + res;
        triangles[counter * 6 + 3] = ind + 1;
        triangles[counter * 6 + 4] = ind + res + 1;
        triangles[counter * 6 + 5] = ind + res;

        var t1Normal = getTriangleNormal([Vector.fromArray(vertices, indices[0] * 3), Vector.fromArray(vertices, indices[1] * 3), Vector.fromArray(vertices, indices[2] * 3)]);
        var t2Normal = getTriangleNormal([Vector.fromArray(vertices, indices[3] * 3), Vector.fromArray(vertices, indices[4] * 3), Vector.fromArray(vertices, indices[5] * 3)]);

        normals[indices[0]].push(t1Normal);
        normals[indices[1]].push(t1Normal);
        normals[indices[2]].push(t1Normal);
        normals[indices[3]].push(t2Normal);
        normals[indices[4]].push(t2Normal);
        normals[indices[5]].push(t2Normal);

        // var x = mapValue(i, 0, res - 1, -w / 2, w / 2);
        // var z = mapValue(j, 0, res - 1, -h / 2, h / 2);
        // var dx = w / res / 2;
        // var dz = h / res / 2;

        // normals[indices[0]].push(getNormal(x, z));
        // normals[indices[1]].push(getNormal(x + dx, z));
        // normals[indices[2]].push(getNormal(x, z + dz));
        // normals[indices[4]].push(getNormal(x + dx, z + dz));

        counter++;
      }
    }

    for (var i = 0; i < 4; i++) {
      var neighbor = neighbors[i];
      if (neighbor) {
        for (var j = 0; j < res; j++) {
          var vertex = Vector.fromArray(vertices, edgeVertexIndices[i][j] * 3);

          if (i == 1) {
            var step = new Vector(w / (res - 1), 0, h / (res - 1));
            var t1Normal = getTriangleNormal([
              vertex,
              new Vector(vertex.x, getHeight(vertex.x + noiseOffset.x, vertex.z - step.z + noiseOffset.y), vertex.z - step.z),
              new Vector(vertex.x - step.x, getHeight(vertex.x - step.x + noiseOffset.x, vertex.z + noiseOffset.y), vertex.z),
            ]);

            var t2Normal = getTriangleNormal([
              vertex,
              new Vector(vertex.x + step.x, getHeight(vertex.x + step.x + noiseOffset.x, vertex.z - step.z + noiseOffset.y), vertex.z - step.z),
              new Vector(vertex.x, getHeight(vertex.x + noiseOffset.x, vertex.z - step.z + noiseOffset.y), vertex.z - step.z),
            ]);

            var t3Normal = getTriangleNormal([
              vertex,
              new Vector(vertex.x + step.x, getHeight(vertex.x + step.x + noiseOffset.x, vertex.z + noiseOffset.y), vertex.z),
              new Vector(vertex.x + step.x, getHeight(vertex.x + step.x + noiseOffset.x, vertex.z - step.z + noiseOffset.y), vertex.z - step.z),
            ]);

            // t1Normal = Vector.negate(t1Normal);
            // t2Normal = Vector.negate(t2Normal);
            // t3Normal = Vector.negate(t3Normal);

            normals[edgeVertexIndices[i][j]].push(t1Normal, t2Normal, t3Normal);
          }

          if (i == 3) {
            var step = new Vector(w / (res - 1), 0, h / (res - 1));
            var t1Normal = getTriangleNormal([
              vertex,
              new Vector(vertex.x + step.x, getHeight(vertex.x + step.x + noiseOffset.x, vertex.z + noiseOffset.y), vertex.z),
              new Vector(vertex.x, getHeight(vertex.x + noiseOffset.x, vertex.z + step.z + noiseOffset.y), vertex.z + step.z),
            ]);

            var t2Normal = getTriangleNormal([
              vertex,
              new Vector(vertex.x, getHeight(vertex.x + noiseOffset.x, vertex.z + step.z + noiseOffset.y), vertex.z + step.z),
              new Vector(vertex.x - step.x, getHeight(vertex.x - step.x + noiseOffset.x, vertex.z + step.z + noiseOffset.y), vertex.z + step.z),
            ]);

            var t3Normal = getTriangleNormal([
              vertex,
              new Vector(vertex.x - step.x, getHeight(vertex.x - step.x + noiseOffset.x, vertex.z + step.z + noiseOffset.y), vertex.z + step.z),
              new Vector(vertex.x - step.x, getHeight(vertex.x - step.x + noiseOffset.x, vertex.z + noiseOffset.y), vertex.z),
            ]);

            t1Normal = Vector.negate(t1Normal);
            t2Normal = Vector.negate(t2Normal);
            t3Normal = Vector.negate(t3Normal);

            normals[edgeVertexIndices[i][j]].push(t1Normal, t2Normal, t3Normal);
          }

          if (i == 0) {
            var step = new Vector(w / (res - 1), 0, h / (res - 1));
            var t1Normal = getTriangleNormal([
              vertex,
              new Vector(vertex.x - step.x, getHeight(vertex.x - step.x + noiseOffset.x, vertex.z + noiseOffset.y), vertex.z),
              new Vector(vertex.x, getHeight(vertex.x + noiseOffset.x, vertex.z - step.z + noiseOffset.y), vertex.z - step.z),
            ]);

            var t2Normal = getTriangleNormal([
              vertex,
              new Vector(vertex.x - step.x, getHeight(vertex.x - step.x + noiseOffset.x, vertex.z + step.z + noiseOffset.y), vertex.z + step.z),
              new Vector(vertex.x - step.x, getHeight(vertex.x - step.x + noiseOffset.x, vertex.z + noiseOffset.y), vertex.z),
            ]);

            var t3Normal = getTriangleNormal([
              vertex,
              new Vector(vertex.x, getHeight(vertex.x + noiseOffset.x, vertex.z + step.z + noiseOffset.y), vertex.z + step.z),
              new Vector(vertex.x - step.x, getHeight(vertex.x - step.x + noiseOffset.x, vertex.z + step.z + noiseOffset.y), vertex.z + step.z),
            ]);

            t1Normal = Vector.negate(t1Normal);
            t2Normal = Vector.negate(t2Normal);
            t3Normal = Vector.negate(t3Normal);

            normals[edgeVertexIndices[i][j]].push(t1Normal, t2Normal, t3Normal);
          }

          if (i == 2) {
            var step = new Vector(w / (res - 1), 0, h / (res - 1));
            var t1Normal = getTriangleNormal([
              vertex,
              new Vector(vertex.x + step.x, getHeight(vertex.x + step.x + noiseOffset.x, vertex.z + noiseOffset.y), vertex.z),
              new Vector(vertex.x, getHeight(vertex.x + noiseOffset.x, vertex.z + step.z + noiseOffset.y), vertex.z + step.z),
            ]);

            var t2Normal = getTriangleNormal([
              vertex,
              new Vector(vertex.x + step.x, getHeight(vertex.x + step.x + noiseOffset.x, vertex.z - step.z + noiseOffset.y), vertex.z - step.z),
              new Vector(vertex.x + step.x, getHeight(vertex.x + step.x + noiseOffset.x, vertex.z + noiseOffset.y), vertex.z),
            ]);

            var t3Normal = getTriangleNormal([
              vertex,
              new Vector(vertex.x, getHeight(vertex.x + noiseOffset.x, vertex.z - step.z + noiseOffset.y), vertex.z - step.z),
              new Vector(vertex.x + step.x, getHeight(vertex.x + step.x + noiseOffset.x, vertex.z - step.z + noiseOffset.y), vertex.z - step.z),
            ]);

            t1Normal = Vector.negate(t1Normal);
            t2Normal = Vector.negate(t2Normal);
            t3Normal = Vector.negate(t3Normal);

            normals[edgeVertexIndices[i][j]].push(t1Normal, t2Normal, t3Normal);
          }
        }
      }
    }

    var outNormals = new Float32Array(res * res * 3);
    for (var i = 0; i < normals.length; i++) {
      var normal = Vector.divide(normals[i].reduce((a, b) => {
        return Vector.add(a, b);
      }, Vector.zero()), normals[i].length);

      outNormals[i * 3 + 0] = normal.x;
      outNormals[i * 3 + 1] = normal.y;
      outNormals[i * 3 + 2] = normal.z;

      tangents[i * 3 + 0] = normal.y;
      tangents[i * 3 + 1] = normal.x;
      tangents[i * 3 + 2] = normal.z;
    }

    var renderer = _terrain.scene.renderer;
    var meshData = {
      indices: {
        bufferData: triangles,
        target: renderer.gl.ELEMENT_ARRAY_BUFFER
      },
      position: {
        bufferData: vertices,
        size: 3
      },
      normal: {
        bufferData: outNormals,
        size: 3
      },
      tangent: {
        bufferData: tangents,
        size: 3
      },
      uv: {
        bufferData: uvs,
        size: 2
      }
    };
    
    return meshData;
  }
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

export default Terrain;