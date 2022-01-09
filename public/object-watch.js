/*
 * object.watch polyfill
 *
 * 2012-04-03
 *
 * By Eli Grey, http://eligrey.com
 * Public Domain.
 * NO WARRANTY EXPRESSED OR IMPLIED. USE AT YOUR OWN RISK.
 */

// object.watch
if (!Object.prototype.watch) {
	Object.defineProperty(Object.prototype, "watch", {
		  enumerable: false,
      configurable: true,
      writable: false,
      value: function (prop, handler) {
        var oldval = this[prop];
        var newval = oldval;
        
        var getter = function() {
          return newval;
        }
        var setter = function(val) {
          oldval = newval;
          return newval = handler.call(this, prop, oldval, val);
        }
        
        if (delete this[prop]) { // can't watch constants
          Object.defineProperty(this, prop, {
              get: getter,
              set: setter,
              enumerable: true,
              configurable: true
          });
        }
        else {
          console.log("Watch not working on this variable!")
        }
		  }
	});
}

// object.unwatch
if (!Object.prototype.unwatch) {
	Object.defineProperty(Object.prototype, "unwatch", {
		  enumerable: false
		, configurable: true
		, writable: false
		, value: function (prop) {
			var val = this[prop];
			delete this[prop]; // remove accessors
			this[prop] = val;
		}
	});
}