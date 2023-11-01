import Vector from "./vector.mjs";
import Matrix from "./matrix.mjs";
import Renderer, { Camera } from "./renderer.mjs";
import Quaternion from "./quaternion.mjs";

/**
 * @description Creates a camera
 * @param {Renderer} renderer 
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
* }} cameraSettings
* @param {{ rotate: boolean, translate: boolean, scale: boolean, stylePointer: boolean }} [settings={}] 
*/
export default function OrbitCamera(renderer, cameraSettings, settings = {}) {
  if (!(renderer instanceof Renderer)) {
    throw new Error("renderer is not of type 'Renderer'");
  }

  var _this = this;

  {
    let v = new Vector();
    let c = new Vector();
    let q = new Quaternion();

    var updateCameraMatrix = function() {
      Quaternion.eulerVector(rotation, q);
      _this.camera.transform.rotation = q;
  
      Matrix.getForward(_this.camera.transform.worldMatrix, v);
      Vector.multiplyTo(v, -_this.distance);
      Vector.set(c, center);
      Vector.addTo(c, v);
      _this.camera.transform.position = c;
  
      // _this.camera.transform.matrix = Matrix.lookAt(new Vector(
      //   center.x + Math.cos(rotation.y) * Math.cos(rotation.x) * _this.distance,
      //   center.y + Math.sin(rotation.x) * _this.distance,
      //   center.z + Math.sin(rotation.y) * Math.cos(rotation.x) * _this.distance
      // ), center, Math.abs(limitRange(rotation.x)) > Math.PI / 2 ? Vector.down() : Vector.up());
    };
  }

  var allowRotate = settings.rotate ?? true;
  var allowTranslate = settings.translate ?? true;
  var allowScale = settings.scale ?? true;
  var stylePointer = settings.stylePointer ?? true;

  var _distance = 5;
  Object.defineProperty(this, "distance", {
    get: function() {
      return _distance;
    },
    set: function(val) {
      _distance = val;
      updateCameraMatrix();
    }
  });

  var center = Vector.zero();
  Object.defineProperty(this, "center", {
    get: function() {
      return center;
    },
    set: function(val) {
      center = val;
      updateCameraMatrix();
    }
  });

  var rotation = Vector.zero();
  Object.defineProperty(this, "rotation", {
    get: function() {
      return rotation;
    },
    set: function(val) {
      rotation = val;
      updateCameraMatrix();
    }
  });

  var rotationMatrix = Matrix.identity();
  setRotationMatrix();
  
  this.camera = new Camera(cameraSettings);
  this.camera.setAspect(renderer.aspect);
  updateCameraMatrix();

  if (stylePointer) {
    renderer.canvas.style.cursor = "grab";

    renderer.canvas.addEventListener("mousedown", function() {
      renderer.canvas.style.cursor = "grabbing";
    });

    document.addEventListener("mouseup", function() {
      renderer.canvas.style.cursor = "grab";
    });
  }

  renderer.canvas.addEventListener("contextmenu", function(e) {
    e.preventDefault();
  });
  
  window.addEventListener("mousemove", function(e) {
    if (renderer.mouse.left && allowRotate) {
      rotation.x += -e.movementY * 0.005;
      rotation.y += -e.movementX * 0.005;

      setRotationMatrix();
    }
    else if (renderer.mouse.right && allowTranslate) {
      moveCenter(e.movementX, e.movementY);
    }

    updateCameraMatrix();
  });

  var lastTouch = {x: 0, y: 0};
  var canSwipe = true;

  renderer.canvas.addEventListener("touchstart", function(e) {
    lastTouch.x = e.touches[0].clientX;
    lastTouch.y = e.touches[0].clientY;

    if (e.touches.length > 1) {
      canSwipe = false;
    }
    else {
      canSwipe = true;
    }

    if (e.touches.length == 2) {
      lastTouch.x = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      lastTouch.y = (e.touches[0].clientY + e.touches[1].clientY) / 2;
    }

    updateCameraMatrix();
    e.preventDefault();
  });

  renderer.canvas.addEventListener("touchmove", function(e) {
    if (canSwipe) {
      let dx = e.touches[0].clientX - lastTouch.x;
      let dy = e.touches[0].clientY - lastTouch.y;

      let m = 0.005;// * Math.min(2, _this.distance - 0.9);
      rotation.x += -dy * m;
      rotation.y += -dx * m;
      setRotationMatrix();

      lastTouch.x = e.touches[0].clientX;
      lastTouch.y = e.touches[0].clientY;
    }

    if (e.touches.length == 2) {
      let px = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      let py = (e.touches[0].clientY + e.touches[1].clientY) / 2;

      let dx = px - lastTouch.x;
      let dy = py - lastTouch.y;

      moveCenter(dx, dy);

      lastTouch.x = px;
      lastTouch.y = py;
    }

    updateCameraMatrix();
    e.preventDefault();
  });

  document.addEventListener("touchmove", function(event) {
    if (event.scale !== 1) {
      event.preventDefault();
    }
  }, { passive: false });

  renderer.canvas.addEventListener("wheel", function(e) {
    if (allowScale) {
      _this.distance += e.deltaY * 0.001 * _this.distance;
      _this.distance = Math.max(0, _this.distance);

      updateCameraMatrix();
      e.preventDefault();
    }
  });

  var lastScale = 1;

  renderer.canvas.addEventListener("gesturestart", function(e) {
    lastScale = e.scale;
  }, false);

  renderer.canvas.addEventListener("gesturechange", function(e) {
    var dScale = lastScale / e.scale;
    lastScale = e.scale;

    _this.distance *= dScale;
    _this.distance = Math.max(0, _this.distance);

    updateCameraMatrix();
    e.preventDefault();
  }, false);

  renderer.on("resize", function() {
    _this.camera.setAspect(renderer.aspect);
  });

  this.setCenter = function(newCenter) {
    center = newCenter;
    updateCameraMatrix();
  };

  let v = new Vector();
  let d = new Vector();
  function moveCenter(dx, dy) {
    var f = 0.0006 * _this.distance;
    d.x = -dx * f;
    d.y = dy * f;
    d.z = 0;
    Matrix.transformVector(rotationMatrix, d, v);
    Vector.addTo(center, v);
  }

  function setRotationMatrix() {
    Matrix.identity(rotationMatrix);
    Matrix.applyRotationY(rotation.y, rotationMatrix);
    Matrix.applyRotationX(rotation.x, rotationMatrix);
  }

  // renderer.on("renderloop", function() {
  //   _this.camera.transform.rotation = Quaternion.slerp(_this.camera.transform.rotation, Quaternion.eulerVector(rotation), 0.3);
  //   _this.camera.transform.position = Vector.lerp(_this.camera.transform.position, Vector.add(center, Vector.multiply(_this.camera.transform.forward, -_this.distance)), 0.3);
  // });
  
  // function limitRange(a) {
  //   a = a % (Math.PI * 2);
  //   return a + (Math.abs(a) > Math.PI ? Math.PI * 2 * -Math.sign(a) : 0);
  // }
}