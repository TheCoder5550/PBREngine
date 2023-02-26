function AudioListener3D() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  this.audioContext = new AudioContext();
  const listener = this.audioContext.listener;

  this.setPosition = function(pos) {
    if (listener.positionX) {
      listener.positionX.value = pos.x;
      listener.positionY.value = pos.y;
      listener.positionZ.value = pos.z;
    }
    else {
      listener.setPosition(pos.x, pos.y, pos.z);
    }
  };
  this.setPosition({x: 0, y: 0, z: 0});

  this.setDirection = function(forward, up) {
    if (listener.forwardX) {
      listener.forwardX.value = forward.x;
      listener.forwardY.value = forward.y;
      listener.forwardZ.value = forward.z;
      listener.upX.value = up.x;
      listener.upY.value = up.y;
      listener.upZ.value = up.z;
    }
    else {
      listener.setOrientation(forward.x, forward.y, forward.z, up.x, up.y, up.z);
    }
  };
  this.setDirection({x: 0, y: 0, z: 1}, {x: 0, y: 1, z: 0});
}

export {
  AudioListener3D
};