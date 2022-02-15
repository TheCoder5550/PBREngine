import { clamp, lerp } from "./helper.mjs";

export default class Vector {
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
    var aIIb = Vector.multiply(axis, Vector.dot(v, axis) / Vector.dot(axis, axis));
    var aTb = Vector.subtract(v, aIIb);
    var w = Vector.cross(axis, aTb);
    var x1 = Math.cos(angle) / Vector.length(aTb);
    var x2 = Math.sin(angle) / Vector.length(w);
    var aTb0 = Vector.multiply(Vector.add(Vector.multiply(aTb, x1), Vector.multiply(w, x2)), Vector.length(aTb));
    var ab0 = Vector.add(aTb0, aIIb);

    return ab0;
  }

  static project(v, normal) {
    return Vector.multiply(normal, Vector.dot(normal, v));
  }

  static projectOnPlane(v, normal) {
    var distToPlane = Vector.dot(normal, v);
    return Vector.subtract(v, Vector.multiply(normal, distToPlane));
  }

  static findOrthogonal(v) {
    if (Math.abs(v.x) >= 1 / Math.sqrt(3))
      return Vector.normalize(new Vector(v.y, -v.x, 0));
    else
      return Vector.normalize(new Vector(0, v.z, -v.y));
  }

  static formOrthogonalBasis(v) {
    var a = Vector.findOrthogonal(v);
    return [
      a,
      Vector.cross(a, v)
    ];
  }

  static length(v) {
    var sum = v.x * v.x + v.y * v.y;
    if (v.z) sum += v.z * v.z;
    return Math.sqrt(sum);
  }

  static lengthSqr(v) {
    var sum = v.x * v.x + v.y * v.y;
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
    var len = Vector.length(v);
    if (len < 1e-6)
      return Vector.copy(v);
    else
      return Vector.divide(v, len);
  }
  
  static dot(a, b) {
    var sum = a.x * b.x + a.y * b.y;
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

  static lerp(a, b, t) {
    return {
      x: lerp(a.x, b.x, t),
      y: lerp(a.y, b.y, t),
      z: lerp(a.z, b.z, t)
    };
  }

  static slerp(start, end, percent) {
    var dot = clamp(Vector.dot(start, end), -1, 1);
    var theta = Math.acos(dot) * percent;
    var relativeVec = Vector.normalize(Vector.subtract(end, Vector.multiply(start, dot)));
    var a = Vector.multiply(start, Math.cos(theta));
    var b = Vector.multiply(relativeVec, Math.sin(theta));
    return Vector.add(a, b);
  }
}

// if (typeof module != "undefined")
//   module.exports = Vector;