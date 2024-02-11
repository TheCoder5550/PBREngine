importScripts("../jsonfnWorker.min.js");

const MessageTypes = { TERRAIN_DATA: "TERRAIN_DATA", INIT: "INIT" };

let getHeight = () => 0;

self.onmessage = async function(e) {
  if (e.data.messageType === MessageTypes.INIT) {
    // eslint-disable-next-line no-undef
    const data = JSONfn.parse(e.data.initData);

    for (const entry in data) {
      if (!(entry in self)) {
        self[entry] = data[entry];
      }
      else {
        console.error(`Can't set init data: initData["${entry}"]. ${entry} already exists`);
      }
    }

    self.initData = { ...data };

    console.log("Init done");

    return;
  }

  // if (!self.initData) {
  //   return;
  // }

  const perlin = new Perlin();

  self.LayeredNoise = (x, y, octaves = 4) => {
    let noise = 0;
    let frequency = 1;
    let factor = 1;
  
    let persistance = 0.4;
    let roughness = 3;
  
    for (let i = 0; i < octaves; i++) {
      noise += perlin.noise(x * frequency + i * 0.72354, y * frequency + i * 0.72354) * factor;
      factor *= persistance;
      frequency *= roughness;
    }
  
    return noise;
  };

  if (e.data.getHeight) {
    // eslint-disable-next-line no-undef
    getHeight = JSONfn.parse(e.data.getHeight);
    return;
  }

  const createTerrainData = createTerrainDataNew;

  self.postMessage({
    messageType: MessageTypes.TERRAIN_DATA,
    id: e.data.id,
    data: createTerrainData({
      ...e.data,
      getHeight,
    })
  });

  // eslint-disable-next-line no-unused-vars
  function createTerrainDataOld({
    w = 20,
    h = 20,
    res = 5,
    noiseOffset = Vector.zero(),
    uvOffset = Vector.zero(),
    uvScale = 20,
    getHeight = () => 0
  }) {
    const uvs = [];
    const vertices = [];
    const triangles = [];
    const tangents = [];
  
    for (let i = 0; i < res; i++) {
      for (let j = 0; j < res; j++) {
        const x = mapValue(i, 0, res - 1, -w / 2, w / 2);
        const z = mapValue(j, 0, res - 1, -h / 2, h / 2);
  
        const vertex = {
          x: x,
          y: getHeight(x + noiseOffset.x, z + noiseOffset.y),
          z: z
        };
        vertices.push(vertex.x, vertex.y, vertex.z);
        uvs.push(i / (res - 1) * uvScale + uvOffset.x, j / (res - 1) * uvScale + uvOffset.y);
      }
    }
  
    const normals = new Array(vertices.length / 3);
    for (let i = 0; i < normals.length; i++) {
      normals[i] = [];
    }
  
    for (let i = 0; i < res - 1; i++) {
      for (let j = 0; j < res - 1; j++) {
        const ind = j + i * res;
        const indices = [
          ind,
          ind + 1,
          ind + res,
  
          ind + 1,
          ind + res + 1,
          ind + res
        ];
        triangles.push(...indices);
  
        const t1Normal = getTriangleNormal([Vector.fromArray(vertices, indices[0] * 3), Vector.fromArray(vertices, indices[1] * 3), Vector.fromArray(vertices, indices[2] * 3)]);
        const t2Normal = getTriangleNormal([Vector.fromArray(vertices, indices[3] * 3), Vector.fromArray(vertices, indices[4] * 3), Vector.fromArray(vertices, indices[5] * 3)]);
  
        normals[indices[0]].push(t1Normal);
        normals[indices[1]].push(t1Normal);
        normals[indices[2]].push(t1Normal);
        normals[indices[3]].push(t2Normal);
        normals[indices[4]].push(t2Normal);
        normals[indices[5]].push(t2Normal);
      }
    }
  
    const outNormals = [];
    for (let i = 0; i < normals.length; i++) {
      const normal = Vector.divide(normals[i].reduce((a, b) => {
        return Vector.add(a, b);
      }, Vector.zero()), normals[i].length);
  
      outNormals.push(normal.x, normal.y, normal.z);
  
      tangents.push(normal.y, normal.x, normal.z);
    }
  
    const meshData = {
      indices: {
        bufferData: new Uint32Array(triangles),
      },
      position: {
        bufferData: new Float32Array(vertices),
        size: 3
      },
      normal: {
        bufferData: new Float32Array(outNormals),
        size: 3
      },
      tangent: {
        bufferData: new Float32Array(tangents),
        size: 3
      },
      uv: {
        bufferData: new Float32Array(uvs),
        size: 2
      }
    };
    
    return meshData;
  }

  function createTerrainDataNew({
    neighborDepths,
    quadtreeDepth,
    w = 20,
    h = 20,
    res = 5,
    noiseOffset = Vector.zero(),
    uvOffset = Vector.zero(),
    uvScale = 20,
    getHeight = () => 0
  }) {
    var uvs = new Float32Array(res * res * 2);
    var vertices = new Float32Array(res * res * 3);
    var triangles = new Uint32Array((res - 1) * (res - 1) * 6);
    var tangents = new Float32Array(res * res * 3);

    var edgeVertexIndices = [[], [], [], []];

    var normals = new Array(res * res);
    for (let i = 0; i < normals.length; i++) {
      normals[i] = [];
    }

    var counter = 0;
    for (let i = 0; i < res; i++) {
      for (let j = 0; j < res; j++) {
        let x = mapValue(i, 0, res - 1, -w / 2, w / 2);
        let z = mapValue(j, 0, res - 1, -h / 2, h / 2);

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

    for (let i = 0; i < 4; i++) {
      let neighborDepth = neighborDepths[i];
      if (typeof neighborDepth !== "undefined" && quadtreeDepth > neighborDepth) {
        let stepsize = Math.pow(2, quadtreeDepth - neighborDepth);

        let currentHeight = getHeight(vertices[edgeVertexIndices[i][0] * 3 + 0] + noiseOffset.x, vertices[edgeVertexIndices[i][0] * 3 + 2] + noiseOffset.y);
        let nextHeight = getHeight(vertices[edgeVertexIndices[i][stepsize] * 3 + 0] + noiseOffset.x, vertices[edgeVertexIndices[i][stepsize] * 3 + 2] + noiseOffset.y);

        for (let j = 0; j < res; j++) {
          if (j % stepsize == 0 && j != 0) {
            currentHeight = nextHeight;
            // nextHeight = getHeight(vertices[edgeVertexIndices[i][j + stepsize] * 3 + 0] + noiseOffset.x, vertices[edgeVertexIndices[i][j + stepsize] * 3 + 2] + noiseOffset.y);
            nextHeight = getHeight(
              vertices[edgeVertexIndices[i][Math.min(j + stepsize, res - 1)] * 3 + 0] + noiseOffset.x,
              vertices[edgeVertexIndices[i][Math.min(j + stepsize, res - 1)] * 3 + 2] + noiseOffset.y
            );

            if (isNaN(nextHeight)) {
              console.log(
                "4",
                nextHeight,
                edgeVertexIndices[i],
                edgeVertexIndices[i].length,
                j + stepsize,
                edgeVertexIndices[i][j + stepsize],
                edgeVertexIndices[i][j + stepsize],
              );
            }

            vertices[edgeVertexIndices[i][j] * 3 + 1] = currentHeight;
          }
          else {
            const h = worker_lerp(currentHeight, nextHeight, (j % stepsize) / stepsize);
            vertices[edgeVertexIndices[i][j] * 3 + 1] = h;
          }
        }
      }
    }

    counter = 0;
    for (let i = 0; i < res - 1; i++) {
      for (let j = 0; j < res - 1; j++) {
        let ind = j + i * res;
        let indices = [
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

        let t1Normal = getTriangleNormal([Vector.fromArray(vertices, indices[0] * 3), Vector.fromArray(vertices, indices[1] * 3), Vector.fromArray(vertices, indices[2] * 3)]);
        let t2Normal = getTriangleNormal([Vector.fromArray(vertices, indices[3] * 3), Vector.fromArray(vertices, indices[4] * 3), Vector.fromArray(vertices, indices[5] * 3)]);

        normals[indices[0]].push(t1Normal);
        normals[indices[1]].push(t1Normal);
        normals[indices[2]].push(t1Normal);
        normals[indices[3]].push(t2Normal);
        normals[indices[4]].push(t2Normal);
        normals[indices[5]].push(t2Normal);

        // let x = mapValue(i, 0, res - 1, -w / 2, w / 2);
        // let z = mapValue(j, 0, res - 1, -h / 2, h / 2);
        // let dx = w / res / 2;
        // let dz = h / res / 2;

        // normals[indices[0]].push(getNormal(x, z));
        // normals[indices[1]].push(getNormal(x + dx, z));
        // normals[indices[2]].push(getNormal(x, z + dz));
        // normals[indices[4]].push(getNormal(x + dx, z + dz));

        counter++;
      }
    }

    for (let i = 0; i < 4; i++) {
      let neighborDepth = neighborDepths[i];
      if (typeof neighborDepth !== "undefined") {
        for (let j = 0; j < res; j++) {
          let vertex = Vector.fromArray(vertices, edgeVertexIndices[i][j] * 3);

          if (i == 1) {
            let step = new Vector(w / (res - 1), 0, h / (res - 1));
            let t1Normal = getTriangleNormal([
              vertex,
              new Vector(vertex.x, getHeight(vertex.x + noiseOffset.x, vertex.z - step.z + noiseOffset.y), vertex.z - step.z),
              new Vector(vertex.x - step.x, getHeight(vertex.x - step.x + noiseOffset.x, vertex.z + noiseOffset.y), vertex.z),
            ]);

            let t2Normal = getTriangleNormal([
              vertex,
              new Vector(vertex.x + step.x, getHeight(vertex.x + step.x + noiseOffset.x, vertex.z - step.z + noiseOffset.y), vertex.z - step.z),
              new Vector(vertex.x, getHeight(vertex.x + noiseOffset.x, vertex.z - step.z + noiseOffset.y), vertex.z - step.z),
            ]);

            let t3Normal = getTriangleNormal([
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
            let step = new Vector(w / (res - 1), 0, h / (res - 1));
            let t1Normal = getTriangleNormal([
              vertex,
              new Vector(vertex.x + step.x, getHeight(vertex.x + step.x + noiseOffset.x, vertex.z + noiseOffset.y), vertex.z),
              new Vector(vertex.x, getHeight(vertex.x + noiseOffset.x, vertex.z + step.z + noiseOffset.y), vertex.z + step.z),
            ]);

            let t2Normal = getTriangleNormal([
              vertex,
              new Vector(vertex.x, getHeight(vertex.x + noiseOffset.x, vertex.z + step.z + noiseOffset.y), vertex.z + step.z),
              new Vector(vertex.x - step.x, getHeight(vertex.x - step.x + noiseOffset.x, vertex.z + step.z + noiseOffset.y), vertex.z + step.z),
            ]);

            let t3Normal = getTriangleNormal([
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
            let step = new Vector(w / (res - 1), 0, h / (res - 1));
            let t1Normal = getTriangleNormal([
              vertex,
              new Vector(vertex.x - step.x, getHeight(vertex.x - step.x + noiseOffset.x, vertex.z + noiseOffset.y), vertex.z),
              new Vector(vertex.x, getHeight(vertex.x + noiseOffset.x, vertex.z - step.z + noiseOffset.y), vertex.z - step.z),
            ]);

            let t2Normal = getTriangleNormal([
              vertex,
              new Vector(vertex.x - step.x, getHeight(vertex.x - step.x + noiseOffset.x, vertex.z + step.z + noiseOffset.y), vertex.z + step.z),
              new Vector(vertex.x - step.x, getHeight(vertex.x - step.x + noiseOffset.x, vertex.z + noiseOffset.y), vertex.z),
            ]);

            let t3Normal = getTriangleNormal([
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
            let step = new Vector(w / (res - 1), 0, h / (res - 1));
            let t1Normal = getTriangleNormal([
              vertex,
              new Vector(vertex.x + step.x, getHeight(vertex.x + step.x + noiseOffset.x, vertex.z + noiseOffset.y), vertex.z),
              new Vector(vertex.x, getHeight(vertex.x + noiseOffset.x, vertex.z + step.z + noiseOffset.y), vertex.z + step.z),
            ]);

            let t2Normal = getTriangleNormal([
              vertex,
              new Vector(vertex.x + step.x, getHeight(vertex.x + step.x + noiseOffset.x, vertex.z - step.z + noiseOffset.y), vertex.z - step.z),
              new Vector(vertex.x + step.x, getHeight(vertex.x + step.x + noiseOffset.x, vertex.z + noiseOffset.y), vertex.z),
            ]);

            let t3Normal = getTriangleNormal([
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

    let outNormals = new Float32Array(res * res * 3);
    for (let i = 0; i < normals.length; i++) {
      let normal = Vector.divide(normals[i].reduce((a, b) => {
        return Vector.add(a, b);
      }, Vector.zero()), normals[i].length);

      outNormals[i * 3 + 0] = normal.x;
      outNormals[i * 3 + 1] = normal.y;
      outNormals[i * 3 + 2] = normal.z;

      tangents[i * 3 + 0] = normal.y;
      tangents[i * 3 + 1] = normal.x;
      tangents[i * 3 + 2] = normal.z;
    }

    let meshData = {
      indices: {
        bufferData: triangles,
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

    // console.log(meshData.position.bufferData);
    
    return meshData;
  }
};

function mapValue(x, in_min, in_max, out_min, out_max) {
  return (x - in_min) * (out_max - out_min) / (in_max - in_min) + out_min;
}

function Perlin() {
  this.p = [151,160,137,91,90,15,131,13,201,95,96,53,194,233,7,225,140,36,103,30,69,142,8,99,37,240,21,10,23,190, 6,148,247,120,234,75,0,26,197,62,94,252,219,203,117,35,11,32,57,177,33,88,237,149,56,87,174,20,125,136,171,168, 68,175,74,165,71,134,139,48,27,166,77,146,158,231,83,111,229,122,60,211,133,230,220,105,92,41,55,46,245,40,244,102,143,54,65,25,63,161,1,216,80,73,209,76,132,187,208,89,18,169,200,196,135,130,116,188,159,86,164,100,109,198,173,186,3,64,52,217,226,250,124,123,5,202,38,147,118,126,255,82,85,212,207,206,59,227,47,16,58,17,182,189,28,42,223,183,170,213,119,248,152,2,44,154,163,70,221,153,101,155,167,43,172,9,129,22,39,253,19,98,108,110,79,113,224,232,178,185,112,104,218,246,97,228,251,34,242,193,238,210,144,12,191,179,162,241,81,51,145,235,249,14,239,107,49,192,214,31,181,199,106,157,184,84,204,176,115,121,50,45,127,4,150,254,138,236,205,93,222,114,67,29,24,72,243,141,128,195,78,66,215,61,156,180,151,160,137,91,90,15,131,13,201,95,96,53,194,233,7,225,140,36,103,30,69,142,8,99,37,240,21,10,23,190, 6,148,247,120,234,75,0,26,197,62,94,252,219,203,117,35,11,32,57,177,33,88,237,149,56,87,174,20,125,136,171,168, 68,175,74,165,71,134,139,48,27,166,77,146,158,231,83,111,229,122,60,211,133,230,220,105,92,41,55,46,245,40,244,102,143,54,65,25,63,161,1,216,80,73,209,76,132,187,208,89,18,169,200,196,135,130,116,188,159,86,164,100,109,198,173,186,3,64,52,217,226,250,124,123,5,202,38,147,118,126,255,82,85,212,207,206,59,227,47,16,58,17,182,189,28,42,223,183,170,213,119,248,152,2,44,154,163,70,221,153,101,155,167,43,172,9,129,22,39,253,19,98,108,110,79,113,224,232,178,185,112,104,218,246,97,228,251,34,242,193,238,210,144,12,191,179,162,241,81,51,145,235,249,14,239,107,49,192,214,31,181,199,106,157,184,84,204,176,115,121,50,45,127,4,150,254,138,236,205,93,222,114,67,29,24,72,243,141,128,195,78,66,215,61,156,180];
  
  this.noise = function(x = 0, y = 0, z = 0) {
    let xi = Math.floor(x) & 255;
    let yi = Math.floor(y) & 255;
    let zi = Math.floor(z) & 255;
    let xf = x - Math.floor(x);
    let yf = y - Math.floor(y);
    let zf = z - Math.floor(z);
    
    let u = this.fade(xf);
    let v = this.fade(yf);
    let w = this.fade(zf);
    
    let aaa, aba, aab, abb, baa, bba, bab, bbb;
    aaa = this.p[this.p[this.p[xi    ] + yi    ] + zi    ];
    aba = this.p[this.p[this.p[xi    ] + yi + 1] + zi    ];
    aab = this.p[this.p[this.p[xi    ] + yi    ] + zi + 1];
    abb = this.p[this.p[this.p[xi    ] + yi    ] + zi + 1];
    baa = this.p[this.p[this.p[xi + 1] + yi    ] + zi    ];
    bba = this.p[this.p[this.p[xi + 1] + yi + 1] + zi    ];
    bab = this.p[this.p[this.p[xi + 1] + yi    ] + zi + 1];
    bbb = this.p[this.p[this.p[xi + 1] + yi + 1] + zi + 1];
    
    let x1, x2, y1, y2;
    x1 = this.lerp(
      this.grad(aaa, xf    , yf, zf),
      this.grad(baa, xf - 1, yf, zf),
      u
    );
    x2 = this.lerp(
      this.grad(aba, xf    , yf - 1, zf),
      this.grad(bba, xf - 1, yf - 1, zf),
      u
    );
    y1 = this.lerp(x1, x2, v);

    x1 = this.lerp(
      this.grad(aab, xf    , yf, zf - 1),
      this.grad(bab, xf - 1, yf, zf - 1),
      u
    );
    x2 = this.lerp(
      this.grad(abb, xf    , yf - 1, zf - 1),
      this.grad(bbb, xf - 1, yf - 1, zf - 1),
      u
    );
    y2 = this.lerp(x1, x2, v);
    
    return this.lerp(y1, y2, w);
  };
  
  this.fade = function(t) {
    return t * t * t * (t * (t * 6 - 15) + 10);
  };
  
  this.grad = function(hash, x, y, z) {
    let h = hash & 15;
    let u = h < 8 ? x : y;
		
    let v = h < 4 ? y : (h == 12 || h == 14) ? x : z;
		
    return ((h & 1) == 0 ? u : -u) + ((h & 2) == 0 ? v : -v);
  };
  
  this.lerp = function(a, b, x) {
    return a + x * (b - a);
  };
}

class Vector {
  constructor(x = 0, y = 0, z = 0) {
    return {x, y, z};
  }

  static zero() {
    return {x: 0, y: 0, z: 0};
  }

  static one() {
    return {x: 1, y: 1, z: 1};
  }

  static up() {
    return {x: 0, y: 1, z: 0};
  }

  static down() {
    return {x: 0, y: -1, z: 0};
  }

  static fill(value = 0) {
    return {
      x: value,
      y: value,
      z: value
    };
  }

  static set(to, from) {
    to.x = from.x;
    to.y = from.y;
    to.z = from.z;
  }

  static copy(v) {
    return {x: v.x, y: v.y, z: v.z};
  }

  static fromArray(a, offset = 0, inc = 1) {
    return {
      x: a[offset] ?? 0,
      y: a[offset + inc] ?? 0,
      z: a[offset + inc * 2] ?? 0,
      w: a[offset + inc * 3] ?? 0
    };
  }

  static toArray(v) {
    return [v.x, v.y, v.z];
  }

  static equal(a, b, epsilon = 1e-6) {
    return Math.abs(a.x - b.x) < epsilon &&
           Math.abs(a.y - b.y) < epsilon &&
           Math.abs(a.z - b.z) < epsilon;
  }

  static isVectorIsh(v) {
    return typeof v == "object" && ("x" in v || "y" in v || "z" in v);
  }

  static add(a, b) {
    return {
      x: a.x + b.x,
      y: a.y + b.y,
      z: a.z + b.z
    };
  }

  static addTo(dst, v) {
    dst.x += v.x;
    dst.y += v.y;
    dst.z += v.z;
    return dst;
  }

  static subtract(a, b) {
    return {
      x: a.x - b.x,
      y: a.y - b.y,
      z: a.z - b.z
    };
  }

  static subtractTo(dst, v) {
    dst.x -= v.x;
    dst.y -= v.y;
    dst.z -= v.z;
    return dst;
  }

  static multiply(v, scalar) {
    return {
      x: v.x * scalar,
      y: v.y * scalar,
      z: v.z * scalar
    };
  }

  static multiplyTo(dst, scalar) {
    dst.x *= scalar;
    dst.y *= scalar;
    dst.z *= scalar;
    return dst;
  }

  static negate(v) {
    return Vector.multiply(v, -1);
  }

  static compMultiply(a, b) {
    return {
      x: a.x * b.x,
      y: a.y * b.y,
      z: a.z * b.z
    };
  }

  static compMultiplyTo(dst, v) {
    dst.x *= v.x;
    dst.y *= v.y;
    dst.z *= v.z;
    return dst;
  }

  static divide(v, scalar) {
    return {
      x: v.x / scalar,
      y: v.y / scalar,
      z: v.z / scalar
    };
  }

  static divideTo(dst, scalar) {
    dst.x /= scalar;
    dst.y /= scalar;
    dst.z /= scalar;
    return dst;
  }

  static compDivide(a, b) {
    return {
      x: a.x / b.x,
      y: a.y / b.y,
      z: a.z / b.z
    };
  }

  static compDivideTo(dst, v) {
    dst.x /= v.x;
    dst.y /= v.y;
    dst.z /= v.z;
    return dst;
  }

  static average(a, b) {
    return Vector.divide(Vector.add(a, b), 2);
  }

  static applyFunc(v, func) {
    return {
      x: func(v.x),
      y: func(v.y),
      z: func(v.z)
    };
  }

  static compFunc(a, b, func) {
    return {
      x: func(a.x, b.x),
      y: func(a.y, b.y),
      z: func(a.z, b.z)
    };
  }

  static rotate2D(v, angle) {
    return {
      x: v.x * Math.cos(angle) - v.y * Math.sin(angle),
      y: v.x * Math.sin(angle) + v.y * Math.cos(angle)
    };
  }

  static rotateAround(v, axis, angle) {
    const aIIb = Vector.multiply(axis, Vector.dot(v, axis) / Vector.dot(axis, axis));
    const aTb = Vector.subtract(v, aIIb);
    const w = Vector.cross(axis, aTb);
    const x1 = Math.cos(angle) / Vector.length(aTb);
    const x2 = Math.sin(angle) / Vector.length(w);
    const aTb0 = Vector.multiply(Vector.add(Vector.multiply(aTb, x1), Vector.multiply(w, x2)), Vector.length(aTb));
    const ab0 = Vector.add(aTb0, aIIb);

    return ab0;
  }

  static project(v, normal) {
    return Vector.multiply(normal, Vector.dot(normal, v));
  }

  static projectOnPlane(v, normal) {
    const distToPlane = Vector.dot(normal, v);
    return Vector.subtract(v, Vector.multiply(normal, distToPlane));
  }

  static findOrthogonal(v) {
    if (Math.abs(v.x) >= 1 / Math.sqrt(3))
      return Vector.normalize(new Vector(v.y, -v.x, 0));
    else
      return Vector.normalize(new Vector(0, v.z, -v.y));
  }

  static formOrthogonalBasis(v) {
    const a = Vector.findOrthogonal(v);
    return [
      a,
      Vector.cross(a, v)
    ];
  }

  static length(v) {
    let sum = v.x * v.x + v.y * v.y;
    if (v.z) sum += v.z * v.z;
    return Math.sqrt(sum);
  }

  static lengthSqr(v) {
    let sum = v.x * v.x + v.y * v.y;
    if (v.z) sum += v.z * v.z;
    return sum;
  }

  static distance(a, b) {
    return Vector.length(Vector.subtract(a, b));
  }

  static distanceSqr(a, b) {
    return Vector.lengthSqr(Vector.subtract(a, b));
  }

  static normalize(v) {
    const len = Vector.length(v);
    if (len < 1e-6)
      return Vector.copy(v);
    else
      return Vector.divide(v, len);
  }
  
  static dot(a, b) {
    let sum = a.x * b.x + a.y * b.y;
    if (a.z && b.z) sum += a.z * b.z;
    return sum;
  }

  static cross(a, b) {
    return {
      x: a.y * b.z - a.z * b.y,
      y: a.z * b.x - a.x * b.z,
      z: a.x * b.y - a.y * b.x
    };
  }
}

function worker_lerp(x, y, a) {
  return x * (1 - a) + y * a;
}

function getTriangleNormal(triangle) {
  return Vector.normalize(Vector.cross(Vector.subtract(triangle[1], triangle[0]), Vector.subtract(triangle[2], triangle[0])));
}