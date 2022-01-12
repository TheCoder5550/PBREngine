import Matrix from "./matrix.js";

export default class Quaternion {
  constructor(x = 0, y = 0, z = 0, w = 0) {
    return {x, y, z, w};
  }

  static zero() {
    return {
      x: 0,
      y: 0,
      z: 0,
      w: 0
    };
  }

  static identity() {
    return {
      x: 0,
      y: 0,
      z: 0,
      w: 1
    };
  }

  static copy(q) {
    return {
      x: q.x,
      y: q.y,
      z: q.z,
      w: q.w
    };
  }

  static equal(a, b, epsilon = 1e-6) {
    return Math.abs(a.x - b.x) < epsilon &&
           Math.abs(a.y - b.y) < epsilon &&
           Math.abs(a.z - b.z) < epsilon &&
           Math.abs(a.w - b.w) < epsilon;
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

  static euler(x, y, z) {
    var [roll, pitch, yaw] = [x, y, z];
    var qx = Math.sin(roll/2) * Math.cos(pitch/2) * Math.cos(yaw/2) - Math.cos(roll/2) * Math.sin(pitch/2) * Math.sin(yaw/2);
    var qy = Math.cos(roll/2) * Math.sin(pitch/2) * Math.cos(yaw/2) + Math.sin(roll/2) * Math.cos(pitch/2) * Math.sin(yaw/2);
    var qz = Math.cos(roll/2) * Math.cos(pitch/2) * Math.sin(yaw/2) - Math.sin(roll/2) * Math.sin(pitch/2) * Math.cos(yaw/2);
    var qw = Math.cos(roll/2) * Math.cos(pitch/2) * Math.cos(yaw/2) + Math.sin(roll/2) * Math.sin(pitch/2) * Math.sin(yaw/2);
    return new Quaternion(qx, qy, qz, qw);
  };

  static eulerVector(v) {
    return Quaternion.euler(v.x, v.y, v.z);
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

  static angleAxis(angle, axis) {
    return new Quaternion(
      axis.x * Math.sin(angle / 2),
      axis.y * Math.sin(angle / 2),
      axis.z * Math.sin(angle / 2),
      Math.sin(angle / 2)
    );
  }

  static fromMatrix(m) {
    var trace = Matrix.get(m, 0, 0) + Matrix.get(m, 1, 1) + Matrix.get(m, 2, 2);
    if (trace > 0) {
      var s = 0.5 / Math.sqrt(trace + 1);
      return new Quaternion(
        (Matrix.get(m, 2, 1) - Matrix.get(m, 1, 2)) * s,
        (Matrix.get(m, 0, 2) - Matrix.get(m, 2, 0)) * s,
        (Matrix.get(m, 1, 0) - Matrix.get(m, 0, 1)) * s,
        0.25 / s
      );
    }
    else {
      if (Matrix.get(m, 0, 0) > Matrix.get(m, 1, 1) && Matrix.get(m, 0, 0) > Matrix.get(m, 2, 2)) {
        var s = 2 * Math.sqrt(1 + Matrix.get(m, 0, 0) - Matrix.get(m, 1, 1) - Matrix.get(m, 2, 2));
        return new Quaternion(
          0.25 * s,
          (Matrix.get(m, 0, 1) + Matrix.get(m, 1, 0)) / s,
          (Matrix.get(m, 0, 2) + Matrix.get(m, 2, 0)) / s,
          (Matrix.get(m, 2, 1) - Matrix.get(m, 1, 2)) / s,
        );
      }
      else if (Matrix.get(m, 1, 1) > Matrix.get(m, 2, 2)) {
        var s = 2 * Math.sqrt(1 + Matrix.get(m, 1, 1) - Matrix.get(m, 0, 0) - Matrix.get(m, 2, 2));
        return new Quaternion(
          (Matrix.get(m, 0, 1) + Matrix.get(m, 1, 0)) / s,
          0.25 * s,
          (Matrix.get(m, 1, 2) + Matrix.get(m, 2, 1)) / s,
          (Matrix.get(m, 0, 2) + Matrix.get(m, 2, 0)) / s
        );
      }
      else {
        var s = 2 * Math.sqrt(1 + Matrix.get(m, 2, 2) - Matrix.get(m, 0, 0) - Matrix.get(m, 1, 1));
        return new Quaternion(
          (Matrix.get(m, 0, 2) + Matrix.get(m, 2, 0)) / s,
          (Matrix.get(m, 1, 2) + Matrix.get(m, 2, 1)) / s,
          0.25 * s,
          (Matrix.get(m, 1, 0) + Matrix.get(m, 0, 1)) / s
        );
      }
    }
  }
}