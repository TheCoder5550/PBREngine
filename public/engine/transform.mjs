import Vector from "./vector.mjs";
import Quaternion from "./quaternion.mjs";
import Matrix from "./matrix.mjs";

function Transform(matrix, position, rotation, scale) {
  var _this = this;
  this.gameObject = null;

  this._hasChanged = {
    matrix: false,
    worldMatrix: false
  };

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
        if (!Vector.equal(val, _lastPosition)) {
          // everythingHasChanged();
          // _position = val;

          _positionProxy.x = val.x;
          _positionProxy.y = val.y;
          _positionProxy.z = val.z;

          _lastPosition = Vector.copy(val);
        }
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
        if (!Quaternion.equal(val, _lastRotation)) {
          // everythingHasChanged();

          _rotationProxy.x = val.x;
          _rotationProxy.y = val.y;
          _rotationProxy.z = val.z;
          _rotationProxy.w = val.w;

          // _rotation = val;
          Matrix.fromQuaternion(_rotation, _rotationMatrix);
          // _rotationMatrix = Matrix.fromQuaternion(_rotation);

          _lastRotation = Quaternion.copy(val);
        }
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
        if (!Vector.equal(val, _lastScale)) {
          // everythingHasChanged();
          // _scale = val;

          _scaleProxy.x = val.x;
          _scaleProxy.y = val.y;
          _scaleProxy.z = val.z;

          _lastScale = Vector.copy(val);
        }
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
      var m = Matrix.multiply(Matrix.inverse(_this.gameObject.parent.transform.worldMatrix), val);
      _this.matrix = m;
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
      everythingHasChanged();

      _rotation = Quaternion.fromMatrix(val);
      Matrix.copy(val, _rotationMatrix);
      // _rotationMatrix = Matrix.copy(val);
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
    }
    else {
      _this._hasChanged.matrix = true;
      _this._hasChanged.worldMatrix = true;
    }
  }

  function setMatrixFromTRS() {
    var m = Matrix.translate(_position);
    Matrix.multiply(m, _rotationMatrix, m);
    Matrix.transform([
      ["scale", _scale]
    ], m);

    setMatrix(m, false);

    // setMatrix(Matrix.transform([
    //   ["translate", _position],
    //   ["rz", _rotation.z],
    //   ["ry", _rotation.y],
    //   ["rx", _rotation.x],
    //   ["scale", _scale]
    // ]), false);
  }

  function setMatrix(m, setTRS = true) {
    Matrix.copy(m, _matrix);
    Matrix.getTranslationMatrix(_matrix, _translationMatrix);
    Matrix.getRotationMatrix(_matrix, _rotationMatrix);
    Matrix.getScaleMatrix(_matrix, _scaleMatrix);

    // _matrix = m;
    // _translationMatrix = Matrix.getTranslationMatrix(_matrix);
    // _rotationMatrix = Matrix.getRotationMatrix(_matrix);
    // _scaleMatrix = Matrix.getScaleMatrix(_matrix);

    if (setTRS) {
      setProxyVector(_positionProxy, Matrix.getPosition(_matrix));
      setProxyQuat(_rotationProxy, Quaternion.fromMatrix(_matrix));
      setProxyVector(_scaleProxy, Matrix.getScale(_matrix));

      _lastPosition = Vector.copy(_positionProxy);
      _lastRotation = Quaternion.copy(_rotationProxy);
      _lastScale = Vector.copy(_scaleProxy);

      // _position = Matrix.getPosition(_matrix);
      // _rotation = Quaternion.fromMatrix(_matrix);
      // _scale = Matrix.getScale(_matrix);
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

  function setProxyVector(p, v) {
    p.x = v.x;
    p.y = v.y;
    p.z = v.z;
  }

  function setProxyQuat(p, q) {
    p.x = q.x;
    p.y = q.y;
    p.z = q.z;
    p.w = q.w;
  }

  function createProxy(obj, callback = () => {}) {
    return new Proxy(obj, {
      set: function(obj, prop, value) {
        obj[prop] = value;
        
        if (prop == "x" || prop == "y" || prop == "z" || prop == "w") {
          callback?.();
          // everythingHasChanged();
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