function Keybindings(renderer, gamepadManager, bindings = {
  "vertical": {
    keyboard: ["KeyW", "KeyS"],
    controller: "LSVertical"
  },
  "horizontal": {
    keyboard: ["KeyA", "KeyD"],
    controller: "LSHorizontal"
  }
}) {
  this.gamepadManager = gamepadManager;

  this.setBindings = function(newBindings = {}) {
    bindings = newBindings;
  };

  this.setBinding = function(name, inputs = {}) {
    bindings[name] = inputs;
  };

  this.getInput = function(name) {
    if (bindings[name]) {
      var keyboardValue = 0;
      if (Array.isArray(bindings[name].keyboard)) {
        var a = renderer.getKey(bindings[name].keyboard[0]) ? 1 : 0;
        var b = renderer.getKey(bindings[name].keyboard[1]) ? 1 : 0;
        keyboardValue = b - a;
      }
      else {
        keyboardValue = renderer.getKey(bindings[name].keyboard) ? 1 : 0;
      }

      var controllerValue = this.gamepadManager.getButton(bindings[name].controller) ?? this.gamepadManager.getAxis(bindings[name].controller) ?? 0;

      return Math.abs(keyboardValue) > Math.abs(controllerValue) ? keyboardValue : controllerValue;
    }

    // throw new Error("Invalid keybinding name: " + name);
  };

  this.getInputDown = function(name) {
    if (bindings[name]) {
      var keyboardValue = 0;
      if (Array.isArray(bindings[name].keyboard)) {
        var a = renderer.getKeyDown(bindings[name].keyboard[0]) ? 1 : 0;
        var b = renderer.getKeyDown(bindings[name].keyboard[1]) ? 1 : 0;
        keyboardValue = b - a;
      }
      else {
        keyboardValue = renderer.getKeyDown(bindings[name].keyboard) ? 1 : 0;
      }

      var controllerValue = this.gamepadManager.getButtonDown(bindings[name].controller) ?? this.gamepadManager.getAxis(bindings[name].controller) ?? 0;

      return Math.abs(keyboardValue) > Math.abs(controllerValue) ? keyboardValue : controllerValue;
    }

    // throw new Error("Invalid keybinding name: " + name);
  };
}

export default Keybindings;