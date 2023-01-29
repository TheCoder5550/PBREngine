function GamepadManager() {
  this.gamepads = {};

  var keysDown = [];
  var keysUp = [];

  this.buttonNames = {
    A: 0,
    B: 1,
    X: 2,
    Y: 3,
    LB: 4,
    RB: 5,
    LT: 6,
    RT: 7,
    Back: 8,
    Menu: 9,
    LS: 10,
    RS: 11,
    DPUp: 12,
    DPDown: 13,
    DPLeft: 14,
    DPRight: 15
  };

  this.axesNames = {
    LSHorizontal: 0,
    LSVertical: 1,
    RSHorizontal: 2,
    RSVertical: 3
  }

  window.addEventListener("gamepadconnected", e => {
    console.log("Gamepad connected at index %d: %s. %d buttons, %d axes.",
      e.gamepad.index, e.gamepad.id,
      e.gamepad.buttons.length, e.gamepad.axes.length, e.gamepad);

    this.gamepads[e.gamepad.index] = e.gamepad;
  });

  window.addEventListener("gamepaddisconnected", e => {
    console.log("Gamepad disconnected from index %d: %s",
      e.gamepad.index, e.gamepad.id);

    delete this.gamepads[e.gamepad.index];
  });

  this.getGamepad = function(gamepadIndex) {
    var currentGamepad = gamepadIndex ?? this.gamepads[Object.keys(this.gamepads)[0]]?.index;
    if (currentGamepad != null) {
      return navigator.getGamepads()[currentGamepad];
    }

    return false;
  }

  this.nameToIndex = function(name, nameList) {
    return nameList[name] ?? name;
  }

  this.getButtonName = function(index) {
    return Object.keys(this.buttonNames).find(key => this.buttonNames[key] === index);
  }

  this.getButton = function(button, gamepadIndex) {
    var gamepad = this.getGamepad(gamepadIndex);
    if (gamepad) {
      var buttonIndex = this.nameToIndex(button, this.buttonNames);
      return gamepad.buttons[buttonIndex]?.value;
    }

    return null;
  }

  this.getButtons = function(gamepadIndex) {
    var gamepad = this.getGamepad(gamepadIndex);
    if (gamepad) {
      var indices = [];
      for (var i = 0; i < gamepad.buttons.length; i++) {
        if (gamepad.buttons[i].value) {
          indices.push(i);
        }
      }
      return indices;
    }

    return [];
  }

  this.getButtonDown = function(button, gamepadIndex, uniqueID = "") {
    var b = this.getButton(button, gamepadIndex);
    var index = this.nameToIndex(button, this.buttonNames);
    if (b) {
      if (keysDown[index + uniqueID]) {
        keysDown[index + uniqueID] = false;
        return b;
      }
    }
    else {
      keysDown[index + uniqueID] = true;
    }
  }

  this.getButtonUp = function(button, gamepadIndex, uniqueID = "") {
    var b = this.getButton(button, gamepadIndex);
    var index = this.nameToIndex(button, this.buttonNames);
    if (!b) {
      if (keysUp[index + uniqueID]) {
        keysUp[index + uniqueID] = false;
        return 1 - b;
      }
    }
    else {
      keysUp[index + uniqueID] = true;
    }
  }

  this.getAxis = function(axis, gamepadIndex) {
    var gamepad = this.getGamepad(gamepadIndex);
    if (gamepad) {
      var axisIndex = this.nameToIndex(axis, this.axesNames);
      return gamepad.axes[axisIndex];
    }

    return null;
  }

  this.vibrate = function(duration, weakMagnitude = 0.5, strongMagnitude = 0.5, gamepadIndex) {
    var gamepad = this.getGamepad(gamepadIndex);
    if (gamepad) {
      gamepad.vibrationActuator?.playEffect?.("dual-rumble", {
        duration: duration,
        strongMagnitude: strongMagnitude,
        weakMagnitude: weakMagnitude 
      }).then(() => {

      }).catch(err => console.log(err));
    }
  }
}

function deadZone(x, zone = 0.1) {
  if (Math.abs(x) < zone) {
    return 0;
  }

  return x;
}

function quadraticCurve(x) {
  return Math.abs(x) * x;
}

export default GamepadManager;
export {
  deadZone,
  quadraticCurve,
};