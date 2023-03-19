import { clamp, inverseLerp, lerp } from "./helper.mjs";

class Vector {
  constructor(x = 0, y = 0, z = 0, dst) {
    dst = dst || {x: 0, y: 0, z: 0};

    dst.x = x;
    dst.y = y;
    dst.z = z;

    return dst;
  }

  static zero(dst) {
    dst = dst || new Vector();

    dst.x = 0;
    dst.y = 0;
    dst.z = 0;

    return dst;
  }

  static one(dst) {
    dst = dst || new Vector();

    dst.x = 1;
    dst.y = 1;
    dst.z = 1;
    
    return dst;
  }

  static up(dst) {
    dst = dst || new Vector();

    dst.x = 0;
    dst.y = 1;
    dst.z = 0;
    
    return dst;
  }

  static down(dst) {
    dst = dst || new Vector();

    dst.x = 0;
    dst.y = -1;
    dst.z = 0;
    
    return dst;
  }

  static fill(value = 0, dst) {
    dst = dst || new Vector();

    dst.x = value;
    dst.y = value;
    dst.z = value;
    
    return dst;
  }

  static set(to, from) {
    to.x = from.x;
    to.y = from.y;
    to.z = from.z;

    return to;
  }

  static copy(v, dst) {
    dst = dst || new Vector();

    dst.x = v.x;
    dst.y = v.y;
    dst.z = v.z;

    return dst;
  }

  static fromArray(a, offset = 0, inc = 1, len = 4, dst) {
    dst = dst || {x: 0, y: 0, z: 0, w: 0};

    dst.x = len >= 1 ? a[offset] ?? 0 : 0;
    dst.y = len >= 2 ? a[offset + inc] ?? 0 : 0;
    dst.z = len >= 3 ? a[offset + inc * 2] ?? 0 : 0;
    dst.w = len >= 4 ? a[offset + inc * 3] ?? 0 : 0;

    return dst;
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

  static isNaN(v) {
    return isNaN(v.x) || isNaN(v.y) || isNaN(v.z);
  }

  static add(a, b, dst) {
    dst = dst || new Vector();

    dst.x = a.x + b.x;
    dst.y = a.y + b.y;
    dst.z = a.z + b.z;

    return dst;
  }

  static addTo(dst, v) {
    dst.x += v.x;
    dst.y += v.y;
    dst.z += v.z;
    return dst;
  }

  static subtract(a, b, dst) {
    dst = dst || new Vector();

    dst.x = a.x - b.x;
    dst.y = a.y - b.y;
    dst.z = a.z - b.z;

    return dst;
  }

  static subtractTo(dst, v) {
    dst.x -= v.x;
    dst.y -= v.y;
    dst.z -= v.z;
    return dst;
  }

  static multiply(v, scalar, dst) {
    dst = dst || new Vector();

    dst.x = v.x * scalar;
    dst.y = v.y * scalar;
    dst.z = v.z * scalar;

    return dst;
  }

  static multiplyTo(dst, scalar) {
    dst.x *= scalar;
    dst.y *= scalar;
    dst.z *= scalar;
    return dst;
  }

  static negate(v, dst) {
    dst = dst || new Vector();

    dst.x = -v.x;
    dst.y = -v.y;
    dst.z = -v.z;

    return dst;
  }

  static compMultiply(a, b, dst) {
    dst = dst || new Vector();

    dst.x = a.x * b.x;
    dst.y = a.y * b.y;
    dst.z = a.z * b.z;

    return dst;
  }

  static compMultiplyTo(dst, v) {
    dst.x *= v.x;
    dst.y *= v.y;
    dst.z *= v.z;
    return dst;
  }

  static divide(v, scalar, dst) {
    dst = dst || new Vector();

    dst.x = v.x / scalar;
    dst.y = v.y / scalar;
    dst.z = v.z / scalar;

    return dst;
  }

  static divideTo(dst, scalar) {
    dst.x /= scalar;
    dst.y /= scalar;
    dst.z /= scalar;
    return dst;
  }

  static compDivide(a, b, dst) {
    dst = dst || new Vector();

    dst.x = a.x / b.x;
    dst.y = a.y / b.y;
    dst.z = a.z / b.z;

    return dst;
  }

  static compDivideTo(dst, v) {
    dst.x /= v.x;
    dst.y /= v.y;
    dst.z /= v.z;
    return dst;
  }

  static average(a, b, dst) {
    dst = dst || new Vector();

    Vector.add(a, b, dst);
    Vector.divideTo(dst, 2);

    return dst;
  }

  static applyFunc(v, func, dst) {
    dst = dst || new Vector();

    dst.x = func(v.x);
    dst.y = func(v.y);
    dst.z = func(v.z);

    return dst;
  }

  static compFunc(a, b, func, dst) {
    dst = dst || new Vector();

    dst.x = func(a.x, b.x);
    dst.y = func(a.y, b.y);
    dst.z = func(a.z, b.z);

    return dst;
  }

  static rotate2D(v, angle, dst) {
    dst = dst || new Vector();

    dst.x = v.x * Math.cos(angle) - v.y * Math.sin(angle);
    dst.y = v.x * Math.sin(angle) + v.y * Math.cos(angle);
    dst.z = 0;

    return dst;
  }

  // !
  static rotateAround(v, axis, angle, dst) {
    dst = dst || new Vector();

    var aIIb = Vector.multiply(axis, Vector.dot(v, axis) / Vector.dot(axis, axis));
    var aTb = Vector.subtract(v, aIIb);
    var w = Vector.cross(axis, aTb);
    var x1 = Math.cos(angle) / Vector.length(aTb);
    var x2 = Math.sin(angle) / Vector.length(w);
    var aTb0 = Vector.multiply(Vector.add(Vector.multiply(aTb, x1), Vector.multiply(w, x2)), Vector.length(aTb));

    Vector.add(aTb0, aIIb, dst);
  }

  static project(v, normal, dst) {
    dst = dst || new Vector();

    const d = Vector.dot(normal, v);
    Vector.set(dst, normal);
    Vector.multiplyTo(dst, d);

    return dst;
  }

  static projectOnPlane(v, normal, dst) {
    dst = dst || new Vector();

    const distToPlane = Vector.dot(normal, v);

    Vector.set(_tempVector, normal);
    Vector.multiplyTo(_tempVector, distToPlane);
    Vector.set(dst, v);
    Vector.subtractTo(dst, _tempVector);

    return dst;

    // return Vector.subtract(v, Vector.multiply(normal, distToPlane));
  }

  static findOrthogonal(v, dst) {
    dst = dst || new Vector();

    if (Math.abs(v.x) >= 1 / Math.sqrt(3)) {
      dst.x = v.y;
      dst.y = -v.x;
      dst.z = 0;
    }
    else {
      dst.x = 0;
      dst.y = v.z;
      dst.z = -v.y;
    }

    Vector.normalizeTo(dst);

    return dst;
  }

  static formOrthogonalBasis(v) {
    var a = Vector.findOrthogonal(v);
    return [
      a,
      Vector.cross(a, v)
    ];
  }

  static lengthNonVector(x = 0, y = 0, z = 0) {
    return Math.sqrt(x * x + y * y + z * z);
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
    Vector.set(_tempVector, a);
    Vector.subtractTo(_tempVector, b);
    return Vector.length(_tempVector);
  }

  static distanceSqr(a, b) {
    Vector.set(_tempVector, a);
    Vector.subtractTo(_tempVector, b);
    return Vector.lengthSqr(_tempVector);
  }

  static normalize(v, dst) {
    dst = dst || new Vector();

    var len = Vector.lengthSqr(v);
    if (len < 1e-12) {
      Vector.copy(v, dst);
    }
    else {
      Vector.divide(v, Math.sqrt(len), dst);
    }

    return dst;
  }

  static normalizeTo(v) {
    var len = Vector.length(v);
    if (len < 1e-6)
      return v;
    else
      return Vector.divideTo(v, len);
  }
  
  static dot(a, b) {
    var sum = a.x * b.x + a.y * b.y;
    if (a.z && b.z) sum += a.z * b.z;
    return sum;
  }

  static cross(a, b, dst) {
    dst = dst || new Vector();

    const ax = a.x;
    const ay = a.y;
    const az = a.z;
    const bx = b.x;
    const by = b.y;
    const bz = b.z;

    dst.x = ay * bz - az * by;
    dst.y = az * bx - ax * bz;
    dst.z = ax * by - ay * bx;

    return dst;
  }

  static lerp(a, b, t, dst) {
    dst = dst || new Vector();

    dst.x = lerp(a.x, b.x, t);
    dst.y = lerp(a.y, b.y, t);
    dst.z = lerp(a.z, b.z, t);

    return dst;
  }

  static inverseLerp(a, b, t, dst) {
    dst = dst || new Vector();

    dst.x = inverseLerp(a.x, b.x, t);
    dst.y = inverseLerp(a.y, b.y, t);
    dst.z = inverseLerp(a.z, b.z, t);

    return dst;
  }

  static slerp(start, end, percent, dst) {
    dst = dst || new Vector();

    var dot = clamp(Vector.dot(start, end), -1, 1);
    var theta = Math.acos(dot) * percent;
    var relativeVec = Vector.normalize(Vector.subtract(end, Vector.multiply(start, dot)));
    var a = Vector.multiply(start, Math.cos(theta));
    var b = Vector.multiply(relativeVec, Math.sin(theta));
    Vector.add(a, b, dst);

    return dst;
  }

  static clamp(v, min, max, dst) {
    dst = dst || new Vector();

    var minIsVector = Vector.isVectorIsh(min);
    var maxIsVector = Vector.isVectorIsh(max);

    dst.x = clamp(v.x, minIsVector ? min.x : min, maxIsVector ? max.x : max);
    dst.y = clamp(v.y, minIsVector ? min.y : min, maxIsVector ? max.y : max);
    dst.z = clamp(v.z, minIsVector ? min.z : min, maxIsVector ? max.z : max);

    return dst;
  }

  static map(v, f, dst) {
    dst = dst || new Vector();

    dst.x = f(v.x);
    dst.y = f(v.y);
    dst.z = f(v.z);

    return dst;
  }
}

const _tempVector = new Vector();

// if (typeof module != "undefined")
//   module.exports = Vector;

export default Vector;