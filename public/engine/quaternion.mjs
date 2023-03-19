import { lerp } from "./helper.mjs";
import Matrix from "./matrix.mjs";
import Vector from "./vector.mjs";

export default class Quaternion {
  constructor(x = 0, y = 0, z = 0, w = 0, dst) {
    dst = dst || {x: 0, y: 0, z: 0, w: 0};

    dst.x = x;
    dst.y = y;
    dst.z = z;
    dst.w = w;

    return dst;
  }

  static isQuaternionIsh(q) {
    return typeof q == "object" && ("x" in q && "y" in q && "z" in q && "w" in q);
  }

  static zero() {
    return {
      x: 0,
      y: 0,
      z: 0,
      w: 0
    };
  }

  static identity(dst) {
    dst = dst || new Quaternion();

    dst.x = 0;
    dst.y = 0;
    dst.z = 0;
    dst.w = 1;

    return dst;
  }

  static copy(q) {
    return {
      x: q.x,
      y: q.y,
      z: q.z,
      w: q.w
    };
  }

  static set(to, from) {
    to.x = from.x;
    to.y = from.y;
    to.z = from.z;
    to.w = from.w;

    return to;
  }

  static equal(a, b, epsilon = 1e-6) {
    return Math.abs(a.x - b.x) < epsilon &&
           Math.abs(a.y - b.y) < epsilon &&
           Math.abs(a.z - b.z) < epsilon &&
           Math.abs(a.w - b.w) < epsilon;
  }

  static isNaN(q) {
    return isNaN(q.x) || isNaN(q.y) || isNaN(q.z) || isNaN(q.w);
  }

  static normalize(q) {
    var len = Math.sqrt(q.x * q.x + q.y * q.y + q.z * q.z + q.w * q.w);
    return {
      x: q.x / len,
      y: q.y / len,
      z: q.z / len,
      w: q.w / len
    };
  }

  static normalizeTo(q) {
    const len = Math.sqrt(q.x * q.x + q.y * q.y + q.z * q.z + q.w * q.w);
    q.x /= len;
    q.y /= len;
    q.z /= len;
    q.w /= len;

    return q;
  }

  static dot(a, b) {
    return a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
  }

  static add(a, b) {
    return {
      x: a.x + b.x,
      y: a.y + b.y,
      z: a.z + b.z,
      w: a.w + b.w
    };
  }

  static multiply(q, s) {
    return {
      x: q.x * s,
      y: q.y * s,
      z: q.z * s,
      w: q.w * s
    };
  }

  static QxQ(a, b) {
    return new Quaternion(
      a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,  // i
      a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,  // j
      a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,  // k
      a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,  // 1
    );
  }

  static QxV(q, v, dst) {
    dst = dst || new Vector();
    
    var
      x = v.x,
      y = v.y,
      z = v.z;

    var
      qx = q.x,
      qy = q.y,
      qz = q.z,
      qw = q.w;

    var
      ix =  qw * x + qy * z - qz * y,
      iy =  qw * y + qz * x - qx * z,
      iz =  qw * z + qx * y - qy * x,
      iw = -qx * x - qy * y - qz * z;

    dst.x = ix * qw + iw * -qx + iy * -qz - iz * -qy;
    dst.y = iy * qw + iw * -qy + iz * -qx - ix * -qz;
    dst.z = iz * qw + iw * -qz + ix * -qy - iy * -qx;

    return dst;
  }

  static slerp(a, b, t) {
    var d = Quaternion.dot(a, b);
    if (Math.abs(1 - d) < 1e-5) {
      return a;
    }
  
    var aPrim = (d >= 0 ? a : Quaternion.multiply(a, -1));
    var theta = Math.acos(Math.abs(d));
    var nom = Quaternion.add(Quaternion.multiply(aPrim, Math.sin((1 - t) * theta)), Quaternion.multiply(b, Math.sin(t * theta)));
    var output = Quaternion.multiply(nom, 1 / Math.sin(theta));
  
    return output;
  }

  static lerp(a, b, t) {
    return {
      x: lerp(a.x, b.x, t),
      y: lerp(a.y, b.y, t),
      z: lerp(a.z, b.z, t),
      w: lerp(a.w, b.w, t)
    };
  }

  static euler(x, y, z, dst) {
    dst = dst || new Quaternion();

    const roll = x;
    const pitch = y;
    const yaw = z;

    const qx = Math.sin(roll/2) * Math.cos(pitch/2) * Math.cos(yaw/2) - Math.cos(roll/2) * Math.sin(pitch/2) * Math.sin(yaw/2);
    const qy = Math.cos(roll/2) * Math.sin(pitch/2) * Math.cos(yaw/2) + Math.sin(roll/2) * Math.cos(pitch/2) * Math.sin(yaw/2);
    const qz = Math.cos(roll/2) * Math.cos(pitch/2) * Math.sin(yaw/2) - Math.sin(roll/2) * Math.sin(pitch/2) * Math.cos(yaw/2);
    const qw = Math.cos(roll/2) * Math.cos(pitch/2) * Math.cos(yaw/2) + Math.sin(roll/2) * Math.sin(pitch/2) * Math.sin(yaw/2);
    
    dst.x = qx;
    dst.y = qy;
    dst.z = qz;
    dst.w = qw;
    
    return dst;
  }

  static eulerVector(v, dst) {
    return Quaternion.euler(v.x, v.y, v.z, dst);
  }

  static toEulerAngles(q) {
    var [x, y, z, w] = [q.x, q.y, q.z, q.w];

    var t0 = 2 * (w * x + y * z);
    var t1 = 1 - 2 * (x * x + y * y);
    var roll = Math.atan2(t0, t1);

    var t2 = 2 * (w * y - z * x);
    t2 = t2 > 1 ? 1 : t2;
    t2 = t2 < -1 ? -1 : t2;
    var pitch = Math.asin(t2);

    var t3 = 2 * (w * z + x * y);
    var t4 = 1 - 2 * (y * y + z * z);
    var yaw = Math.atan2(t3, t4);

    return [roll, pitch, yaw];
  }

  static angleAxis(angle, axis, dst) {
    dst = dst || new Quaternion();

    dst.x = axis.x * Math.sin(angle / 2);
    dst.y = axis.y * Math.sin(angle / 2);
    dst.z = axis.z * Math.sin(angle / 2);
    dst.w = Math.cos(angle / 2);

    return dst;

    // return new Quaternion(
    //   axis.x * Math.sin(angle / 2),
    //   axis.y * Math.sin(angle / 2),
    //   axis.z * Math.sin(angle / 2),
    //   Math.cos(angle / 2)
    // );
  }

  static fromMatrix(m, dst) {
    dst = dst || new Quaternion();

    var trace = Matrix.get(m, 0, 0) + Matrix.get(m, 1, 1) + Matrix.get(m, 2, 2);
    if (trace > 0) {
      let s = 0.5 / Math.sqrt(trace + 1);

      dst.x = (Matrix.get(m, 2, 1) - Matrix.get(m, 1, 2)) * s;
      dst.y = (Matrix.get(m, 0, 2) - Matrix.get(m, 2, 0)) * s;
      dst.z = (Matrix.get(m, 1, 0) - Matrix.get(m, 0, 1)) * s;
      dst.w = 0.25 / s;
    }
    else {
      if (Matrix.get(m, 0, 0) > Matrix.get(m, 1, 1) && Matrix.get(m, 0, 0) > Matrix.get(m, 2, 2)) {
        let s = 2 * Math.sqrt(1 + Matrix.get(m, 0, 0) - Matrix.get(m, 1, 1) - Matrix.get(m, 2, 2));

        dst.x = 0.25 * s;
        dst.y = (Matrix.get(m, 0, 1) + Matrix.get(m, 1, 0)) / s;
        dst.z = (Matrix.get(m, 0, 2) + Matrix.get(m, 2, 0)) / s;
        dst.w = (Matrix.get(m, 2, 1) - Matrix.get(m, 1, 2)) / s;
      }
      else if (Matrix.get(m, 1, 1) > Matrix.get(m, 2, 2)) {
        let s = 2 * Math.sqrt(1 + Matrix.get(m, 1, 1) - Matrix.get(m, 0, 0) - Matrix.get(m, 2, 2));

        dst.x = (Matrix.get(m, 0, 1) + Matrix.get(m, 1, 0)) / s;
        dst.y = 0.25 * s;
        dst.z = (Matrix.get(m, 1, 2) + Matrix.get(m, 2, 1)) / s;
        dst.w = (Matrix.get(m, 0, 2) + Matrix.get(m, 2, 0)) / s;
      }
      else {
        let s = 2 * Math.sqrt(1 + Matrix.get(m, 2, 2) - Matrix.get(m, 0, 0) - Matrix.get(m, 1, 1));

        dst.x = (Matrix.get(m, 0, 2) + Matrix.get(m, 2, 0)) / s;
        dst.y = (Matrix.get(m, 1, 2) + Matrix.get(m, 2, 1)) / s;
        dst.z = 0.25 * s;
        dst.w = (Matrix.get(m, 1, 0) + Matrix.get(m, 0, 1)) / s;
      }
    }

    return dst;
  }
}