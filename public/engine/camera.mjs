import { Transform } from "./transform.mjs";
import Matrix from "./matrix.mjs";

function Camera(settings = {}) {
  var _this = this;
  this.layer = settings.layer ?? 0b1111111111111111;
  this.renderTexture = settings.renderTexture ?? null;
  
  this.transform = new Transform(null, settings.position, settings.rotation);
  this.aspect = 1;
  var _fov = settings.fov ?? 45;

  this.type = settings.type ?? Camera.Type.Perspective;
  if (this.type == Camera.Type.Perspective) {
    this.projectionMatrix = Matrix.perspective({
      fov: _fov * Math.PI / 180,
      aspect: this.aspect,
      near: settings.near ?? 0.3,
      far: settings.far ?? 100
    });
  }
  else if (this.type == Camera.Type.Orthographic) {
    this.projectionMatrix = Matrix.orthographic({
      size: settings.size ?? 20,
      near: settings.near ?? 0.3,
      far: settings.far ?? 100
    });
  }
  var _viewMatrix = Matrix.identity();
  this.prevViewMatrix = Matrix.identity();

  function onUpdateMatrix() {
    Matrix.inverse(_this.transform.matrix, _viewMatrix);
  }

  this.transform.onUpdateMatrix = onUpdateMatrix;
  onUpdateMatrix();

  Object.defineProperty(this, "cameraMatrix", {
    get: function() {
      return _this.transform.matrix;
    }
  });
  Object.defineProperty(this, "inverseViewMatrix", {
    get: function() {
      return _this.transform.matrix;
    }
  });
  Object.defineProperty(this, "viewMatrix", {
    get: function() {
      if (_this.transform._hasChanged.matrix || _this.transform._hasChanged.worldMatrix) {
        Matrix.inverse(_this.transform.matrix, _viewMatrix);
      }
      return _viewMatrix;
    }
  });

  this.setAspect = function(aspect) {
    if (this.type == Camera.Type.Perspective) {
      this.aspect = aspect;
      Matrix.perspective({fov: _fov * Math.PI / 180, aspect: this.aspect, near: settings.near ?? 0.3, far: settings.far ?? 100}, this.projectionMatrix);
    }
    else {
      console.warn("Can't set aspect ratio of orthographic camera");
    }
  };

  this.setFOV = function(fov) {
    if (this.type == Camera.Type.Perspective) {
      if (fov != _fov) {
        _fov = fov;
        Matrix.setPerspectiveFov(this.projectionMatrix, this.aspect, _fov * Math.PI / 180);
      }
    }
    else {
      console.warn("Can't set FOV of orthographic camera");
    }
  };

  this.getFOV = function() {
    return _fov;
  };
}

Camera.Type = {
  Perspective: 0,
  Orthographic: 1,
};

export {
  Camera
};