import Vector from "./vector.mjs";
import { clamp } from "./helper.mjs";

function AnimationBlend(blendCoords = []) {
  this.x = 0;
  this.y = 0;
  this.z = 0;
  this.blendCoords = blendCoords;

  const _getUnnormalizedWeight = (animation) => {
    const coords = this.blendCoords.filter(o => {
      return o.animation == animation;
    });

    let max = 0;
    for (const coord of coords) {
      const d = Vector.distance(new Vector(this.x, this.y, this.z), coord.coords);
      const weight =  clamp(1 - d, 0, 1);
      max = Math.max(max, weight);
    }

    return max;
  };

  const _getTotalWeight = () => {
    const uniqueAnimations = Array.from(new Set(this.blendCoords.map(b => b.animation)));
    const totalWeight = uniqueAnimations.reduce((total, anim) => total + _getUnnormalizedWeight(anim), 0);
    return totalWeight;
  };

  this.getWeight = function(animation) {
    return _getUnnormalizedWeight(animation) / _getTotalWeight();
  };

  this.copy = function() {
    return new AnimationBlend();
  };
}

export {
  AnimationBlend
};