import Vector from "./vector.mjs";
import { clamp, inverseLerp, lerp, mod, wrap } from "./helper.mjs";
import { ClosestPointOnLineSegment } from "./algebra.mjs";

function LerpCurve() {
  this.wrapMode = LerpCurve.WrapModes.Clamp;
  
  var stages = [];
  var lower = Infinity;
  var upper = -Infinity;

  this.addStage = function(t, value) {
    if (stages.some(s => s.t == t)) {
      console.warn("Time " + t + " already has a value!");
      return;
    }

    stages.push({t, value});

    stages.sort((a, b) => {
      return a.t - b.t;
    });

    lower = Math.min(lower, stages[0].t);
    upper = Math.max(upper, stages[stages.length - 1].t);
  };

  var wrap = (t) => {
    if (this.wrapMode == LerpCurve.WrapModes.Clamp) {
      return clamp(t, lower, upper);
    }
    else if (this.wrapMode == LerpCurve.WrapModes.Repeat) {
      return mod(t - lower, upper - lower) + lower;
    }

    return clamp(t, lower, upper);
  };

  this.getValue = function(t) {
    if (stages.length == 0) {
      return 0;
    }

    t = wrap(t);

    var lowerStage = stages[0];
    var upperStage = stages[1];
    for (var i = 0; i < stages.length; i++) {
      if (t >= stages[i].t) {
        lowerStage = stages[i];
        upperStage = stages[Math.min(stages.length - 1, i + 1)];
      }
    }

    var valueT = inverseLerp(lowerStage.t, upperStage.t, t);
    return lerp(lowerStage.value, upperStage.value, valueT);
  };
}

LerpCurve.WrapModes = {
  Clamp: 0,
  Repeat: 1,
};

export { LerpCurve };

export function BezierCurve(points) {
  this.points = points;

  this.getPoint = function(t) {
    return bezierRecursive(this.points, t);
  };

  var bezierRecursive = (points, t) => {
    if (points.length <= 1) return points[0];

    var newPoints1 = [...points];
    var newPoints2 = [...points];
    newPoints1.pop();
    newPoints2.shift();
    
    var p1 = bezierRecursive(newPoints1, t);
    var p2 = bezierRecursive(newPoints2, t);

    return {
      x: (1 - t) * p1.x + t * p2.x,
      y: (1 - t) * p1.y + t * p2.y,
      z: (1 - t) * p1.z + t * p2.z
    };
  };
}

export function CatmullRomCurve(points, alpha = 0.5, loop = false) {
  this.alpha = alpha;
  this.points = points;
  this.loop = loop;
  var segments = [];

  for (var i = 0; i < points.length - (this.loop ? 0 : 3); i++) {
    segments.push(new CatmullRomSegment(
      points[(i + 0) % points.length],
      points[(i + 1) % points.length],
      points[(i + 2) % points.length],
      points[(i + 3) % points.length],
      this.alpha
    ));
  }

  this.length = 0;
  for (const segment of segments) {
    this.length += segment.length;
  }

  this.getTangent = function(t) {
    const a = this.getPoint(t);
    const b = this.getPoint(t + 0.01);
    return Vector.normalize(Vector.subtract(b, a));
  };

  this.distanceToPoint = function(p) {
    var d = this.distanceSqrToPoint(p);
    return {
      distance: Math.sqrt(d.distance),
      point: d.point,
      t: d.t
    };
  };

  this.distanceSqrToPoint = function(p) {
    let closestDistance = Infinity;
    let closestPoint;
    let closestT;

    for (let segment of segments) {
      let d = segment.distanceSqrToPoint(p);
      if (d.distance < closestDistance) {
        closestDistance = d.distance;
        closestPoint = d.point;
        closestT = this.localToGlobalT(segment, d.t);
      }
    }

    return {
      distance: closestDistance,
      point: closestPoint,
      t: closestT
    };
  };

  this.getPoint = function(t) {
    if (this.loop) {
      t = wrap(t, 1);
    }
    else {
      if (t <= 0) {
        return segments[0].getPoint(t);
      }

      if (t >= 1) {
        return segments[segments.length - 1].getPoint(t);
      }
    }

    var segment = Math.floor(t * segments.length);
    return segments[segment].getPoint((t * segments.length) % 1);
  };

  this.localToGlobalT = function(segment, localT) {
    const index = segments.indexOf(segment);
    if (index === -1) {
      return null;
    }

    return (index + localT) / segments.length;
  };
}

function CatmullRomSegment(p0, p1, p2, p3, alpha = 0.5) {
  this.p0 = p0;
  this.p1 = p1;
  this.p2 = p2;
  this.p3 = p3;
  this.alpha = alpha;

  this.startStepSize = 0.5;
  this.endStepSize = 0.03125;

  this.distanceToPoint = function(p) {
    var d = this.distanceSqrToPoint(p);
    return {
      distance: Math.sqrt(d.distance),
      point: d.point,
      t: d.t
    };
  };

  // this.distanceSqrToPoint = function(point) {
  //   const segments = 10;

  //   let closestDistance = Infinity;
  //   let closestPoint = null;

  //   let prevPointOnCurve = null;

  //   for (let i = 0; i < segments - 1; i++) {
  //     const t1 = i / (segments - 1);
  //     const t2 = (i + 1) / (segments - 1);
  //     const p1 = prevPointOnCurve ?? this.getPoint(t1);
  //     const p2 = this.getPoint(t2);
  //     const currentClosestPoint = ClosestPointOnLineSegment(p1, p2, point);
  //     const distanceSqr = Vector.distanceSqr(point, currentClosestPoint);

  //     if (distanceSqr < closestDistance) {
  //       closestDistance = distanceSqr;
  //       closestPoint = currentClosestPoint;
  //     }

  //     prevPointOnCurve = p2;
  //   }

  //   return {
  //     distance: closestDistance,
  //     point: closestPoint
  //   };
  // };

  const projP = new Vector();

  this.distanceSqrToPoint = function(p) {
    Vector.copy(p, projP);
    // projP.y = 0;

    var d;
    var step = this.startStepSize;
    var start = 0;
    var end = 1;
    while (step >= this.endStepSize) {
      d = this._getClosestDistanceInRange(projP, start, end, step);
      start = d.newStart;
      end = d.newEnd;
      step /= 2;
    }

    return {
      distance: d.distance,
      point: d.point,
      t: d.newStart,
    };
  };

  this._getClosestDistanceInRange = function(point, start, end, step) {
    let closestDistance = Infinity;
    let closestPoint = null;
    let closestT = null;

    let prevPointOnCurve = null;

    for (let i = start; i <= end - step; i += step) {
      const t1 = i;
      const t2 = i + step;
      const p1 = prevPointOnCurve ?? this.getPoint(t1);
      const p2 = this.getPoint(t2);
      const currentClosestPoint = ClosestPointOnLineSegment(p1, p2, point);
      const distanceSqr = Vector.distanceSqr(point, currentClosestPoint);

      if (distanceSqr < closestDistance) {
        closestDistance = distanceSqr;
        closestPoint = currentClosestPoint;
        closestT = t1;
      }

      prevPointOnCurve = p2;
    }

    return {
      distance: closestDistance,
      point: closestPoint,
      newStart: closestT,
      newEnd: closestT + step
    };
  };

  const A1 = new Vector();
  const A2 = new Vector();
  const A3 = new Vector();
  const B1 = new Vector();
  const B2 = new Vector();

  this.getPoint = function(t, dst) {
    dst = dst || new Vector();

    var k0 = 0;
    var k1 = GetKnotInterval(this.p0, this.p1);
    var k2 = GetKnotInterval(this.p1, this.p2) + k1;
    var k3 = GetKnotInterval(this.p2, this.p3) + k2;

    var u = lerp(k1, k2, t);

    Remap(k0, k1, this.p0, this.p1, u, A1);
    Remap(k1, k2, this.p1, this.p2, u, A2);
    Remap(k2, k3, this.p2, this.p3, u, A3);
    Remap(k0, k2, A1, A2, u, B1);
    Remap(k1, k3, A2, A3, u, B2);

    Remap(k1, k2, B1, B2, u, dst);
    return dst;
  };

  this.length = 0;

  const tempPointA = new Vector();
  const tempPointB = new Vector();
  for (let i = 0; i < 50; i++) {
    const t1 = i / 50;
    const t2 = (i + 1) / 50;

    this.getPoint(t1, tempPointA);
    this.getPoint(t2, tempPointB);

    this.length += Vector.distance(tempPointA, tempPointB);
  }

  function Remap(a, b, c, d, u, dst) {
    return Vector.lerp(c, d, (u - a) / (b - a), dst);
  }

  function GetKnotInterval(a, b) {
    return Math.pow(Vector.distanceSqr(a, b), alpha / 2);
  }
}