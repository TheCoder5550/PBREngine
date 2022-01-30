// if (typeof module != "undefined") {
//   Vector = require("./vector.js");
// }

import Quaternion from "./quaternion.mjs";
import Vector from "./vector.mjs";
import { lerp } from "./helper.mjs";

function _fillFloat32Array(array, a, b, c, d, e, f, g, h, i, j, k, l, m, n, o, p) {
  array[0] = a;
  array[1] = b;
  array[2] = c;
  array[3] = d;
  array[4] = e;
  array[5] = f;
  array[6] = g;
  array[7] = h;
  array[8] = i;
  array[9] = j;
  array[10] = k;
  array[11] = l;
  array[12] = m;
  array[13] = n;
  array[14] = o;
  array[15] = p;

  return array;
}

export default class Matrix {
  /*


  // Translation matrix

  [ 1 0 0 tx ]
  [ 0 1 0 ty ]
  [ 0 0 1 tz ]
  [ 0 0 0  1 ]

  var mat = [
    1,  0,  0,  0,   // this is column 0
    0,  1,  0,  0,   // this is column 1
    0,  0,  1,  0,   // this is column 2
   tx, ty, tz,  1,   // this is column 3
  ];

 */

  // static constIdentity = Matrix.identity();

  static identity(dst) {
    dst = dst || new Float32Array(16);
    _fillFloat32Array(dst,
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1
    );

    return dst;
  }

  static copy(m, dst) {
    dst = dst || new Float32Array(16);
    _fillFloat32Array(dst,
      m[0], m[1], m[2], m[3],
      m[4], m[5], m[6], m[7],
      m[8], m[9], m[10], m[11],
      m[12], m[13], m[14], m[15]
    );

    return dst;
  }

  static lerp(a, b, t, dst) {
    dst = dst || new Float32Array(16);
    _fillFloat32Array(dst,
      lerp(a[0], b[0], t),
      lerp(a[1], b[1], t),
      lerp(a[2], b[2], t),
      lerp(a[3], b[3], t),
      lerp(a[4], b[4], t),
      lerp(a[5], b[5], t),
      lerp(a[6], b[6], t),
      lerp(a[7], b[7], t),
      lerp(a[8], b[8], t),
      lerp(a[9], b[9], t),
      lerp(a[10], b[10], t),
      lerp(a[11], b[11], t),
      lerp(a[12], b[12], t),
      lerp(a[13], b[13], t),
      lerp(a[14], b[14], t),
      lerp(a[15], b[15], t)
    );

    return dst;
  }

  static transpose(m, dst) {
    dst = dst || new Float32Array(16);

    _fillFloat32Array(dst,
      m[0], m[4], m[8], m[12],
      m[1], m[5], m[9], m[13],
      m[2], m[6], m[10], m[14],
      m[3], m[7], m[11], m[15]
    );

    return dst;
  }

  static inverse(m, dst) {
    dst = dst || new Float32Array(16);

    _fillFloat32Array(dst,
      m[5]*m[10]*m[15] - m[5]*m[11]*m[14] - m[9]*m[6]*m[15] + m[9]*m[7]*m[14] + m[13]*m[6]*m[11] - m[13]*m[7]*m[10],
      -m[1]*m[10]*m[15] + m[1]*m[11]*m[14] + m[9]*m[2]*m[15] - m[9]*m[3]*m[14] - m[13]*m[2]*m[11] + m[13]*m[3]*m[10],
        m[1]*m[6]*m[15]  - m[1]*m[7]*m[14]  - m[5]*m[2]*m[15] + m[5]*m[3]*m[14] + m[13]*m[2]*m[7]  - m[13]*m[3]*m[6],
      -m[1]*m[6]*m[11]  + m[1]*m[7]*m[10]  + m[5]*m[2]*m[11] - m[5]*m[3]*m[10] - m[9]*m[2]*m[7]   + m[9]*m[3]*m[6],
      -m[4]*m[10]*m[15] + m[4]*m[11]*m[14] + m[8]*m[6]*m[15] - m[8]*m[7]*m[14] - m[12]*m[6]*m[11] + m[12]*m[7]*m[10],
        m[0]*m[10]*m[15] - m[0]*m[11]*m[14] - m[8]*m[2]*m[15] + m[8]*m[3]*m[14] + m[12]*m[2]*m[11] - m[12]*m[3]*m[10],
      -m[0]*m[6]*m[15]  + m[0]*m[7]*m[14]  + m[4]*m[2]*m[15] - m[4]*m[3]*m[14] - m[12]*m[2]*m[7]  + m[12]*m[3]*m[6],
        m[0]*m[6]*m[11]  - m[0]*m[7]*m[10]  - m[4]*m[2]*m[11] + m[4]*m[3]*m[10] + m[8]*m[2]*m[7]   - m[8]*m[3]*m[6],
        m[4]*m[9]*m[15]  - m[4]*m[11]*m[13] - m[8]*m[5]*m[15] + m[8]*m[7]*m[13] + m[12]*m[5]*m[11] - m[12]*m[7]*m[9],
      -m[0]*m[9]*m[15]  + m[0]*m[11]*m[13] + m[8]*m[1]*m[15] - m[8]*m[3]*m[13] - m[12]*m[1]*m[11] + m[12]*m[3]*m[9],
        m[0]*m[5]*m[15]  - m[0]*m[7]*m[13]  - m[4]*m[1]*m[15] + m[4]*m[3]*m[13] + m[12]*m[1]*m[7]  - m[12]*m[3]*m[5],
      -m[0]*m[5]*m[11]  + m[0]*m[7]*m[9]   + m[4]*m[1]*m[11] - m[4]*m[3]*m[9]  - m[8]*m[1]*m[7]   + m[8]*m[3]*m[5],
      -m[4]*m[9]*m[14]  + m[4]*m[10]*m[13] + m[8]*m[5]*m[14] - m[8]*m[6]*m[13] - m[12]*m[5]*m[10] + m[12]*m[6]*m[9],
        m[0]*m[9]*m[14]  - m[0]*m[10]*m[13] - m[8]*m[1]*m[14] + m[8]*m[2]*m[13] + m[12]*m[1]*m[10] - m[12]*m[2]*m[9],
      -m[0]*m[5]*m[14]  + m[0]*m[6]*m[13]  + m[4]*m[1]*m[14] - m[4]*m[2]*m[13] - m[12]*m[1]*m[6]  + m[12]*m[2]*m[5],
        m[0]*m[5]*m[10]  - m[0]*m[6]*m[9]   - m[4]*m[1]*m[10] + m[4]*m[2]*m[9]  + m[8]*m[1]*m[6]   - m[8]*m[2]*m[5]
    );

    var det = m[0] * dst[0] + m[1] * dst[4] + m[2] * dst[8] + m[3] * dst[12];
    if (!det) return m;
    det = 1 / det;
    for (var i = 0; i < 16; i++) {
      dst[i] *= det;
    }
    return dst;
  }

  static multiply(a, b, dst) {
    // bruh
    var dst2 = new Float32Array(16);

    for (var i = 0; i < 4; i++) {
      var ai0 = a[i];
      var ai1 = a[i+4];
      var ai2 = a[i+8];
      var ai3 = a[i+12];
      dst2[i]    = ai0 * b[0]  + ai1 * b[1]  + ai2 * b[2]  + ai3 * b[3];
      dst2[i+4]  = ai0 * b[4]  + ai1 * b[5]  + ai2 * b[6]  + ai3 * b[7];
      dst2[i+8]  = ai0 * b[8]  + ai1 * b[9]  + ai2 * b[10] + ai3 * b[11];
      dst2[i+12] = ai0 * b[12] + ai1 * b[13] + ai2 * b[14] + ai3 * b[15];
    }

    if (dst)
    Matrix.copy(dst2, dst); // bruh

    return dst2;
  }

  static basis(right, up, back, dst) {
    dst = dst || new Float32Array(16);
    _fillFloat32Array(dst,
      right.x, right.y, right.z, 0,
      up.x, up.y, up.z, 0,
      back.x, back.y, back.z, 0,
      0, 0, 0, 1
    );

    return dst;
  }

  // Directions

  static getForward(m) {
    return {x: -m[8], y: -m[9], z: -m[10]};
  }
  static getRight(m) {
    return {x: m[0], y: m[1], z: m[2]};
  }
  static getUp(m) {
    return {x: m[4], y: m[5], z: m[6]};
  }

  static forward(m) {
    return Matrix.getForward(m);
  }
  static right(m) {
    return Matrix.getRight(m);
  }
  static up(m) {
    return Matrix.getUp(m);
  }

  // Translation

  static translate(t = {x: 0, y: 0, z: 0}, dst) {
    dst = dst || new Float32Array(16);
    _fillFloat32Array(dst,
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      t.x, t.y, t.z, 1
    );

    return dst;
  }

  static getTranslationMatrix(m, dst) {
    return Matrix.translate(Matrix.getPosition(m), dst);
  }

  static getPosition(m) {
    return {x: m[12], y: m[13], z: m[14]};
  }

  static setPosition(m, pos) {
    m[12] = pos.x;
    m[13] = pos.y;
    m[14] = pos.z;
  }

  static removeTranslation(dst) {
    dst[12] = 0;
    dst[13] = 0;
    dst[14] = 0;
    return dst;
  }

  // Rotation

  static setRotation(m, rotMat) {
    var sy = Vector.length({x: m[4], y: m[5], z: m[6]});
    var sx = Vector.length({x: m[0], y: m[1], z: m[2]});
    var sz = Vector.length({x: m[8], y: m[9], z: m[10]});
    
    m[0] = rotMat[0] * sx;
    m[1] = rotMat[1] * sx;
    m[2] = rotMat[2] * sx;

    m[4] = rotMat[4] * sy;
    m[5] = rotMat[5] * sy;
    m[6] = rotMat[6] * sy;

    m[8] = rotMat[8] * sz;
    m[9] = rotMat[9] * sz;
    m[10] = rotMat[10] * sz;
  }

  static getRotationMatrix(m, dst) {
    dst = dst || new Float32Array(16);

    var sx = Vector.length({x: m[0], y: m[1], z: m[2]});
    var sy = Vector.length({x: m[4], y: m[5], z: m[6]});
    var sz = Vector.length({x: m[8], y: m[9], z: m[10]});

    _fillFloat32Array(dst,
      m[0] / sx, m[1] / sx, m[2] / sx, 0,
      m[4] / sy, m[5] / sy, m[6] / sy, 0,
      m[8] / sz, m[9] / sz, m[10] / sz, 0,
      0, 0, 0, 1
    );

    return dst;
  }

  static rotateX(m, angle, dst) {
    var rotMat = new Float32Array([1, 0, 0, 0, 0, Math.cos(angle), Math.sin(angle), 0, 0, -Math.sin(angle), Math.cos(angle), 0, 0, 0, 0, 1]);
    return Matrix.multiply(m, rotMat, dst);
  }

  static rotateY(m, angle, dst) {
    var rotMat = new Float32Array([Math.cos(angle), 0, -Math.sin(angle), 0, 0, 1, 0, 0, Math.sin(angle), 0, Math.cos(angle), 0, 0, 0, 0, 1]);
    return Matrix.multiply(m, rotMat, dst);
  }

  static rotateZ(m, angle, dst) {
    var rotMat = new Float32Array([Math.cos(angle), Math.sin(angle), 0, 0, -Math.sin(angle), Math.cos(angle), 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    return Matrix.multiply(m, rotMat, dst);
  }
  
  // Scale

  static scale(scale = {x: 1, y: 1, z: 1}, dst) {
    dst = dst || new Float32Array(16);
    _fillFloat32Array(dst,
      scale.x, 0, 0, 0,
      0, scale.y, 0, 0,
      0, 0, scale.z, 0,
      0, 0, 0, 1
    );

    return dst;
  }

  static setScale(m, scale) {
    var sx = Vector.length({x: m[0], y: m[1], z: m[2]}) / scale.x;
    var sy = Vector.length({x: m[4], y: m[5], z: m[6]}) / scale.y;
    var sz = Vector.length({x: m[8], y: m[9], z: m[10]}) / scale.z;
    
    m[0] /= sx;
    m[1] /= sx;
    m[2] /= sx;

    m[4] /= sy;
    m[5] /= sy;
    m[6] /= sy;

    m[8] /= sz;
    m[9] /= sz;
    m[10] /= sz;
  }

  static getScale(m) {
    var sx = Vector.length({x: m[0], y: m[1], z: m[2]});
    var sy = Vector.length({x: m[4], y: m[5], z: m[6]});
    var sz = Vector.length({x: m[8], y: m[9], z: m[10]});

    return {x: sx, y: sy, z: sz};
  }

  static getScaleMatrix(m, dst) {
    dst = dst || new Float32Array(16);

    var scale = Matrix.getScale(m);
    return Matrix.scale(scale, dst);
  }

  // Transform

  static transform(options = [], dst) {
    dst = dst || Matrix.identity();

    for (var i = 0; i < options.length; i++) {
      var option = options[i];
      switch (option[0]) {
        case "translate":
          var x = option[1].x || 0;
          var y = option[1].y || 0;
          var z = option[1].z || 0;

          dst[12] += dst[0] * x + dst[4] * y + dst[8]  * z;
          dst[13] += dst[1] * x + dst[5] * y + dst[9]  * z;
          dst[14] += dst[2] * x + dst[6] * y + dst[10] * z;
          dst[15] += dst[3] * x + dst[7] * y + dst[11] * z;
          break;
        case "rx":
          var rx = option[1];
          dst.set(Matrix.multiply(dst, new Float32Array([1, 0, 0, 0, 0, Math.cos(rx), Math.sin(rx), 0, 0, -Math.sin(rx), Math.cos(rx), 0, 0, 0, 0, 1])));
          break;
        case "ry":
          var ry = option[1];
          dst.set(Matrix.multiply(dst, new Float32Array([Math.cos(ry), 0, -Math.sin(ry), 0, 0, 1, 0, 0, Math.sin(ry), 0, Math.cos(ry), 0, 0, 0, 0, 1]))); 
          break;
        case "rz":
          var rz = option[1];
          dst.set(Matrix.multiply(dst, new Float32Array([Math.cos(rz), Math.sin(rz), 0, 0, -Math.sin(rz), Math.cos(rz), 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])));
          break;
        case "sx":
          var sx = option[1];
          dst[0] *= sx;  
          dst[1] *= sx;
          dst[2] *= sx;
          dst[3] *= sx;
          break;
        case "sy":
          var sy = option[1];
          dst[4] *= sy;
          dst[5] *= sy;
          dst[6] *= sy;
          dst[7] *= sy;
          break;
        case "sz":
          var sz = option[1];
          dst[8] *= sz;
          dst[9] *= sz;
          dst[10] *= sz;
          dst[11] *= sz;
          break;
        case "scale":
          var sx = option[1].x ?? 1;
          var sy = option[1].y ?? 1;
          var sz = option[1].z ?? 1;

          dst[0] *= sx;  
          dst[1] *= sx;
          dst[2] *= sx;
          dst[3] *= sx;

          dst[4] *= sy;
          dst[5] *= sy;
          dst[6] *= sy;
          dst[7] *= sy;
          
          dst[8] *= sz;
          dst[9] *= sz;
          dst[10] *= sz;
          dst[11] *= sz;

          break;
      }
    }
    
    return dst;
  }

  static lookAt(cameraPosition, target, up = Vector.up(), dst) {
    dst = dst || new Float32Array(16);

    var zAxis = Vector.normalize(Vector.subtract(cameraPosition, target));
    var xAxis = Vector.normalize(Vector.cross(up, zAxis));
    var yAxis = Vector.normalize(Vector.cross(zAxis, xAxis));

    _fillFloat32Array(dst,
      xAxis.x, xAxis.y, xAxis.z, 0,
      yAxis.x, yAxis.y, yAxis.z, 0,
      zAxis.x, zAxis.y, zAxis.z, 0,
      cameraPosition.x, cameraPosition.y, cameraPosition.z, 1
    );

    return dst;
  }

  // Projection

  static perspective(options = {}, dst) {
    dst = dst || new Float32Array(16);

    var fovy = options.fov || 1.5;
    var aspect = options.aspect || 1;
    var near = options.near || 0.1;
    var far = options.far || 100;

    var s = Math.sin(fovy);
    var rd = 1 / (far - near);
    var ct = Math.cos(fovy) / s;

    _fillFloat32Array(dst,
      ct / aspect, 0,  0,                    0, 
      0,           ct, 0,                    0, 
      0,           0,  -(far + near) * rd,   -1,
      0,           0,  -2 * near * far * rd, 0
    );
    
    return dst;
  }

  static setPerspectiveFov(m, aspect, fov) {
    var ct = Math.cos(fov) / Math.sin(fov);
    m[0] = ct / aspect;
    m[5] = ct;
  }

  static orthographic(options = {}, dst) {
    dst = dst || new Float32Array(16);

    var top = options.top || options.size || 5;
    var bottom = options.bottom || -options.size || -5;
    var left = options.left || -options.size || 5;
    var right = options.right || options.size || -5;
    var far = options.far || 100;
    var near = options.near || 1;

    _fillFloat32Array(dst,
      2 / (right - left), 0, 0, 0,
      0, 2 / (top - bottom), 0, 0,
      0, 0, -2 / (far - near), 0,
      -(right + left) / (right - left), -(top + bottom) / (top - bottom), -(far + near) / (far - near), 1
    );

    return dst;
  }

  // Vector

  static transformVector(m, v) {
    var output = [];
    for (var i = 0; i < 4; i++) {
      output[i] = m[i] * v.x + m[i + 4] * v.y + m[i + 8] * v.z + m[i + 12];
    }
    return {x: output[0], y: output[1], z: output[2]};
  }

  // Quaternion

  static fromQuaternion(q, dst) {
    dst = dst || new Float32Array(16);

    q = Quaternion.normalize(q);
    _fillFloat32Array(dst,
      1 - 2*q.y*q.y - 2*q.z*q.z, 2*q.x*q.y - 2*q.z*q.w, 2*q.x*q.z + 2*q.y*q.w, 0,
      2*q.x*q.y + 2*q.z*q.w, 1 - 2*q.x*q.x - 2*q.z*q.z, 2*q.y*q.z - 2*q.x*q.w, 0,
      2*q.x*q.z - 2*q.y*q.w, 2*q.y*q.z + 2*q.x*q.w, 1 - 2*q.x*q.x - 2*q.y*q.y, 0,
      0, 0, 0, 1
    );
    Matrix.transpose(dst, dst);

    return dst;
  }

  //

  static get(m, row, column) {
    return m[row + column * 4];
  }

  static isMatrix(m) {
    return m instanceof Float32Array && m.length == 16;
  }

  static pprint(m) {
    m = Matrix.transpose(m);
    console.table([
      [...m.slice(0, 4)],
      [...m.slice(4, 8)],
      [...m.slice(8, 12)],
      [...m.slice(12, 16)]
    ]);
  }
}






// class Matrix {
//   static pprint(m) {
//     m = Matrix.transpose(m);
//     console.table([
//       [...m.slice(0, 4)],
//       [...m.slice(4, 8)],
//       [...m.slice(8, 12)],
//       [...m.slice(12, 16)]
//     ]);
//   }

//   static isMatrix(m) {
//     return m != undefined && m.constructor === Float32Array && m.length == 16;
//   }

//   static identity() {
//     return new Float32Array([
//       1, 0, 0, 0,
//       0, 1, 0, 0,
//       0, 0, 1, 0,
//       0, 0, 0, 1
//     ]);
//   }

//   static copy(m) {
//     return new Float32Array([
//       m[0], m[1], m[2], m[3],
//       m[4], m[5], m[6], m[7],
//       m[8], m[9], m[10], m[11],
//       m[12], m[13], m[14], m[15]
//     ]);
//   }

//   static set(dst, m) {
//     for (var i = 0; i < 16; i++) {
//       dst[i] = m[i];
//     }
//     return dst;
//   }

//   static transpose(m) {
//     return new Float32Array([
//       m[0], m[4], m[8], m[12],
//       m[1], m[5], m[9], m[13],
//       m[2], m[6], m[10], m[14],
//       m[3], m[7], m[11], m[15]
//     ]);
//   }

//   static multiply(a, b) {
//     var c = new Float32Array(16);
//     for (var i = 0; i < 4; i++) {
//       var ai0 = a[i];
//       var ai1 = a[i+4];
//       var ai2 = a[i+8];
//       var ai3 = a[i+12];
//       c[i]    = ai0 * b[0]  + ai1 * b[1]  + ai2 * b[2]  + ai3 * b[3];
//       c[i+4]  = ai0 * b[4]  + ai1 * b[5]  + ai2 * b[6]  + ai3 * b[7];
//       c[i+8]  = ai0 * b[8]  + ai1 * b[9]  + ai2 * b[10] + ai3 * b[11];
//       c[i+12] = ai0 * b[12] + ai1 * b[13] + ai2 * b[14] + ai3 * b[15];
//     }
//     return c;
//   }

//   static transformVector(m, v) {
//     return Matrix.matrixToVector(Matrix.multiplyMat4Vec(Matrix.transpose(m), Matrix.vectorToMatrix(v)));
//   }

//   static transformVector(m, v) {
//     var output = [];
//     for (var i = 0; i < 4; i++) {
//       output[i] = m[i] * v.x + m[i + 4] * v.y + m[i + 8] * v.z + m[i + 12];
//     }
//     return {x: output[0], y: output[1], z: output[2]};
//   }

//   static multiplyMat4Vec(m, v) {
//     var output = new Float32Array(4);
//     for (var i = 0; i < 4; i++) {
//       output[i] = m[i * 4] * v[0] + m[i * 4 + 1] * v[1] + m[i * 4 + 2] * v[2] + m[i * 4 + 3] * v[3];
//     }
//     return output;
//   }

//   static vectorToMatrix(v) {
//     return new Float32Array([v.x, v.y, v.z, v.w ?? 1]);
//   }

//   static matrixToVector(m) {
//     return {x: m[0], y: m[1], z: m[2], w: m[3]};
//   }

//   static perspective(options = {}) {
//     var fovy = options.fov || 1.5;
//     var aspect = options.aspect || 1;
//     var near = options.near || 0.1;
//     var far = options.far || 100;

//     var s = Math.sin(fovy);
//     var rd = 1 / (far - near);
//     var ct = Math.cos(fovy) / s;

//     return new Float32Array([
//       ct / aspect, 0,  0,                    0, 
//       0,           ct, 0,                    0, 
//       0,           0,  -(far + near) * rd,   -1,
//       0,           0,  -2 * near * far * rd, 0
//     ]);
//   }

//   static setPerspectiveFov(m, aspect, fov) {
//     var ct = Math.cos(fov) / Math.sin(fov);
//     m[0] = ct / aspect;
//     m[5] = ct;
//   }

//   static orthographic(options = {}) {
//     var top = options.top || options.size || 5;
//     var bottom = options.bottom || -options.size || -5;
//     var left = options.left || -options.size || 5;
//     var right = options.right || options.size || -5;
//     var far = options.far || 100;
//     var near = options.near || 1;

//     return new Float32Array([
//       2 / (right - left), 0, 0, 0,
//       0, 2 / (top - bottom), 0, 0,
//       0, 0, -2 / (far - near), 0,
//       -(right + left) / (right - left), -(top + bottom) / (top - bottom), -(far + near) / (far - near), 1
//     ]);
//   }

//   static lookAt(cameraPosition, target, up = Vector.up(), dst) {
//     dst = dst ?? Matrix.identity();

//     var zAxis = Vector.normalize(Vector.subtract(cameraPosition, target));
//     var xAxis = Vector.normalize(Vector.cross(up, zAxis));
//     var yAxis = Vector.normalize(Vector.cross(zAxis, xAxis));

//     dst[0] = xAxis.x;
//     dst[1] = xAxis.y;
//     dst[2] = xAxis.z;
//     dst[3] = 0;
//     dst[4] = yAxis.x;
//     dst[5] = yAxis.y;
//     dst[6] = yAxis.z;
//     dst[7] = 0;
//     dst[8] = zAxis.x;
//     dst[9] = zAxis.y;
//     dst[10] = zAxis.z;
//     dst[11] = 0;
//     dst[12] = cameraPosition.x;
//     dst[13] = cameraPosition.y;
//     dst[14] = cameraPosition.z;
//     dst[15] = 1;

//     return dst;

//     // return new Float32Array([
//     //   xAxis.x, xAxis.y, xAxis.z, 0,
//     //   yAxis.x, yAxis.y, yAxis.z, 0,
//     //   zAxis.x, zAxis.y, zAxis.z, 0,
//     //   cameraPosition.x, cameraPosition.y, cameraPosition.z, 1
//     // ]);
//   }

//   static inverse(m) {
//     var inv = new Float32Array([
//         m[5]*m[10]*m[15] - m[5]*m[11]*m[14] - m[9]*m[6]*m[15] + m[9]*m[7]*m[14] + m[13]*m[6]*m[11] - m[13]*m[7]*m[10],
//       -m[1]*m[10]*m[15] + m[1]*m[11]*m[14] + m[9]*m[2]*m[15] - m[9]*m[3]*m[14] - m[13]*m[2]*m[11] + m[13]*m[3]*m[10],
//         m[1]*m[6]*m[15]  - m[1]*m[7]*m[14]  - m[5]*m[2]*m[15] + m[5]*m[3]*m[14] + m[13]*m[2]*m[7]  - m[13]*m[3]*m[6],
//       -m[1]*m[6]*m[11]  + m[1]*m[7]*m[10]  + m[5]*m[2]*m[11] - m[5]*m[3]*m[10] - m[9]*m[2]*m[7]   + m[9]*m[3]*m[6],
//       -m[4]*m[10]*m[15] + m[4]*m[11]*m[14] + m[8]*m[6]*m[15] - m[8]*m[7]*m[14] - m[12]*m[6]*m[11] + m[12]*m[7]*m[10],
//         m[0]*m[10]*m[15] - m[0]*m[11]*m[14] - m[8]*m[2]*m[15] + m[8]*m[3]*m[14] + m[12]*m[2]*m[11] - m[12]*m[3]*m[10],
//       -m[0]*m[6]*m[15]  + m[0]*m[7]*m[14]  + m[4]*m[2]*m[15] - m[4]*m[3]*m[14] - m[12]*m[2]*m[7]  + m[12]*m[3]*m[6],
//         m[0]*m[6]*m[11]  - m[0]*m[7]*m[10]  - m[4]*m[2]*m[11] + m[4]*m[3]*m[10] + m[8]*m[2]*m[7]   - m[8]*m[3]*m[6],
//         m[4]*m[9]*m[15]  - m[4]*m[11]*m[13] - m[8]*m[5]*m[15] + m[8]*m[7]*m[13] + m[12]*m[5]*m[11] - m[12]*m[7]*m[9],
//       -m[0]*m[9]*m[15]  + m[0]*m[11]*m[13] + m[8]*m[1]*m[15] - m[8]*m[3]*m[13] - m[12]*m[1]*m[11] + m[12]*m[3]*m[9],
//         m[0]*m[5]*m[15]  - m[0]*m[7]*m[13]  - m[4]*m[1]*m[15] + m[4]*m[3]*m[13] + m[12]*m[1]*m[7]  - m[12]*m[3]*m[5],
//       -m[0]*m[5]*m[11]  + m[0]*m[7]*m[9]   + m[4]*m[1]*m[11] - m[4]*m[3]*m[9]  - m[8]*m[1]*m[7]   + m[8]*m[3]*m[5],
//       -m[4]*m[9]*m[14]  + m[4]*m[10]*m[13] + m[8]*m[5]*m[14] - m[8]*m[6]*m[13] - m[12]*m[5]*m[10] + m[12]*m[6]*m[9],
//         m[0]*m[9]*m[14]  - m[0]*m[10]*m[13] - m[8]*m[1]*m[14] + m[8]*m[2]*m[13] + m[12]*m[1]*m[10] - m[12]*m[2]*m[9],
//       -m[0]*m[5]*m[14]  + m[0]*m[6]*m[13]  + m[4]*m[1]*m[14] - m[4]*m[2]*m[13] - m[12]*m[1]*m[6]  + m[12]*m[2]*m[5],
//         m[0]*m[5]*m[10]  - m[0]*m[6]*m[9]   - m[4]*m[1]*m[10] + m[4]*m[2]*m[9]  + m[8]*m[1]*m[6]   - m[8]*m[2]*m[5]
//     ]);
//     var det = m[0] * inv[0] + m[1] * inv[4] + m[2] * inv[8] + m[3] * inv[12];
//     if (!det) return m;
//     det = 1 / det;
//     for (var i = 0; i < 16; i++) {
//       inv[i] *= det;
//     }
//     return inv;
//   }

//   static get(m, row, column) {
//     return m[row + column * 4];
//   }

//   static translate(t = {x: 0, y: 0, z: 0}) {
//     return new Float32Array([
//       1, 0, 0, 0,
//       0, 1, 0, 0,
//       0, 0, 1, 0,
//       t.x, t.y, t.z, 1
//     ]);
//   }

//   static transform(options = [], out = Matrix.identity()) {
//     for (var i = 0; i < options.length; i++) {
//       var option = options[i];
//       switch (option[0]) {
//         case "translate":
//           var x = option[1].x || 0;
//           var y = option[1].y || 0;
//           var z = option[1].z || 0;

//           out[12] += out[0] * x + out[4] * y + out[8]  * z;
//           out[13] += out[1] * x + out[5] * y + out[9]  * z;
//           out[14] += out[2] * x + out[6] * y + out[10] * z;
//           out[15] += out[3] * x + out[7] * y + out[11] * z;
//           break;
//         case "rx":
//           var rx = option[1];
//           out.set(Matrix.multiply(out, new Float32Array([1, 0, 0, 0, 0, Math.cos(rx), Math.sin(rx), 0, 0, -Math.sin(rx), Math.cos(rx), 0, 0, 0, 0, 1])));
//           break;
//         case "ry":
//           var ry = option[1];
//           out.set(Matrix.multiply(out, new Float32Array([Math.cos(ry), 0, -Math.sin(ry), 0, 0, 1, 0, 0, Math.sin(ry), 0, Math.cos(ry), 0, 0, 0, 0, 1]))); 
//           break;
//         case "rz":
//           var rz = option[1];
//           out.set(Matrix.multiply(out, new Float32Array([Math.cos(rz), Math.sin(rz), 0, 0, -Math.sin(rz), Math.cos(rz), 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])));
//           break;
//         case "sx":
//           var sx = option[1];
//           out[0] *= sx;  
//           out[1] *= sx;
//           out[2] *= sx;
//           out[3] *= sx;
//           break;
//         case "sy":
//           var sy = option[1];
//           out[4] *= sy;
//           out[5] *= sy;
//           out[6] *= sy;
//           out[7] *= sy;
//           break;
//         case "sz":
//           var sz = option[1];
//           out[8] *= sz;
//           out[9] *= sz;
//           out[10] *= sz;
//           out[11] *= sz;
//           break;
//         case "scale":
//           var sx = option[1].x ?? 1;
//           var sy = option[1].y ?? 1;
//           var sz = option[1].z ?? 1;

//           out[0] *= sx;  
//           out[1] *= sx;
//           out[2] *= sx;
//           out[3] *= sx;

//           out[4] *= sy;
//           out[5] *= sy;
//           out[6] *= sy;
//           out[7] *= sy;
          
//           out[8] *= sz;
//           out[9] *= sz;
//           out[10] *= sz;
//           out[11] *= sz;

//           break;
//       }
//     }
    
//     return out;
//   }

//   static TRS(t, r, s) {
//     return Matrix.transform([["scale", s]], Matrix.multiply(Matrix.translate(t), Matrix.fromQuaternion(r)));
//   }

//   static setRotation(m, rot) {
//     var sy = Vector.length({x: m[4], y: m[5], z: m[6]});
//     var sx = Vector.length({x: m[0], y: m[1], z: m[2]});
//     var sz = Vector.length({x: m[8], y: m[9], z: m[10]});
    
//     m[0] = rot[0] * sx;
//     m[1] = rot[1] * sx;
//     m[2] = rot[2] * sx;

//     m[4] = rot[4] * sy;
//     m[5] = rot[5] * sy;
//     m[6] = rot[6] * sy;

//     m[8] = rot[8] * sz;
//     m[9] = rot[9] * sz;
//     m[10] = rot[10] * sz;
//   }

//   static getRotationMatrix(m) {
//     var sx = Vector.length({x: m[0], y: m[1], z: m[2]});
//     var sy = Vector.length({x: m[4], y: m[5], z: m[6]});
//     var sz = Vector.length({x: m[8], y: m[9], z: m[10]});

//     return new Float32Array([
//       m[0] / sx, m[1] / sx, m[2] / sx, 0,
//       m[4] / sy, m[5] / sy, m[6] / sy, 0,
//       m[8] / sz, m[9] / sz, m[10] / sz, 0,
//       0, 0, 0, 1
//     ]);
//   }

//   static setScale(m, scale) {
//     var sx = Vector.length({x: m[0], y: m[1], z: m[2]}) / scale.x;
//     var sy = Vector.length({x: m[4], y: m[5], z: m[6]}) / scale.y;
//     var sz = Vector.length({x: m[8], y: m[9], z: m[10]}) / scale.z;
    
//     m[0] /= sx;
//     m[1] /= sx;
//     m[2] /= sx;

//     m[4] /= sy;
//     m[5] /= sy;
//     m[6] /= sy;

//     m[8] /= sz;
//     m[9] /= sz;
//     m[10] /= sz;
//   }

//   static getScale(m) {
//     var sx = Vector.length({x: m[0], y: m[1], z: m[2]});
//     var sy = Vector.length({x: m[4], y: m[5], z: m[6]});
//     var sz = Vector.length({x: m[8], y: m[9], z: m[10]});

//     return {x: sx, y: sy, z: sz};
//   }

//   static getScaleMatrix(m) {
//     var scale = Matrix.getScale(m);

//     return new Float32Array([
//       scale.x, 0, 0, 0,
//       0, scale.y, 0, 0,
//       0, 0, scale.z, 0,
//       0, 0, 0, 1
//     ]);
//   }

//   static setPosition(m, pos) {
//     m[12] = pos.x;
//     m[13] = pos.y;
//     m[14] = pos.z;
//   }

//   static getPosition(m) {
//     return {x: m[12], y: m[13], z: m[14]};
//   }

//   static getTranslationMatrix(m) {
//     return Matrix.translate(Matrix.getPosition(m));
//   }

//   static getForward(m) {
//     return Vector.multiply({x: m[8], y: m[9], z: m[10]}, -1);
//   }
//   static getRight(m) {
//     return {x: m[0], y: m[1], z: m[2]};
//   }
//   static getUp(m) {
//     return {x: m[4], y: m[5], z: m[6]};
//   }

//   /*static fromQuaternion = function(q) {
//     return Matrix.transpose(new Float32Array([
//       2 * (q.x * q.x + q.y * q.y) - 1, 2 * (q.y * q.z - q.x * q.w),     2 * (q.y * q.w + q.x * q.z),     0,
//       2 * (q.y * q.z + q.x * q.w),     2 * (q.x * q.x + q.z * q.z) - 1, 2 * (q.z * q.w - q.x * q.y),     0,
//       2 * (q.y * q.w - q.x * q.z),     2 * (q.z * q.w + q.x * q.y),     2 * (q.x * q.x + q.w * q.w) - 1, 0,
//       0, 0, 0, 1
//     ]));
//   }*/

//   static fromQuaternion(q) {
//     return Matrix.transpose(new Float32Array([
//       1 - 2*q.y*q.y - 2*q.z*q.z, 2*q.x*q.y - 2*q.z*q.w, 2*q.x*q.z + 2*q.y*q.w, 0,
//       2*q.x*q.y + 2*q.z*q.w, 1 - 2*q.x*q.x - 2*q.z*q.z, 2*q.y*q.z - 2*q.x*q.w, 0,
//       2*q.x*q.z - 2*q.y*q.w, 2*q.y*q.z + 2*q.x*q.w, 1 - 2*q.x*q.x - 2*q.y*q.y, 0,
//       0, 0, 0, 1
//     ]));
//   }
// }

// if (typeof module != "undefined")
//   module.exports = Matrix;