import { clamp, inverseLerp, lerp, mod } from "./helper.mjs";

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
  }

  var wrap = (t) => {
    if (this.wrapMode == LerpCurve.WrapModes.Clamp) {
      return clamp(t, lower, upper);
    }
    else if (this.wrapMode == LerpCurve.WrapModes.Repeat) {
      return mod(t - lower, upper - lower) + lower;
    }

    return clamp(t, lower, upper);
  }

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
  }
}

LerpCurve.WrapModes = {
  Clamp: 0,
  Repeat: 1,
}

export {
  LerpCurve
};