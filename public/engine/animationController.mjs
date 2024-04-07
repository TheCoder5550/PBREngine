import { AnimationBlend } from "./animationBlend.mjs";
import { AnimationData } from "./animationData.mjs";
import Vector from "./vector.mjs";
import Quaternion from "./quaternion.mjs";
import { inverseLerp } from "./helper.mjs";

function DefaultWeightsHandler() {
  this.weights = new WeakMap();

  this.getWeight = function(animation) {
    var w = this.weights.get(animation);
    if (typeof w !== "undefined") {
      return w;
    }

    return 0;
  };

  this.copy = function() {
    // copying WeakMap is not possible
    // so weights are not copied over
    return new DefaultWeightsHandler();
  };
}

export function AnimationController(animations = []) {
  this.updateRate = 1;
  this.updateOffset = 0;

  this.animations = animations;
  this.speed = 1;
  this.loop = false;

  this.animationTimes = new WeakMap();
  this.weightsHandler = new DefaultWeightsHandler();

  const _getAnimations = (animationOrMatchName) => {
    if (animationOrMatchName instanceof AnimationData) {
      if (!this.animations.includes(animationOrMatchName)) {
        throw new Error("Animation is not for this controller");
      }

      return [ animationOrMatchName ];
    }

    if (animationOrMatchName instanceof RegExp) {
      return this.animations.filter(animation => animation.name.match(animationOrMatchName));
    }

    if (typeof animationOrMatchName === "string") {
      const lowerName = animationOrMatchName?.toLowerCase();
      return this.animations.filter(animation => animation.name.toLowerCase().indexOf(lowerName) !== -1);
    }

    if (animationOrMatchName == undefined) {
      return this.animations;
    }

    return [];
  };

  this.copy = function() {
    const newAC = new AnimationController();
    newAC.speed = this.speed;
    newAC.loop = this.loop;
    newAC.weightsHandler = this.weightsHandler.copy();

    // if (this.weightsHandler instanceof AnimationBlend) {
    //   newAC.weightsHandler = new AnimationBlend();
    // }

    const oldToNewAnimation = new WeakMap();
    
    for (const animation of this.animations) {
      const newAnimation = animation.copy();
      oldToNewAnimation.set(animation, newAnimation);

      newAC.animationTimes.set(newAnimation, this.animationTimes.get(animation));
      newAC.animations.push(newAnimation);

      if (this.weightsHandler instanceof DefaultWeightsHandler) {
        newAC.weightsHandler.weights.set(newAnimation, this.weightsHandler.weights.get(animation) ?? 0);
      }

      // if (this.weightsHandler instanceof AnimationBlend) {
      //   newAC.weightsHandler.blendCoords.push({
      //     animation: newAnimation,
      //     coords: this.weightsHandler.blendCoords.find(o => o.animation == animation).coords
      //   });
      // }
    }

    if (this.weightsHandler instanceof AnimationBlend) {
      newAC.weightsHandler.blendCoords = this.weightsHandler.blendCoords
        .map(b => {
          const newAnimation = oldToNewAnimation.get(b.animation);

          if (!newAnimation) {
            return null;
          }

          return {
            animation: newAnimation,
            coords: Vector.copy(b.coords)
          };
        })
        .filter(b => b !== null);
    }

    return newAC;
  };

  this.update = function(dt, frameNumber) {
    // Only update every n frames
    if (frameNumber % this.updateRate !== this.updateOffset) {
      return;
    }

    dt *= this.updateRate;

    var lookup = new WeakMap();
    var keys = [];

    // for (var animation of this.animations) {
    //   for (var channel of animation.data) {
    //     channel.target.position = Vector.zero();
    //   }
    // }

    for (var animation of this.animations) {
      var newTime = (this.animationTimes.get(animation) ?? 0) + dt * this.speed * animation.speed;
      if (this.loop) {
        newTime = newTime % animation.length;
        if (newTime < 0) {
          newTime = animation.length + newTime;
        }
      }
      this.animationTimes.set(animation, newTime);

      var animationWeight = this.weightsHandler.getWeight(animation);

      if (animationWeight > 0.001 && (newTime < animation.length * 1.2 || this.loop)) {
        var animData = this.getCurrentMatrices(animation);
        for (var channel of animData) {
          if (!lookup.get(channel.target)) {
            lookup.set(channel.target, {
              position: [],
              rotation: [],
              scale: [],
              totalWeight: 0
            });

            keys.push(channel.target);
          }

          var obj = lookup.get(channel.target);
          var channelWeight = animationWeight;
          // channelWeight = Math.min(channelWeight, 1 - clamp(obj.totalWeight, 0, 1));

          // console.log(obj.totalWeight, channelWeight);
          // obj.totalWeight += channelWeight;

          if (channelWeight > 0.001) {
            if (channel.translation) {
              obj.position.push(Vector.multiply(channel.translation, channelWeight));

              // channel.target.transform.position = channel.translation;
            }
            if (channel.rotation) {
              obj.rotation.push(Quaternion.multiply(channel.rotation, channelWeight));

              // channel.target.transform.rotation = channel.rotation;
            }
            if (channel.scale) {
              obj.scale.push(Vector.multiply(channel.scale, channelWeight));

              // channel.target.transform.scale = channel.scale;
            }
          }
        }
      }
    }

    // return;

    // var t = this.getAnimationInfluence(this.animations[0]);
    for (var target of keys) {
      var o = lookup.get(target);

      if (o.position.length > 0) target.transform.position = o.position.reduce((prev, current) => Vector.add(prev, current), Vector.zero());
      if (o.rotation.length > 0) target.transform.rotation = o.rotation.reduce((prev, current) => Quaternion.add(prev, current), Quaternion.zero());
      if (o.scale.length > 0) target.transform.scale = o.scale.reduce((prev, current) => Vector.add(prev, current), Vector.zero());

      // if (o.position.length == 1) {
      //   target.transform.position = o.position[0];
      // }
      // else if (o.position.length > 1) {
      //   target.transform.position = Vector.lerp(o.position[0], o.position[1], t);
      // }

      // if (o.rotation.length == 1) {
      //   target.transform.rotation = o.rotation[0];
      // }
      // else if (o.rotation.length > 1) {
      //   target.transform.rotation = Quaternion.slerp(o.rotation[0], o.rotation[1], t);
      // }

      // if (o.scale.length == 1) {
      //   target.transform.scale = o.scale[0];
      // }
      // else if (o.scale.length > 1) {
      //   target.transform.scale = Vector.lerp(o.scale[0], o.scale[1], t);
      // }
    }
  };

  this.setTime = function(animationOrMatchName, time) {
    for (const animation of _getAnimations(animationOrMatchName)) {
      this.animationTimes.set(animation, time);
    }
  };

  this.play = function(animationOrMatchName) {
    for (const animation of _getAnimations(animationOrMatchName)) {
      this.animationTimes.set(animation, 0);
      if (this.weightsHandler instanceof DefaultWeightsHandler) {
        this.weightsHandler.weights.set(animation, 1);
      }
    }
  };

  this.getAnimations = function(animationOrMatchName) {
    return _getAnimations(animationOrMatchName);
  };

  this.getCurrentMatrices = function(animation) {
    var t = this.animationTimes.get(animation) ?? 0;

    var animData = this.getStates(animation, t);
    return animData;
  };

  this.getStates = function(animation, t) {
    var channels = animation.data;
    var output = [];

    for (var i = 0; i < channels.length; i++) {
      var channel = channels[i];
      var currentOut = {
        target: channel.target
      };

      var indexData = this.getClosestIndex(channel.inputBuffer, t);
      
      // if (true || (channel.outputBuffer[indexData.indices[0]] && channel.outputBuffer[indexData.indices[1]])) {
      if (channel.path == "translation") {
        currentOut.translation = interpolateVector(
          channel,
          indexData.indices[0],
          indexData.indices[1],
          indexData.lerpTime,
          channel.interpolation
        );
      }
      else if (channel.path == "rotation") {
        currentOut.rotation = interpolateQuaternion(
          channel,
          indexData.indices[0],
          indexData.indices[1],
          indexData.lerpTime,
          channel.interpolation
        );
      }
      else if (channel.path == "scale") {
        currentOut.scale = interpolateVector(
          channel,
          indexData.indices[0],
          indexData.indices[1],
          indexData.lerpTime,
          channel.interpolation
        );
      }
      // }

      output.push(currentOut);
    }

    return output;
  };

  this.getClosestIndex = function(arr, t) {
    // var i = arr.findIndex(a => t < a);
    // if (i !== -1) {
    //   return {
    //     indices: [i, Math.max(0, i - 1)],
    //     lerpTime: inverseLerp(arr[i], arr[Math.max(0, i - 1)], t)
    //   };
    // }

    for (var i = 0; i < arr.length; i++) {
      if (t < arr[i]) {
        return {
          indices: [i, Math.max(0, i - 1)],
          lerpTime: inverseLerp(arr[i], arr[Math.max(0, i - 1)], t)
        };
      }
    }

    return {
      indices: [arr.length - 1, arr.length - 1],
      lerpTime: 0
    };
  };
}

function interpolateVector(channel, prevIndex, nextIndex, t, mode = "LINEAR") {
  var prevPoint = channel.outputBuffer[prevIndex];
  var nextPoint = channel.outputBuffer[nextIndex];

  if (mode == "LINEAR") {
    return Vector.lerp(prevPoint, nextPoint, t);
  }
  else if (mode == "STEP") {
    return Vector.copy(nextPoint);
  }
  else if (mode == "CUBICSPLINE") {
    if (channel.inputTangents && channel.outputTangents) {
      var deltaTime = channel.inputBuffer[prevIndex] - channel.inputBuffer[nextIndex];
      var prevTangent = Vector.multiply(channel.inputTangents[prevIndex], deltaTime);
      var nextTangent = Vector.multiply(channel.outputTangents[prevIndex], deltaTime);

      t = 1 - t;
      return cubicSplineVector(nextPoint, prevTangent, prevPoint, nextTangent, t);
    }
  }

  return Vector.zero();
}

function interpolateQuaternion(channel, prevIndex, nextIndex, t, mode = "LINEAR") {
  var prevPoint = channel.outputBuffer[prevIndex];
  var nextPoint = channel.outputBuffer[nextIndex];

  if (mode == "LINEAR") {
    return Quaternion.slerp(prevPoint, nextPoint, t);
  }
  else if (mode == "STEP") {
    return Quaternion.copy(nextPoint);
  }
  else if (mode == "CUBICSPLINE") {
    if (channel.inputTangents && channel.outputTangents) {
      var deltaTime = channel.inputBuffer[prevIndex] - channel.inputBuffer[nextIndex];
      var prevTangent = Quaternion.multiply(channel.inputTangents[prevIndex], deltaTime);
      var nextTangent = Quaternion.multiply(channel.outputTangents[prevIndex], deltaTime);

      t = 1 - t;
      return cubicSplineQuaternion(nextPoint, prevTangent, prevPoint, nextTangent, t);
    }
  }

  return Quaternion.identity();
}

function cubicSplineVector(prevPoint, prevTangent, nextPoint, nextTangent, t) {
  var t2 = t * t;
  var t3 = t2 * t;

  var a = Vector.multiply(prevPoint, 2 * t3 - 3 * t2 + 1);
  var b = Vector.multiply(prevTangent, t3 - 2 * t2 + t);
  var c = Vector.multiply(nextPoint, -2 * t3 + 3 * t2);
  var d = Vector.multiply(nextTangent, t3 - t2);
  
  return Vector.add(Vector.add(a, b), Vector.add(c, d));
}

function cubicSplineQuaternion(prevPoint, prevTangent, nextPoint, nextTangent, t) {
  var t2 = t * t;
  var t3 = t2 * t;

  var a = Quaternion.multiply(prevPoint, 2 * t3 - 3 * t2 + 1);
  var b = Quaternion.multiply(prevTangent, t3 - 2 * t2 + t);
  var c = Quaternion.multiply(nextPoint, -2 * t3 + 3 * t2);
  var d = Quaternion.multiply(nextTangent, t3 - t2);
  
  return Quaternion.add(Quaternion.add(a, b), Quaternion.add(c, d));
}