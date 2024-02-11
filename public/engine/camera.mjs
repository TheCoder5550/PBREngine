import { Transform } from "./transform.mjs";
import Matrix from "./matrix.mjs";
import Vector from "./vector.mjs";

/**
 * @description Creates a camera
 * @param {{
 *  position?: Vector,
 *  rotation?: Quaternion,
 *  layer?: number,
 *  renderTexture?: unknown,
 *  fov?: number,
 *  near?: number,
 *  far?: number,
 *  size?: number,
 *  type?: keyof Camera.Type
 * }} settings 
 */
function Camera(settings = {}) {
  var _this = this;
  
  this.frustum = new Frustum();
  this.transform = new Transform(null, settings.position, settings.rotation);
  this.layer = settings.layer ?? 0b1111111111111111;
  this.renderTexture = settings.renderTexture ?? null;

  var _viewMatrix = Matrix.identity();
  this.prevViewMatrix = Matrix.identity();

  this.aspect = 1;
  var _fov = settings.fov ?? 45;
  var _near = settings.near ?? 0.3;
  var _far = settings.far ?? 100;
  var _size = settings.size ?? 20;
  let _type = null;

  this.projectionMatrix = null;

  this.updateFrustum = function() {
    Matrix.getPosition(this.transform.matrix, cameraPosition);
    Matrix.getForward(this.transform.matrix, forward);
    Matrix.getUp(this.transform.matrix, up);
    Matrix.getRight(this.transform.matrix, right);

    Vector.set(frontMultFar, forward);
    Vector.multiplyTo(frontMultFar, _far);

    if (this.type == Camera.Type.Perspective) {
      const halfVSide = _far * Math.tan(_fov * Math.PI / 180);
      const halfHSide = halfVSide * this.aspect;

      // Near plane
      Vector.set(this.frustum.nearPlane.position, forward);
      Vector.multiplyTo(this.frustum.nearPlane.position, _near);
      Vector.addTo(this.frustum.nearPlane.position, cameraPosition);
      Vector.set(this.frustum.nearPlane.normal, forward);

      // Far plane
      Vector.set(this.frustum.farPlane.position, frontMultFar);
      Vector.addTo(this.frustum.farPlane.position, cameraPosition);
      Vector.set(this.frustum.farPlane.normal, forward);
      Vector.negateTo(this.frustum.farPlane.normal);

      // Right plane
      Vector.set(this.frustum.rightPlane.position, cameraPosition);
      Vector.set(_tempVector, right);
      Vector.multiplyTo(_tempVector, halfHSide);
      Vector.subtractTo(_tempVector, frontMultFar);
      Vector.cross(_tempVector, up, this.frustum.rightPlane.normal);

      // Left plane
      Vector.set(this.frustum.leftPlane.position, cameraPosition);
      Vector.set(_tempVector, right);
      Vector.multiplyTo(_tempVector, halfHSide);
      Vector.addTo(_tempVector, frontMultFar);
      Vector.cross(_tempVector, up, this.frustum.leftPlane.normal);

      // Top plane
      Vector.set(this.frustum.topPlane.position, cameraPosition);
      Vector.set(_tempVector, up);
      Vector.multiplyTo(_tempVector, halfVSide);
      Vector.subtractTo(_tempVector, frontMultFar);
      Vector.cross(right, _tempVector, this.frustum.topPlane.normal);

      // Bottom plane
      Vector.set(this.frustum.bottomPlane.position, cameraPosition);
      Vector.set(_tempVector, up);
      Vector.multiplyTo(_tempVector, halfVSide);
      Vector.addTo(_tempVector, frontMultFar);
      Vector.cross(right, _tempVector, this.frustum.bottomPlane.normal);

      Vector.normalizeTo(this.frustum.rightPlane.normal);
      Vector.normalizeTo(this.frustum.leftPlane.normal);
      Vector.normalizeTo(this.frustum.topPlane.normal);
      Vector.normalizeTo(this.frustum.bottomPlane.normal);

      Vector.negateTo(this.frustum.leftPlane.normal);
      Vector.negateTo(this.frustum.rightPlane.normal);
      Vector.negateTo(this.frustum.topPlane.normal);
      Vector.negateTo(this.frustum.bottomPlane.normal);
    }
    else if (this.type == Camera.Type.Orthographic) {
      // Near plane
      Vector.set(this.frustum.nearPlane.position, forward);
      Vector.multiplyTo(this.frustum.nearPlane.position, _near);
      Vector.addTo(this.frustum.nearPlane.position, cameraPosition);
      Vector.set(this.frustum.nearPlane.normal, forward);

      // Far plane
      Vector.set(this.frustum.farPlane.position, frontMultFar);
      Vector.addTo(this.frustum.farPlane.position, cameraPosition);
      Vector.set(this.frustum.farPlane.normal, forward);
      Vector.negateTo(this.frustum.farPlane.normal);

      // Right plane
      Vector.set(_tempVector, right);
      Vector.multiplyTo(_tempVector, _size);
      Vector.addTo(_tempVector, cameraPosition);
      Vector.set(this.frustum.rightPlane.position, _tempVector);
      Vector.set(this.frustum.rightPlane.normal, right);
      Vector.negateTo(this.frustum.rightPlane.normal);

      // Left plane
      Vector.set(_tempVector, right);
      Vector.multiplyTo(_tempVector, -_size);
      Vector.addTo(_tempVector, cameraPosition);
      Vector.set(this.frustum.leftPlane.position, _tempVector);
      Vector.set(this.frustum.leftPlane.normal, right);

      // Top plane
      Vector.set(_tempVector, up);
      Vector.multiplyTo(_tempVector, _size);
      Vector.addTo(_tempVector, cameraPosition);
      Vector.set(this.frustum.topPlane.position, _tempVector);
      Vector.set(this.frustum.topPlane.normal, up);
      Vector.negateTo(this.frustum.topPlane.normal);

      // Bottom plane
      Vector.set(_tempVector, up);
      Vector.multiplyTo(_tempVector, -_size);
      Vector.addTo(_tempVector, cameraPosition);
      Vector.set(this.frustum.bottomPlane.position, _tempVector);
      Vector.set(this.frustum.bottomPlane.normal, up);
    }
  };

  function onUpdateMatrix() {
    Matrix.inverse(_this.transform.matrix, _viewMatrix);
    _this.updateFrustum();
  }

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

  Object.defineProperty(this, "type", {
    get: function() {
      return _type;
    },
    set: function(type) {
      _type = type;
  
      if (this.type == Camera.Type.Perspective) {
        this.projectionMatrix = Matrix.perspective({
          fov: _fov * Math.PI / 180,
          aspect: this.aspect,
          near: _near,
          far: _far,
        });
      }
      else if (this.type == Camera.Type.Orthographic) {
        this.projectionMatrix = Matrix.orthographic({
          size: _size,
          near: _near,
          far: _far,
        });
      }
  
      this.updateFrustum();
    }
  });

  this.setAspect = function(aspect) {
    if (this.type == Camera.Type.Perspective) {
      this.aspect = aspect;

      Matrix.perspective({
        fov: _fov * Math.PI / 180,
        aspect: this.aspect,
        near: _near,
        far: _far
      }, this.projectionMatrix);

      this.updateFrustum();
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
        this.updateFrustum();
      }
    }
    else {
      console.warn("Can't set FOV of orthographic camera");
    }
  };

  this.getFOV = function() {
    if (this.type == Camera.Type.Orthographic) {
      console.error("Orthographic camera does not use FOV");
    }
    return _fov;
  };

  this.getNear = function() {
    return _near;
  };

  this.setNear = function(newNear) {
    _near = newNear;
   
    Matrix.perspective({
      fov: _fov * Math.PI / 180,
      aspect: this.aspect,
      near: _near,
      far: _far
    }, this.projectionMatrix);

    this.updateFrustum();
  };

  this.getFar = function() {
    return _far;
  };

  this.setFar = function(newFar) {
    _far = newFar;
   
    Matrix.perspective({
      fov: _fov * Math.PI / 180,
      aspect: this.aspect,
      near: _near,
      far: _far
    }, this.projectionMatrix);

    this.updateFrustum();
  };
  
  /**
   * @description Converts a point on the screen to a ray in world-space
   * @param {number} x x position on screen (from 0 to 1)
   * @param {number} y y position on screen (from 0 to 1)
   * @returns {{origin: Vector, direction: Vector}}
   */
  this.screenToWorldRay = function(x, y) {
    const u = x - 0.5;
    const v = y - 0.5;

    if (this.type === Camera.Type.Orthographic) {
      const worldUnits = new Vector(
        u * _size * 2/* * this.aspect*/, // bruh aspect ratio is currently NOT used with ortho camera
        -v * _size * 2,
        0
      );

      const origin = Matrix.transformDirection(this.transform.rotationMatrix, worldUnits);
      Vector.addTo(origin, this.transform.position);

      const direction = this.transform.forward;

      return {
        origin,
        direction
      };
    }
    else if (this.type === Camera.Type.Perspective) {
      const verticalAngle = this.getFOV() * Math.PI / 180;
      const worldHeight = 2 * Math.tan(verticalAngle);
      const worldUnits = new Vector(u * worldHeight * this.aspect, -v * worldHeight, -1);

      console.log(this.aspect);

      const direction = Matrix.transformDirection(this.transform.rotationMatrix, worldUnits);
      Vector.normalizeTo(direction);

      const origin = Vector.copy(this.transform.position);

      return {
        origin,
        direction
      };
    }

    throw new Error("Can't find ray with camera type " + this.type);
  };

  // Init
  this.type = settings.type ?? Camera.Type.Perspective;
  this.transform.onUpdateMatrix = onUpdateMatrix;
  onUpdateMatrix();
  //
}

Camera.Type = {
  Perspective: 0,
  Orthographic: 1,
};

function Frustum() {
  this.topPlane = new Plane();
  this.bottomPlane = new Plane();
  this.rightPlane = new Plane();
  this.leftPlane = new Plane();
  this.farPlane = new Plane();
  this.nearPlane = new Plane();
}

function Plane() {
  this.normal = new Vector();
  this.position = new Vector();

  this.getSignedDistanceToPlane = function(point) {
    return Vector.dot(this.normal, Vector.subtract(point, this.position, _tempVector));
  };
}

// Temp variables
const cameraPosition = new Vector();
const forward = new Vector();
const up = new Vector();
const right = new Vector();
const frontMultFar = new Vector();
const _tempVector = new Vector();

export {
  Camera
};