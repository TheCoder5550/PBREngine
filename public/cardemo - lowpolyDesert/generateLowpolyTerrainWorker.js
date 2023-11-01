import Vector from "../engine/vector.mjs";
import Perlin from "../engine/perlin.mjs";
import { clamp, lerp } from "../engine/helper.mjs";
import { getTriangleNormal } from "../engine/algebra.mjs";
import { CatmullRomCurve } from "../engine/curves.mjs";

const perlin = new Perlin();

const roadWidth = 12;
const chunkSize = 300;
const curveXMax = 0.3;
const lerpDistance = 70;

self.addEventListener("message", (e) => {
  const offset = e.data.offset;
  const curvePoints = e.data.curvePoints;
  const curve = new CatmullRomCurve(curvePoints);
  const id = e.data.id;

  self.postMessage({
    meshData: generateTerrain(offset, curve),
    id,
  });
});

function generateTerrain(offset, curve) {
  const indices = [];
  const vertices = [];
  const uvs = [];
  const normals = [];

  const getHeight = (x, z) => {
    const height = LayeredNoise(x * 0.01, z * 0.01, 3) * 35 + 25;

    if (Math.abs(x) > chunkSize * curveXMax / 2 + roadWidth / 2 + lerpDistance) {
      return height;
    }

    const { distance, point } = curve.distanceSqrToPoint(new Vector(x - offset.x, 0, z - offset.z));

    return lerp(point.y - 0.1 - clamp(1 - distance / roadWidth, 0, 1), height, clamp((distance - roadWidth * roadWidth) / (lerpDistance * lerpDistance), 0, 1));
  };

  const getPosition = (i, j, dst) => {
    dst = dst || new Vector();

    dst.x = (i - (res - 1) / 2) * s + offset.x;
    dst.z = (j - (res - 1) / 2) * s + offset.z;
    dst.y = getHeight(dst.x, dst.z) + offset.y;

    const noiseX = perlin.noise(dst.x * 0.5, dst.z * 0.5);
    const noiseZ = perlin.noise(dst.z * 0.5, dst.x * 0.5);

    dst.x += noiseX * 2;
    dst.z += noiseZ * 2;

    return dst;
  };

  const size = chunkSize;
  const res = 50 * 2;
  const s = size / res;
  
  const v1 = new Vector();
  const v2 = new Vector();
  const v3 = new Vector();
  const _normal = new Vector();

  for (let i = 0; i < res; i++) {
    for (let j = 0; j < res; j++) {
      {
        const vertexOffset = vertices.length / 3;

        getPosition(i, j, v1);
        getPosition(i + 1, j, v2);
        getPosition(i + 1, j + 1, v3);

        getTriangleNormal([ v1, v3, v2 ], _normal);
        normals.push(_normal.x, _normal.y, _normal.z);
        normals.push(_normal.x, _normal.y, _normal.z);
        normals.push(_normal.x, _normal.y, _normal.z);

        vertices.push(v1.x, v1.y, v1.z);
        vertices.push(v2.x, v2.y, v2.z);
        vertices.push(v3.x, v3.y, v3.z);
        
        indices.push(vertexOffset + 0);
        indices.push(vertexOffset + 2);
        indices.push(vertexOffset + 1);

        uvs.push(0, 0);
        uvs.push(5, 0);
        uvs.push(5, 5);
      }

      {
        const vertexOffset = vertices.length / 3;

        getPosition(i, j, v1);
        getPosition(i + 1, j + 1, v2);
        getPosition(i, j + 1, v3);

        getTriangleNormal([ v1, v3, v2 ], _normal);
        normals.push(_normal.x, _normal.y, _normal.z);
        normals.push(_normal.x, _normal.y, _normal.z);
        normals.push(_normal.x, _normal.y, _normal.z);

        vertices.push(v1.x, v1.y, v1.z);
        vertices.push(v2.x, v2.y, v2.z);
        vertices.push(v3.x, v3.y, v3.z);
        
        indices.push(vertexOffset + 0);
        indices.push(vertexOffset + 2);
        indices.push(vertexOffset + 1);

        uvs.push(0, 0);
        uvs.push(5, 5);
        uvs.push(0, 5);
      }
    }
  }

  console.log(vertices.length / 3, indices.length / 3);

  return {
    indices: {
      bufferData: new Uint32Array(indices),
    },
    position: {
      bufferData: new Float32Array(vertices),
      size: 3
    },
    uv: {
      bufferData: new Float32Array(uvs),
      size: 2
    },
    normal: {
      bufferData: new Float32Array(normals),
      size: 3
    },
  };
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