import { AABBToTriangle, AABBTriangleToAABB } from "./algebra.mjs";
import { GameObject } from "./gameObject.mjs";
import { mapValue } from "./helper.mjs";
import Matrix from "./matrix.mjs";
import { AABB, GetMeshAABB, Octree } from "./physics.mjs";
import Vector from "./vector.mjs";
import PriorityQueue from "./priorityQueue.mjs";

export function NavMesh() {
  this.resolution = 8;
  this.padding = 0.1;

  let aabb = null;
  let aabbSize = null;
  let voxelSize = null;
  let voxelGrid = null;
  let voxelGridWithData = null;
  let octree = null;

  this.loadVoxelGrid = async function(path, _aabb) {
    return new Promise((resolve, reject) => {
      const oReq = new XMLHttpRequest();
      oReq.open("GET", path, true);
      oReq.responseType = "arraybuffer";
  
      oReq.onload = async (/*oEvent*/) => {
        if (oReq.status != 200) {
          reject("Could not load voxel grid: " + oReq.statusText);
          return;
        }

        const arrayBuffer = oReq.response;
        if (arrayBuffer) {
          const byteArray = new Uint8Array(arrayBuffer);

          console.log(byteArray.length * 8, 256 ** 3);

          voxelGrid = new Uint8Array(256 ** 3);
          for (let i = 0; i < byteArray.length; i++) {
            const byte = byteArray[i].toString(2).padStart(8, "0").split("");
            try {
              voxelGrid.set(byte, i * 8);
            }
            catch {
              console.log(i * 8, voxelGrid.length);
            }
          }

          this.resolution = Math.cbrt(voxelGrid.length);

          aabb = _aabb;
          aabbSize = aabb.getSize();
          voxelSize = Vector.divide(aabbSize, this.resolution);

          const _position = new Vector();

          voxelGridWithData = new Array(voxelGrid.length);
          for (let i = 0; i < voxelGridWithData.length; i++) {
            if (voxelGrid[i] === 0) {
              gridIndexToPosition(i, _position);
              _position.y -= 1;

              if (isOutsideGrid(_position)) {
                continue;
              }

              const voxel = voxelGrid[positionToGridIndex(_position)];
              if (voxel === 0) {
                continue;
              }
            }

            voxelGridWithData[i] = {
              parent: null,
              index: i,
              value: voxelGrid[i],
              cost: Infinity,
              estimatedTotalCost: Infinity,
            };
          }

          resolve();
        }
      };
  
      oReq.send(null);
    });
  };

  /**
   * Convert gameObject into voxel grid
   * @param {GameObject} gameObject 
   */
  this.createVoxelGrid = function(gameObject, customAABB) {
    if (!(gameObject instanceof GameObject)) {
      throw new Error("GameObject is not GameObject");
    }
  
    aabb = customAABB ?? GetMeshAABB(gameObject, this.padding);
    aabbSize = aabb.getSize();
    voxelSize = Vector.divide(aabbSize, this.resolution);
  
    voxelGrid = new Array(this.resolution * this.resolution * this.resolution).fill(0);
  
    console.time("Generate octree");
    octree = createOctree(aabb, gameObject);
    console.timeEnd("Generate octree");
  
    console.time("Generate grid");
  
    for (let x = 0; x < this.resolution; x++) {
      for (let y = 0; y < this.resolution; y++) {
        for (let z = 0; z < this.resolution; z++) {
          const t = Vector.divide(new Vector(x, y, z), this.resolution);
          const bl = Vector.add(aabb.bl, Vector.compMultiply(t, aabbSize));
          const tr = Vector.add(bl, voxelSize);
          const voxel = new AABB(bl, tr);
  
          if (meshIntersectsVoxel(octree, voxel)) {
            voxelGrid[positionToGridIndex(new Vector(x, y, z))] = 1;
          }
        }
      }
    }
  
    console.timeEnd("Generate grid");
  };

  this.exportVoxelGrid = function() {
    console.log(voxelGrid);
    console.log("[" + voxelGrid.join(",") + "]");
  };

  this.debugVoxelGrid = function() {
    if (!voxelGrid) {
      throw new Error("Generate voxel grid first with .createVoxelGrid()");
    }

    window.glDebugger.CreateBounds(aabb);

    for (let x = 0; x < this.resolution; x++) {
      for (let y = 0; y < this.resolution; y++) {
        for (let z = 0; z < this.resolution; z++) {
          if (voxelGrid[positionToGridIndex(new Vector(x, y, z))]) {
            const voxel = this.getVoxelAABB(x, y, z);
            window.glDebugger.CreateBounds(voxel);
          }
        }
      }
    }
  };

  this.pathfind = function(startWorld, endWorld) {
    if (!voxelGrid) {
      throw new Error("Generate voxel grid first with .createVoxelGrid()");
    }

    console.time("Pathfind");

    window.glDebugger.CreatePoint(startWorld, Math.min(voxelSize.x, voxelSize.y, voxelSize.z) * 0.25);
    window.glDebugger.CreatePoint(endWorld, Math.min(voxelSize.x, voxelSize.y, voxelSize.z) * 0.25);

    const start = worldPositionToVoxelPosition(startWorld);
    const end = worldPositionToVoxelPosition(endWorld);

    // Shrinkwrap to ground
    while (voxelGrid[positionToGridIndex(start)] === 0) {
      start.y -= 1;
      if (isOutsideGrid(start)) {
        break;
      }
    }
    start.y += 1;

    while (voxelGrid[positionToGridIndex(end)] === 0) {
      end.y -= 1;
      if (isOutsideGrid(end)) {
        break;
      }
    }
    end.y += 1;

    if (isOutsideGrid(start)) {
      throw new Error("Start is outside grid");
    }
    if (isOutsideGrid(end)) {
      throw new Error("End is outside grid");
    }

    // Reset grid
    console.time("Reset");
    for (let i = 0; i < voxelGridWithData.length; i++) {
      const voxel = voxelGridWithData[i];
      if (!voxel) {
        continue;
      }

      voxel.cost = Infinity;
      voxel.estimatedTotalCost = Infinity;
    }
    console.timeEnd("Reset");

    const endVoxel = voxelGridWithData[positionToGridIndex(end)];

    const startVoxel = voxelGridWithData[positionToGridIndex(start)];
    startVoxel.visited = true;
    startVoxel.cost = 0;
    startVoxel.estimatedTotalCost = getDistanceBetweenVoxels(startVoxel, endVoxel);

    const queue = new PriorityQueue((a, b) => b.estimatedTotalCost > a.estimatedTotalCost);
    queue.push(startVoxel);

    console.time("Loop");
    while (!queue.isEmpty()) {
      const voxel = queue.pop();
      if (voxel === endVoxel) {
        console.log("Goal!");
        console.timeEnd("Pathfind");
        console.timeEnd("Loop");

        renderPath(voxel);

        return;
      }

      for (const nextVoxel of getConnectedVoxels(voxel)) {
        const nextCost = voxel.cost + 1;
        if (nextCost >= nextVoxel.cost) {
          continue;
        }

        nextVoxel.parent = voxel;
        nextVoxel.cost = nextCost;
        nextVoxel.estimatedTotalCost = nextCost + getDistanceBetweenVoxels(nextVoxel, endVoxel);
        queue.push(nextVoxel);
      }
    }

    console.log("Did not find goal :(");
    console.timeEnd("Pathfind");
    console.timeEnd("Loop");
  };

  this.getVoxelAABB = function(x, y, z) {
    const t = Vector.divide(new Vector(x, y, z), this.resolution);
    const bl = Vector.add(aabb.bl, Vector.compMultiply(t, aabbSize));
    const tr = Vector.add(bl, voxelSize);
    const voxel = new AABB(bl, tr);
    return voxel;
  };

  const getConnectedVoxels = (() => {
    const _offsets = [
      new Vector(1, 0, 0),
      new Vector(-1, 0, 0),
      new Vector(0, 0, 1),
      new Vector(0, 0, -1),

      new Vector(1, 1, 0),
      new Vector(-1, 1, 0),
      new Vector(-1, -1, 0),
      new Vector(1, -1, 0),

      new Vector(0, 1, 1),
      new Vector(0, 1, -1),
      new Vector(0, -1, -1),
      new Vector(0, -1, 1),
    ];
    const _position = new Vector();
    const _newPosition = new Vector();
    const _floorPosition = new Vector();

    return function*(voxel) {
      const index = voxel.index;
      gridIndexToPosition(index, _position);

      for (const offset of _offsets) {
        Vector.add(_position, offset, _newPosition);

        // Check for air voxel that exists
        if (isOutsideGrid(_newPosition)) {
          continue;
        }
        const voxel = voxelGridWithData[positionToGridIndex(_newPosition)];
        if (!voxel || voxel.value === 1) {
          continue;
        }

        // Check for floor under voxel
        Vector.copy(_newPosition, _floorPosition);
        _floorPosition.y -= 1;
        if (isOutsideGrid(_floorPosition)) {
          continue;
        }
        const floorVoxel = voxelGridWithData[positionToGridIndex(_floorPosition)];
        if (!floorVoxel || floorVoxel.value === 0) {
          continue;
        }

        yield voxel;
      }
    };
  })();

  const getDistanceBetweenVoxels = (() => {
    const _a = new Vector();
    const _b = new Vector();
    
    return (a, b) => {
      gridIndexToPosition(a.index, _a);
      gridIndexToPosition(b.index, _b);

      const x = _b.x - _a.x;
      const y = _b.y - _a.y;
      const z = _b.z - _a.z;
      return Math.abs(x) + Math.abs(y) + Math.abs(z);
    };
  })();

  const renderPath = (endVoxel) => {
    let voxel = endVoxel;
    while (voxel) {
      const position = gridIndexToPosition(voxel.index);
      const voxelAABB = this.getVoxelAABB(position.x, position.y, position.z);
      const center = voxelAABB.getCenter();
      window.glDebugger.CreatePoint(center, Math.min(voxelSize.x, voxelSize.y, voxelSize.z) * 0.5);

      voxel = voxel.parent;
    }
  };

  const isOutsideGrid = (voxelPosition) => {
    return (
      voxelPosition.x < 0 ||
      voxelPosition.y < 0 ||
      voxelPosition.z < 0 ||
      voxelPosition.x >= this.resolution ||
      voxelPosition.y >= this.resolution ||
      voxelPosition.z >= this.resolution
    );
  };

  const meshIntersectsVoxel = (octree, voxel) => {
    const triangles = octree.queryAABB(voxel).triangles;
    for (const triangle of triangles) {
      if (!AABBTriangleToAABB(triangle[0], triangle[1], triangle[2], voxel)) {
        continue;
      }

      if (AABBToTriangle(voxel, triangle)) {
        return true;
      }
    }

    return false;
  };

  const createOctree = (aabb, gameObject) => {
    let triangleIndex = 0;
    const trianglesArray = [];

    gameObject.traverse((gameObject) => {
      if (!gameObject.meshRenderer) {
        return;
      }

      const worldMatrix = gameObject.transform.worldMatrix;

      for (let j = 0; j < gameObject.meshRenderer.meshData.length; j++) {
        const md = gameObject.meshRenderer.meshData[j].data;

        for (let k = 0; k < md.indices.bufferData.length; k += 3) {
          for (let l = 0; l < 3; l++) {
            const currentIndex = md.indices.bufferData[k + l] * 3;
            const localVertex = Vector.fromArray(md.position.bufferData, currentIndex, 1, 3);
            const worldVertex = Matrix.transformVector(worldMatrix, localVertex);

            trianglesArray[triangleIndex * 9 + l * 3 + 0] = worldVertex.x;
            trianglesArray[triangleIndex * 9 + l * 3 + 1] = worldVertex.y;
            trianglesArray[triangleIndex * 9 + l * 3 + 2] = worldVertex.z;
          }

          triangleIndex++;
        }
      }
    }, (gameObject) => gameObject.visible && gameObject.active);
    
    const nrTriangles = triangleIndex;
    const trianglesPerSection = 1000 / 10;
    const d = nrTriangles <= 0 ? 0 : Math.max(0, Math.floor(Math.log(nrTriangles / trianglesPerSection) / Math.log(8) + 1));

    const octree = new Octree(aabb, d);
    octree.addTriangles(trianglesArray);

    return octree;
  };

  const worldPositionToVoxelPosition = (worldPosition) => {
    if (!aabb.pointInside(worldPosition)) {
      throw new Error("World position is outside AABB");
    }

    return new Vector(
      Math.floor(mapValue(worldPosition.x, aabb.bl.x, aabb.tr.x, 0, this.resolution)),
      Math.floor(mapValue(worldPosition.y, aabb.bl.y, aabb.tr.y, 0, this.resolution)),
      Math.floor(mapValue(worldPosition.z, aabb.bl.z, aabb.tr.z, 0, this.resolution)),
    );
  };

  const positionToGridIndex = (position) => {
    return position.x + position.y * this.resolution + position.z * this.resolution * this.resolution;
  };

  const gridIndexToPosition = (index, dst) => {
    const position = new Vector(
      index % this.resolution,
      Math.floor(index / this.resolution) % this.resolution,
      Math.floor(index / this.resolution / this.resolution),
      dst
    );
    return position;
  };
}