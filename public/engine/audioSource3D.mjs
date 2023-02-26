function AudioSource3D(listener, url, position = {x: 0, y: 0, z: 0}) {
  const pannerModel = "HRTF";

  const distanceModel = "exponential";
  const maxDistance = 30;
  const refDistance = 1;
  const rollOff = 1;
 
  const innerCone = 360;
  const outerCone = 360;
  const outerGain = 0;

  const orientationX = 0.0;
  const orientationY = 0.0;
  const orientationZ = -1.0;

  this.panner = new PannerNode(listener.audioContext, {
    panningModel: pannerModel,
    distanceModel: distanceModel,
    positionX: position.x,
    positionY: position.y,
    positionZ: position.z,
    orientationX: orientationX,
    orientationY: orientationY,
    orientationZ: orientationZ,
    refDistance: refDistance,
    maxDistance: maxDistance,
    rolloffFactor: rollOff,
    coneInnerAngle: innerCone,
    coneOuterAngle: outerCone,
    coneOuterGain: outerGain
  });

  this.audioElement = document.createElement("audio");
  this.audioElement.src = url;

  const track = listener.audioContext.createMediaElementSource(this.audioElement);
  track.connect(this.panner).connect(listener.audioContext.destination);

  this.setPosition = function(pos) {
    this.panner.positionX.value = pos.x;
    this.panner.positionY.value = pos.y;
    this.panner.positionZ.value = pos.z;
  };

  this.play = function() {
    this.audioElement.play();
  };
  this.pause = function() {
    this.audioElement.pause();
  };
}

export {
  AudioSource3D
};