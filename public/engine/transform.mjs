import Vector from "./vector.mjs";
import Quaternion from "./quaternion.mjs";
import Matrix from "./matrix.mjs";
import { EventHandler } from "./eventHandler.mjs";

function Transform(matrix, position, rotation, scale) {
  var _this = this;
  this.gameObject = null;

  this.eventHandler = new EventHandler();
  this.on = this.eventHandler.on.bind(this.eventHandler);

  this._hasChanged = {
    matrix: false,
    worldMatrix: false
  };

  // Object pool
  var _m = Matrix.identity();
  // -----------

  var _matrix = Matrix.identity();
  var _worldMatrix = Matrix.identity();
  var _translationMatrix = Matrix.identity();
  var _rotationMatrix = Matrix.identity();
  var _scaleMatrix = Matrix.identity();

  var _position = position ?? Vector.zero();
  var _rotation = rotation ?? Quaternion.identity();
  var _scale = scale ?? Vector.one();

  var _positionProxy = createProxy(_position, everythingHasChanged);
  var _rotationProxy = createProxy(_rotation, everythingHasChanged);
  var _scaleProxy = createProxy(_scale, everythingHasChanged);

  var _lastPosition = Vector.copy(_position);
  var _lastRotation = Quaternion.copy(_rotation);
  var _lastScale = Vector.copy(_scale);

  if (matrix != null) {
    setMatrix(matrix);
  }
  else {
    setMatrixFromTRS();
  }

  this.set = function(target) {
    this.matrix = target.matrix;
  };

  Object.defineProperty(this, "position", {
    get: function() {
      return _positionProxy;
    },
    set: function(val) {
      if (Vector.isVectorIsh(val)) {
        if (Vector.equal(val, _lastPosition)) {
          return;
        }

        if (Vector.isNaN(val)) {
          console.error("Position is NaN: ", val);
          return;
        }

        // everythingHasChanged();
        // _position = val;

        _positionProxy.x = val.x;
        _positionProxy.y = val.y;
        _positionProxy.z = val.z;

        Vector.set(_lastPosition, val);
        // _lastPosition = Vector.copy(val);
      }
      else {
        console.warn("Position is not vector", val);
      }
    }
  });

  Object.defineProperty(this, "worldPosition", {
    get: function() {
      return Matrix.getPosition(_this.worldMatrix);
    },
    set: function() {
      // bruh do this
      throw new Error("Can't set world position");
    }
  });

  // bruh doesnt detect component change
  Object.defineProperty(this, "rotation", {
    get: function() {
      return _rotationProxy;
    },
    set: function(val) {
      if (Quaternion.isQuaternionIsh(val)) {
        if (Quaternion.equal(val, _lastRotation)) {
          return;
        }

        if (Quaternion.isNaN(val)) {
          console.error("Rotation is NaN: ", val);
          return;
        }

        // everythingHasChanged();

        _rotationProxy.x = val.x;
        _rotationProxy.y = val.y;
        _rotationProxy.z = val.z;
        _rotationProxy.w = val.w;

        // _rotation = val;
        Matrix.fromQuaternion(_rotation, _rotationMatrix);
        // _rotationMatrix = Matrix.fromQuaternion(_rotation);

        Quaternion.set(_lastRotation, val);
        // _lastRotation = Quaternion.copy(val);
      }
      else {
        console.warn("Rotation is not quaternion", val);
      }
    }
  });

  Object.defineProperty(this, "scale", {
    get: function() {
      return _scaleProxy;
    },
    set: function(val) {
      if (Vector.isVectorIsh(val)) {
        if (Vector.equal(val, _lastScale)) {
          return;
        }

        if (Vector.isNaN(val)) {
          console.error("Scale is NaN: ", val);
          return;
        }

        // everythingHasChanged();
        // _scale = val;

        _scaleProxy.x = val.x;
        _scaleProxy.y = val.y;
        _scaleProxy.z = val.z;

        Vector.set(_lastScale, val);
        // _lastScale = Vector.copy(val);
      }
      else {
        console.warn("Scale is not vector", val);
      }
    }
  });

  // bruh calling matrix[x][y] = val is not detected
  Object.defineProperty(this, "matrix", {
    get: function() {
      if (_this._hasChanged.matrix) {
        _this._hasChanged.matrix = false;
        setMatrixFromTRS();
      }

      return _matrix;
    },
    set: function(val) {
      everythingHasChanged();
      setMatrix(val);
    }
  });

  // bruh update parent world matrix too
  Object.defineProperty(this, "worldMatrix", {
    get: function() {
      if (_this._hasChanged.worldMatrix) {
        _this._hasChanged.worldMatrix = false;
        updateRealWorldMatrix();
        // _worldMatrix = getRealWorldMatrix();
        // _worldMatrix = _this.getWorldMatrix();
      }

      return _worldMatrix;
    },
    set: function(val) {
      if (Matrix.isNaN(val)) {
        console.error("World matrix is NaN: ", val);
        return;
      }

      const inv = Matrix.inverse(_this.gameObject.parent.transform.worldMatrix);
      Matrix.multiply(inv, val, _this.matrix);

      // var m = Matrix.multiply(Matrix.inverse(_this.gameObject.parent.transform.worldMatrix), val);
      // _this.matrix = m;
    }
  });

  Object.defineProperty(this, "translationMatrix", {
    get: function() {
      return _translationMatrix;
    }
  });

  Object.defineProperty(this, "rotationMatrix", {
    get: function() {
      return _rotationMatrix;
    },
    set: function(val) {
      if (Matrix.isNaN(val)) {
        console.error("Rotation matrix is NaN: ", val);
        return;
      }

      everythingHasChanged();

      Quaternion.fromMatrix(val, _rotation);
      Matrix.copy(val, _rotationMatrix);
    }
  });

  Object.defineProperty(this, "scaleMatrix", {
    get: function() {
      return _scaleMatrix;
    }
  });

  // bruh optimize (maybe???)
  Object.defineProperty(this, "forward", {
    get: function() {
      return Matrix.getForward(_this.worldMatrix);
    }
  });
  Object.defineProperty(this, "up", {
    get: function() {
      return Matrix.getUp(_this.worldMatrix);
    }
  });

  function everythingHasChanged() {
    if (_this.gameObject) {
      _this.gameObject.traverse(o => {
        o.transform._hasChanged.matrix = true;
        o.transform._hasChanged.worldMatrix = true;
      });
      _this.gameObject.traverse(o => { // why does this not fix it :(
        // o.transform.onTransformChange?.();
        o.transform.eventHandler.fireEvent("transformChange");
      });
    }
    else {
      _this._hasChanged.matrix = true;
      _this._hasChanged.worldMatrix = true;
      // _this.onTransformChange?.();
      _this.eventHandler.fireEvent("transformChange");
    }
  }

  function setMatrixFromTRS() {
    Matrix.translate(_position, _m);
    Matrix.multiply(_m, _rotationMatrix, _m);
    Matrix.transform([
      ["scale", _scale]
    ], _m);

    setMatrix(_m, false);

    // setMatrix(Matrix.transform([
    //   ["translate", _position],
    //   ["rz", _rotation.z],
    //   ["ry", _rotation.y],
    //   ["rx", _rotation.x],
    //   ["scale", _scale]
    // ]), false);
  }

  function setMatrix(m, setTRS = true) {
    if (Matrix.isNaN(m)) {
      console.error("Matrix is NaN: ", m);
      return;
    }

    Matrix.copy(m, _matrix);
    Matrix.getTranslationMatrix(_matrix, _translationMatrix);
    Matrix.getRotationMatrix(_matrix, _rotationMatrix);
    Matrix.getScaleMatrix(_matrix, _scaleMatrix);

    if (setTRS) {
      Matrix.getPosition(_matrix, _positionProxy);
      Quaternion.fromMatrix(_matrix, _rotationProxy);
      Matrix.getScale(_matrix, _scaleProxy);

      Vector.set(_lastPosition, _positionProxy);
      Quaternion.set(_lastRotation, _rotationProxy);
      Vector.set(_lastScale, _scaleProxy);

      // setProxyVector(_positionProxy, Matrix.getPosition(_matrix));
      // setProxyQuat(_rotationProxy, Quaternion.fromMatrix(_matrix));
      // setProxyVector(_scaleProxy, Matrix.getScale(_matrix));

      // _lastPosition = Vector.copy(_positionProxy);
      // _lastRotation = Quaternion.copy(_rotationProxy);
      // _lastScale = Vector.copy(_scaleProxy);
    }

    _this.onUpdateMatrix?.(_matrix);
  }

  function updateRealWorldMatrix() {
    if (_this.gameObject && _this.gameObject.parent) {
      Matrix.multiply(_this.gameObject.parent.transform.worldMatrix, _this.matrix, _worldMatrix);
    }
    else {
      Matrix.copy(_this.matrix, _worldMatrix);
    }
  }

  this.getWorldMatrix = function(stopParent) {
    if (this.gameObject && this.gameObject.parent && this.gameObject.parent != stopParent) {
      var m = Matrix.multiply(this.gameObject.parent.transform.getWorldMatrix(stopParent), this.matrix);
      return m;
    }

    return this.matrix;
  };

  // function setProxyVector(p, v) {
  //   p.x = v.x;
  //   p.y = v.y;
  //   p.z = v.z;
  // }

  // function setProxyQuat(p, q) {
  //   p.x = q.x;
  //   p.y = q.y;
  //   p.z = q.z;
  //   p.w = q.w;
  // }

  function createProxy(obj, callback = () => {}) {
    return new Proxy(obj, {
      set: function(obj, prop, value) {
        if (prop == "x" || prop == "y" || prop == "z" || prop == "w") {
          if (isNaN(value)) {
            console.error("Proxy property " + prop + " is NaN", obj, prop, value);
            return true; // Returning false here will throw an error and stop program. I want to log an error and keep running :)
          }
          obj[prop] = value;
          callback?.();
          // everythingHasChanged();
        }
        else {
          obj[prop] = value;
        }
        
        return true;
      },
      get: function() {
        return Reflect.get(...arguments);
      }
    });
  }
}

export {
  Transform
};