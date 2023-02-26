function EventHandler() {
  this.events = {};

  this.addEvent = this.on = function(name, func) {
    if (typeof func != "function") {
      throw new Error("[EventHandler]: Not a function");
    }

    if (this.events[name]) {
      this.events[name].functions.push(func);
    }
    else {
      this.events[name] = {
        functions: [ func ]
      };
    }
  };

  this.removeEvent = function(name, func) {
    var event = this.events[name];
    if (!event) return;

    var index = event.functions.indexOf(func);
    if (index === -1) return;

    event.functions.splice(index, 1);
  };

  this.fireEvent = function(name, ...args) {
    if (this.events[name]) {
      for (var func of this.events[name].functions) {
        func(...args);
      }
      return true;
    }

    return false;
  };
}

export {
  EventHandler
};