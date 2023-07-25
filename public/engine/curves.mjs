import Vector from "./vector.mjs";
import { clamp, inverseLerp, lerp, mod, wrap } from "./helper.mjs";

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

  this.distanceToPoint = function(p) {
    var d = this.distanceSqrToPoint(p);
    return {
      distance: Math.sqrt(d.distance),
      point: d.point,
    };
  };

  this.distanceSqrToPoint = function(p) {
    var closestDistance = Infinity;
    var closestPoint;

    for (var segment of segments) {
      var d = segment.distanceSqrToPoint(p);
      if (d.distance < closestDistance) {
        closestDistance = d.distance;
        closestPoint = d.point;
      }
    }

    return {
      distance: closestDistance,
      point: closestPoint,
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
}

function CatmullRomSegment(p0, p1, p2, p3, alpha = 0.5) {
  this.p0 = p0;
  this.p1 = p1;
  this.p2 = p2;
  this.p3 = p3;
  this.alpha = alpha;

  this.distanceToPoint = function(p) {
    var d = this.distanceSqrToPoint(p);
    return {
      distance: Math.sqrt(d.distance),
      point: d.point
    };
  };

  this.distanceSqrToPoint = function(p) {
    // var closestDistance = Infinity;
    // var closestPoint;

    var projP = Vector.copy(p);
    projP.y = 0;

    var d;
    var step = 0.5;
    var start = 0;
    var end = 1;
    while (step >= 0.095) {
      d = this._getClosestDistanceInRange(projP, start, end, step);
      start = d.t - step;
      end = d.t + step;
      step /= 2;
    }

    return {
      distance: d.distance,
      point: d.point,
      t: d.t,
    };
  };

  this._getClosestDistanceInRange = function(projP, start, end, step) {
    var closestDistance = Infinity;
    var closestPoint;
    var closestT;

    start = Math.max(0, start);
    end = Math.min(1, end);

    for (var t = start; t <= end; t += step) {
      var curvePoint = this.getPoint(t);

      var d = Vector.distanceSqr(projP, new Vector(curvePoint.x, 0, curvePoint.z));
      if (d < closestDistance) {
        closestDistance = d;
        closestPoint = curvePoint;
        closestT = t;
      }
    }

    return {
      distance: closestDistance,
      point: closestPoint,
      t: closestT,
    };
  };

  this.getPoint = function(t) {
    var k0 = 0;
    var k1 = GetKnotInterval(this.p0, this.p1);
    var k2 = GetKnotInterval(this.p1, this.p2) + k1;
    var k3 = GetKnotInterval(this.p2, this.p3) + k2;

    var u = lerp(k1, k2, t);
    var A1 = Remap(k0, k1, this.p0, this.p1, u);
    var A2 = Remap(k1, k2, this.p1, this.p2, u);
    var A3 = Remap(k2, k3, this.p2, this.p3, u);
    var B1 = Remap(k0, k2, A1, A2, u);
    var B2 = Remap(k1, k3, A2, A3, u);

    return Remap(k1, k2, B1, B2, u);
  };

  function Remap(a, b, c, d, u) {
    return Vector.lerp(c, d, (u - a) / (b - a));
  }

  function GetKnotInterval(a, b) {
    return Math.pow(Vector.distanceSqr(a, b), alpha / 2);
  }
}