import Vector from "./vector.mjs";
import Matrix from "./matrix.mjs";
import { Camera } from "./renderer.mjs";
import Quaternion from "./quaternion.mjs";

export default function OrbitCamera(renderer, cameraSettings, settings = {}) {
  var _this = this;

  var allowRotate = settings.rotate ?? true;
  var allowTranslate = settings.translate ?? true;
  var allowScale = settings.scale ?? true;
  var stylePointer = settings.stylePointer ?? true;

  var _distance = 5;
  Object.defineProperty(this, 'distance', {
    get: function() {
      return _distance;
    },
    set: function(val) {
      _distance = val;
      updateCameraMatrix();
    }
  });

  var center = Vector.zero();
  Object.defineProperty(this, 'center', {
    get: function() {
      return center;
    },
    set: function(val) {
      center = val;
      updateCameraMatrix();
    }
  });

  var rotation = new Vector(0, 0, 0);
  Object.defineProperty(this, 'rotation', {
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

    renderer.canvas.addEventListener("mousedown", function(e) {
      renderer.canvas.style.cursor = "grabbing";
    });

    document.addEventListener("mouseup", function(e) {
      renderer.canvas.style.cursor = "grab";
    });
  }

  renderer.canvas.addEventListener('contextmenu', function(e) {
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
      var dx = e.touches[0].clientX - lastTouch.x;
      var dy = e.touches[0].clientY - lastTouch.y;

      var m = 0.005;// * Math.min(2, _this.distance - 0.9);
      rotation.x += -dy * m;
      rotation.y += -dx * m;
      setRotationMatrix();

      lastTouch.x = e.touches[0].clientX;
      lastTouch.y = e.touches[0].clientY;
    }

    if (e.touches.length == 2) {
      var px = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      var py = (e.touches[0].clientY + e.touches[1].clientY) / 2;

      var dx = px - lastTouch.x;
      var dy = py - lastTouch.y;

      moveCenter(dx, dy);

      lastTouch.x = px;
      lastTouch.y = py;
    }

    updateCameraMatrix();
    e.preventDefault();
  });

  document.addEventListener('touchmove', function(event) {
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

  renderer.canvas.addEventListener('gesturestart', function(e) {
    lastScale = e.scale;
  }, false);

  renderer.canvas.addEventListener('gesturechange', function(e) {
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
  }

  function moveCenter(dx, dy) {
    var f = 0.0006 * _this.distance;
    var v = Matrix.transformVector(rotationMatrix, new Vector(-dx * f, dy * f, 0));

    Vector.addTo(center, v);

    // var v = Matrix.transformVector(rotationMatrix, new Vector(-e.movementX * f, e.movementY * f, 0));

    // center.x += -v.z;
    // center.y += v.y;
    // center.z += -v.x;
  }

  function setRotationMatrix() {
    Matrix.identity(rotationMatrix);
    Matrix.transform([
      ["ry", rotation.y],
      ["rx", rotation.x]
    ], rotationMatrix);
  }
  
  function updateCameraMatrix() {
    _this.camera.transform.rotation = Quaternion.eulerVector(rotation);
    _this.camera.transform.position = Vector.add(center, Vector.multiply(_this.camera.transform.forward, -_this.distance));

    // console.log(_this.camera.transform.rotation,_this.camera.transform.position );

    // _this.camera.transform.matrix = Matrix.lookAt(new Vector(
    //   center.x + Math.cos(rotation.y) * Math.cos(rotation.x) * _this.distance,
    //   center.y + Math.sin(rotation.x) * _this.distance,
    //   center.z + Math.sin(rotation.y) * Math.cos(rotation.x) * _this.distance
    // ), center, Math.abs(limitRange(rotation.x)) > Math.PI / 2 ? Vector.down() : Vector.up());
  }
  
  // function limitRange(a) {
  //   a = a % (Math.PI * 2);
  //   return a + (Math.abs(a) > Math.PI ? Math.PI * 2 * -Math.sign(a) : 0);
  // }
}