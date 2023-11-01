// if (typeof module != "undefined") {
//   Vector = require("./vector.js");
// }

import Quaternion from "./quaternion.mjs";
import Vector from "./vector.mjs";
import { lerp } from "./helper.mjs";

const inverseTempMatrix = new Float32Array(16);
const tempQuat = new Quaternion();
const tempMatrix = new Float32Array(16);

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

  constructor(a = 0, b = 0, c = 0, d = 0, e = 0, f = 0, g = 0, h = 0, i = 0, j = 0, k = 0, l = 0, m = 0, n = 0, o = 0, p = 0) {
    var dst = new Float32Array(16);
    _fillFloat32Array(dst, a, b, c, d, e, f, g, h, i, j, k, l, m, n, o, p);
    return dst;
  }

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

  static set(matrix, a, b, c, d, e, f, g, h, i, j, k, l, m, n, o, p) {
    return _fillFloat32Array(matrix, a, b, c, d, e, f, g, h, i, j, k, l, m, n, o, p);
  }

  static copy(m, dst) {
    dst = dst || new Float32Array(16);

    // _fillFloat32Array(dst,
    //   m[0], m[1], m[2], m[3],
    //   m[4], m[5], m[6], m[7],
    //   m[8], m[9], m[10], m[11],
    //   m[12], m[13], m[14], m[15]
    // );

    // bruh might be faster
    dst.set(m);

    return dst;
  }

  static isNaN(m) {
    return isNaN(m[0]) ||
           isNaN(m[1]) ||
           isNaN(m[2]) ||
           isNaN(m[3]) ||
           isNaN(m[4]) ||
           isNaN(m[5]) ||
           isNaN(m[6]) ||
           isNaN(m[7]) ||
           isNaN(m[8]) ||
           isNaN(m[9]) ||
           isNaN(m[10]) ||
           isNaN(m[11]) ||
           isNaN(m[12]) ||
           isNaN(m[13]) ||
           isNaN(m[14]) ||
           isNaN(m[15]);
  }

  static equal(a, b, epsilon = 1e-6) {
    return (
      Math.abs(a[0] - b[0]) < epsilon &&
      Math.abs(a[1] - b[1]) < epsilon &&
      Math.abs(a[2] - b[2]) < epsilon &&
      Math.abs(a[3] - b[3]) < epsilon &&
      Math.abs(a[4] - b[4]) < epsilon &&
      Math.abs(a[5] - b[5]) < epsilon &&
      Math.abs(a[6] - b[6]) < epsilon &&
      Math.abs(a[7] - b[7]) < epsilon &&
      Math.abs(a[8] - b[8]) < epsilon &&
      Math.abs(a[9] - b[9]) < epsilon &&
      Math.abs(a[10] - b[10]) < epsilon &&
      Math.abs(a[11] - b[11]) < epsilon &&
      Math.abs(a[12] - b[12]) < epsilon &&
      Math.abs(a[13] - b[13]) < epsilon &&
      Math.abs(a[14] - b[14]) < epsilon &&
      Math.abs(a[15] - b[15]) < epsilon
    );
  }

  static add(a, b, dst) {
    dst = dst || new Float32Array(16);
    _fillFloat32Array(dst,
      a[0] + b[0], a[1] + b[1], a[2] + b[2], a[3] + b[3],
      a[4] + b[4], a[5] + b[5], a[6] + b[6], a[7] + b[7],
      a[8] + b[8], a[9] + b[9], a[10] + b[10], a[11] + b[11],
      a[12] + b[12], a[13] + b[13], a[14] + b[14], a[15] + b[15],
    );

    return dst;
  }

  static subtract(a, b, dst) {
    dst = dst || new Float32Array(16);
    _fillFloat32Array(dst,
      a[0] - b[0], a[1] - b[1], a[2] - b[2], a[3] - b[3],
      a[4] - b[4], a[5] - b[5], a[6] - b[6], a[7] - b[7],
      a[8] - b[8], a[9] - b[9], a[10] - b[10], a[11] - b[11],
      a[12] - b[12], a[13] - b[13], a[14] - b[14], a[15] - b[15],
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
    // dst = dst || new Float32Array(16);
    // var c = new Float32Array(16);

    _fillFloat32Array(inverseTempMatrix,
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

    let det = m[0] * inverseTempMatrix[0] + m[1] * inverseTempMatrix[4] + m[2] * inverseTempMatrix[8] + m[3] * inverseTempMatrix[12];
    if (!det) return m;
    det = 1 / det;
    for (let i = 0; i < 16; i++) {
      inverseTempMatrix[i] *= det;
    }

    if (!dst) {
      dst = new Float32Array(16);
    }
    Matrix.copy(inverseTempMatrix, dst);

    return dst;
  }

  // static multiply(a, b, dst) {
  //   // bruh
  //   var dst2 = new Float32Array(16);

  //   for (var i = 0; i < 4; i++) {
  //     var ai0 = a[i];
  //     var ai1 = a[i+4];
  //     var ai2 = a[i+8];
  //     var ai3 = a[i+12];
  //     dst2[i]    = ai0 * b[0]  + ai1 * b[1]  + ai2 * b[2]  + ai3 * b[3];
  //     dst2[i+4]  = ai0 * b[4]  + ai1 * b[5]  + ai2 * b[6]  + ai3 * b[7];
  //     dst2[i+8]  = ai0 * b[8]  + ai1 * b[9]  + ai2 * b[10] + ai3 * b[11];
  //     dst2[i+12] = ai0 * b[12] + ai1 * b[13] + ai2 * b[14] + ai3 * b[15];
  //   }

  //   if (dst)
  //   Matrix.copy(dst2, dst); // bruh

  //   return dst2;
  // }

  static multiply(a, b, dst) {
    dst = dst || new Float32Array(16);

    const ae = a;
    const be = b;
    const te = dst;

    const a11 = ae[ 0 ], a12 = ae[ 4 ], a13 = ae[ 8 ], a14 = ae[ 12 ];
    const a21 = ae[ 1 ], a22 = ae[ 5 ], a23 = ae[ 9 ], a24 = ae[ 13 ];
    const a31 = ae[ 2 ], a32 = ae[ 6 ], a33 = ae[ 10 ], a34 = ae[ 14 ];
    const a41 = ae[ 3 ], a42 = ae[ 7 ], a43 = ae[ 11 ], a44 = ae[ 15 ];

    const b11 = be[ 0 ], b12 = be[ 4 ], b13 = be[ 8 ], b14 = be[ 12 ];
    const b21 = be[ 1 ], b22 = be[ 5 ], b23 = be[ 9 ], b24 = be[ 13 ];
    const b31 = be[ 2 ], b32 = be[ 6 ], b33 = be[ 10 ], b34 = be[ 14 ];
    const b41 = be[ 3 ], b42 = be[ 7 ], b43 = be[ 11 ], b44 = be[ 15 ];

    te[ 0 ] = a11 * b11 + a12 * b21 + a13 * b31 + a14 * b41;
    te[ 4 ] = a11 * b12 + a12 * b22 + a13 * b32 + a14 * b42;
    te[ 8 ] = a11 * b13 + a12 * b23 + a13 * b33 + a14 * b43;
    te[ 12 ] = a11 * b14 + a12 * b24 + a13 * b34 + a14 * b44;

    te[ 1 ] = a21 * b11 + a22 * b21 + a23 * b31 + a24 * b41;
    te[ 5 ] = a21 * b12 + a22 * b22 + a23 * b32 + a24 * b42;
    te[ 9 ] = a21 * b13 + a22 * b23 + a23 * b33 + a24 * b43;
    te[ 13 ] = a21 * b14 + a22 * b24 + a23 * b34 + a24 * b44;

    te[ 2 ] = a31 * b11 + a32 * b21 + a33 * b31 + a34 * b41;
    te[ 6 ] = a31 * b12 + a32 * b22 + a33 * b32 + a34 * b42;
    te[ 10 ] = a31 * b13 + a32 * b23 + a33 * b33 + a34 * b43;
    te[ 14 ] = a31 * b14 + a32 * b24 + a33 * b34 + a34 * b44;

    te[ 3 ] = a41 * b11 + a42 * b21 + a43 * b31 + a44 * b41;
    te[ 7 ] = a41 * b12 + a42 * b22 + a43 * b32 + a44 * b42;
    te[ 11 ] = a41 * b13 + a42 * b23 + a43 * b33 + a44 * b43;
    te[ 15 ] = a41 * b14 + a42 * b24 + a43 * b34 + a44 * b44;

    return dst;
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

  static getForward(m, dst) {
    dst = dst || new Vector();

    dst.x = -m[8];
    dst.y = -m[9];
    dst.z = -m[10];
    Vector.normalizeTo(dst);

    return dst;
  }
  static getRight(m, dst) {
    dst = dst || new Vector();

    dst.x = m[0];
    dst.y = m[1];
    dst.z = m[2];
    Vector.normalizeTo(dst);

    return dst;
  }
  static getUp(m, dst) {
    dst = dst || new Vector();

    dst.x = m[4];
    dst.y = m[5];
    dst.z = m[6];
    Vector.normalizeTo(dst);

    return dst;
  }

  static forward(m, dst) {
    return Matrix.getForward(m, dst);
  }
  static right(m, dst) {
    return Matrix.getRight(m, dst);
  }
  static up(m, dst) {
    return Matrix.getUp(m, dst);
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
    dst = dst || new Float32Array(16);

    const x = m[12];
    const y = m[13];
    const z = m[14];

    _fillFloat32Array(dst,
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      x, y, z, 1
    );

    return dst;

    // return Matrix.translate(Matrix.getPosition(m), dst);
  }

  static getPosition(m, dst) {
    dst = dst || Vector.zero();
    dst.x = m[12];
    dst.y = m[13];
    dst.z = m[14];
    return dst;
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

    const sx = Vector.lengthNonVector(m[0], m[1], m[2]);
    const sy = Vector.lengthNonVector(m[4], m[5], m[6]);
    const sz = Vector.lengthNonVector(m[8], m[9], m[10]);

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

  static scaleWithScalar(m, scale) {
    m[0] *= scale;
    m[1] *= scale;
    m[2] *= scale;

    m[4] *= scale;
    m[5] *= scale;
    m[6] *= scale;

    m[8] *= scale;
    m[9] *= scale;
    m[10] *= scale;

    return m;
  }

  static scaleWithVector(m, scale) {
    m[0] *= scale.x;
    m[1] *= scale.x;
    m[2] *= scale.x;

    m[4] *= scale.y;
    m[5] *= scale.y;
    m[6] *= scale.y;

    m[8] *= scale.z;
    m[9] *= scale.z;
    m[10] *= scale.z;

    return m;
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

  static getScale(m, dst) {
    dst = dst || new Vector();

    dst.x = Vector.lengthNonVector(m[0], m[1], m[2]);
    dst.y = Vector.lengthNonVector(m[4], m[5], m[6]);
    dst.z = Vector.lengthNonVector(m[8], m[9], m[10]);

    return dst;
  }

  static getScaleMatrix(m, dst) {
    dst = dst || new Float32Array(16);

    const x = Vector.lengthNonVector(m[0], m[1], m[2]);
    const y = Vector.lengthNonVector(m[4], m[5], m[6]);
    const z = Vector.lengthNonVector(m[8], m[9], m[10]);

    _fillFloat32Array(dst,
      x, 0, 0, 0,
      0, y, 0, 0,
      0, 0, z, 0,
      0, 0, 0, 1
    );

    return dst;

    // var scale = Matrix.getScale(m);
    // return Matrix.scale(scale, dst);
  }

  // Transform

  static applyTranslation(translation, dst) {
    dst = dst || Matrix.identity();

    const x = translation.x || 0;
    const y = translation.y || 0;
    const z = translation.z || 0;

    dst[12] += dst[0] * x + dst[4] * y + dst[8]  * z;
    dst[13] += dst[1] * x + dst[5] * y + dst[9]  * z;
    dst[14] += dst[2] * x + dst[6] * y + dst[10] * z;
    dst[15] += dst[3] * x + dst[7] * y + dst[11] * z;

    return dst;
  }

  static applyRotationX(rx = 0, dst) {
    dst = dst || Matrix.identity();

    Matrix.set(
      tempMatrix,
      1, 0, 0, 0,
      0, Math.cos(rx), Math.sin(rx), 0,
      0, -Math.sin(rx), Math.cos(rx), 0,
      0, 0, 0, 1
    );
    Matrix.multiply(dst, tempMatrix, dst);

    return dst;
  }

  static applyRotationY(ry = 0, dst) {
    dst = dst || Matrix.identity();

    Matrix.set(
      tempMatrix,
      Math.cos(ry), 0, -Math.sin(ry), 0,
      0, 1, 0, 0,
      Math.sin(ry), 0, Math.cos(ry), 0,
      0, 0, 0, 1
    );
    Matrix.multiply(dst, tempMatrix, dst);

    return dst;
  }

  static applyRotationZ(rz = 0, dst) {
    dst = dst || Matrix.identity();

    Matrix.set(
      tempMatrix,
      Math.cos(rz), Math.sin(rz), 0, 0,
      -Math.sin(rz), Math.cos(rz), 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1
    );
    Matrix.multiply(dst, tempMatrix, dst);

    return dst;
  }

  static applyScaleX(sx, dst) {
    dst[0] *= sx;  
    dst[1] *= sx;
    dst[2] *= sx;
    dst[3] *= sx;
  }

  static applyScaleY(sy, dst) {
    dst[4] *= sy;
    dst[5] *= sy;
    dst[6] *= sy;
    dst[7] *= sy;
  }

  static applyScaleZ(sz, dst) {
    dst[8] *= sz;
    dst[9] *= sz;
    dst[10] *= sz;
    dst[11] *= sz;
  }
  
  static applyScale(scale, dst) {
    const sx = scale.x ?? 1;
    const sy = scale.y ?? 1;
    const sz = scale.z ?? 1;

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
  }

  static transform(options = [], dst) {
    dst = dst || Matrix.identity();

    for (var i = 0; i < options.length; i++) {
      var option = options[i];
      switch (option[0]) {
        case "translate":
          Matrix.applyTranslation(option[1], dst);
          break;

        case "rx":
          Matrix.applyRotationX(option[1], dst);
          break;

        case "ry":
          Matrix.applyRotationY(option[1], dst);
          break;

        case "rz":
          Matrix.applyRotationZ(option[1], dst);
          break;

        case "sx":
          Matrix.applyScaleX(option[1], dst);
          break;
        case "sy":
          Matrix.applyScaleY(option[1], dst);
          break;
        case "sz":
          Matrix.applyScaleZ(option[1], dst);
          break;
          
        case "scale":
          Matrix.applyScale(option[1], dst);
          break;
      }
    }
    
    return dst;
  }

  static lookAt(cameraPosition, target, up = Vector.up(), dst) {
    dst = dst || new Float32Array(16);

    var zAxis = Vector.normalize(Vector.subtract(cameraPosition, target));
    var xAxis = Vector.normalize(Vector.cross(up, zAxis));
    var yAxis = Vector.cross(zAxis, xAxis);

    _fillFloat32Array(dst,
      xAxis.x, xAxis.y, xAxis.z, 0,
      yAxis.x, yAxis.y, yAxis.z, 0,
      zAxis.x, zAxis.y, zAxis.z, 0,
      cameraPosition.x, cameraPosition.y, cameraPosition.z, 1
    );

    return dst;
  }

  static lookInDirection(cameraPosition, direction, up = Vector.up(), dst) {
    dst = dst || new Float32Array(16);

    var zAxis = Vector.normalize(direction);
    var c = Vector.cross(up, zAxis);
    var xAxis = Vector.normalizeTo(c);
    // var xAxis = Vector.normalize(Vector.cross(up, zAxis));
    var yAxis = Vector.cross(zAxis, xAxis);

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

  static transformVector(m, v, dst) {
    dst = dst || new Vector();

    const vx = v.x;
    const vy = v.y;
    const vz = v.z;

    dst.x = m[0] * vx + m[4] * vy + m[8] * vz + m[12];
    dst.y = m[1] * vx + m[5] * vy + m[9] * vz + m[13];
    dst.z = m[2] * vx + m[6] * vy + m[10] * vz + m[14];

    return dst;

    // var output = [];
    // for (var i = 0; i < 4; i++) {
    //   output[i] = m[i] * v.x + m[i + 4] * v.y + m[i + 8] * v.z + m[i + 12];
    // }
    // return {x: output[0], y: output[1], z: output[2]};
  }

  /**
   * Transforms v ignoring position and scale of m
   * @param {Matrix} m Transformation matrix
   * @param {Vector} v Vector direction
   * @param {Vector?} dst Destination vector
   * @returns {Vector}
   */
  static transformDirection(m, v, dst) {
    dst = dst || new Vector();
    
    const rotationMatrix = Matrix.getRotationMatrix(m);
    return Matrix.transformVector(rotationMatrix, v, dst);

    // const vx = v.x;
    // const vy = v.y;
    // const vz = v.z;

    // dst.x = m[0] * vx + m[4] * vy + m[8] * vz;
    // dst.y = m[1] * vx + m[5] * vy + m[9] * vz;
    // dst.z = m[2] * vx + m[6] * vy + m[10] * vz;

    // return dst;

    // var output = [];
    // for (var i = 0; i < 4; i++) {
    //   output[i] = m[i] * v.x + m[i + 4] * v.y + m[i + 8] * v.z + m[i + 12] * 0;
    // }
    // return {x: output[0], y: output[1], z: output[2]};
  }

  // Quaternion

  static fromQuaternion(quaternion, dst) {
    dst = dst || new Float32Array(16);

    Quaternion.normalize(quaternion, tempQuat);
    const q = tempQuat;

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

  static logSummary(m) {
    console.log("---Matrix summary---");
    console.log("Position", Matrix.getPosition(m));
    console.log("Scale", Matrix.getScale(m));
    console.log("Rotation", Quaternion.fromMatrix(m));
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