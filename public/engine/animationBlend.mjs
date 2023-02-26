import Vector from "./vector.mjs";
import { clamp } from "./helper.mjs";

function AnimationBlend(blendCoords = []) {
  this.x = 0;
  this.y = 0;
  this.z = 0;
  this.blendCoords = blendCoords;

  this.getWeight = function(animation) {
    var coords = this.blendCoords.find(o => {
      return o.animation == animation;
    });

    if (coords) {
      var d = Vector.distance(new Vector(this.x, this.y, this.z), coords.coords);
      return clamp(1 - d, 0, 1) / this.getWeightSum();
    }

    return 0;
  };
  
  this.getWeightSum = function() {
    var sum = 0;
    for (var coords of this.blendCoords) {
      var d = Vector.distance(new Vector(this.x, this.y, this.z), coords.coords);
      sum += clamp(1 - d, 0, 1);
    }
    return sum;
  };
}

export {
  AnimationBlend
};