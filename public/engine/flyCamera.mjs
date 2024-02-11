import Vector from "./vector.mjs";
import Quaternion from "./quaternion.mjs";
import { Camera } from "./camera.mjs";

export default function FlyCamera(renderer, cameraSettings) {
  var _this = this;
  this.eulerAngles = Vector.zero();
  this.baseSpeed = 3;
  this.sprintSpeed = 15;
  this.speed = this.baseSpeed; 

  this.camera = new Camera(cameraSettings);
  this.camera.setAspect(renderer.aspect);

  var resizeEvent = () => {
    this.camera.setAspect(renderer.aspect);
  };
  renderer.on("resize", resizeEvent);
  resizeEvent();

  renderer.canvas.addEventListener("mousedown", function() {
    renderer.lockPointer();
  });

  renderer.canvas.addEventListener("mousemove", function(e) {
    if (renderer.isPointerLocked()) {
      _this.eulerAngles.x -= e.movementY * 0.002;
      _this.eulerAngles.y -= e.movementX * 0.002;
    }
  });

  this.update = function(dt) {
    this.speed = renderer.getKey(16) ? this.sprintSpeed : this.baseSpeed;

    if (renderer.getKey([87])) {
      let c = Math.cos(this.eulerAngles.x);
      this.camera.transform.position.x += Math.cos(this.eulerAngles.y + Math.PI / 2) * this.speed * dt * c;
      this.camera.transform.position.z += -1 * Math.sin(this.eulerAngles.y + Math.PI / 2) * this.speed * dt * c;
      this.camera.transform.position.y += Math.sin(this.eulerAngles.x) * this.speed * dt;
    }
    if (renderer.getKey([83])) {
      let c = Math.cos(this.eulerAngles.x);
      this.camera.transform.position.x -= Math.cos(this.eulerAngles.y + Math.PI / 2) * this.speed * dt * c;
      this.camera.transform.position.z -= -1 * Math.sin(this.eulerAngles.y + Math.PI / 2) * this.speed * dt * c;
      this.camera.transform.position.y -= Math.sin(this.eulerAngles.x) * this.speed * dt;
    }
    if (renderer.getKey([65])) {
      this.camera.transform.position.x -= Math.cos(this.eulerAngles.y) * this.speed * dt;
      this.camera.transform.position.z -= -1 * Math.sin(this.eulerAngles.y) * this.speed * dt;
    }
    if (renderer.getKey([68])) {
      this.camera.transform.position.x += Math.cos(this.eulerAngles.y) * this.speed * dt;
      this.camera.transform.position.z += -1 * Math.sin(this.eulerAngles.y) * this.speed * dt;
    }
  
    var rotSpeed = 3;
    if (renderer.getKey([37])) {
      this.eulerAngles.y += rotSpeed * dt;
    }
    if (renderer.getKey([39])) {
      this.eulerAngles.y -= rotSpeed * dt;
    }
    if (renderer.getKey([38])) {
      this.eulerAngles.x += rotSpeed * dt;
    }
    if (renderer.getKey([40])) {
      this.eulerAngles.x -= rotSpeed * dt;
    }

    this.camera.transform.rotation = Quaternion.euler(this.eulerAngles.x, this.eulerAngles.y, this.eulerAngles.z);
  };

  renderer.on("renderloop", (dt) => this.update(dt));
}

function flyCamera(renderer, camera, eulerAngles, dt = 1, speed = 15, rotSpeed = 3) {
  if (renderer.getKey([87])) {
    let c = Math.cos(eulerAngles.x);
    camera.transform.position.x += Math.cos(eulerAngles.y + Math.PI / 2) * speed * dt * c;
    camera.transform.position.z += -Math.sin(eulerAngles.y + Math.PI / 2) * speed * dt * c;
    camera.transform.position.y += Math.sin(eulerAngles.x) * speed * dt;
  }
  if (renderer.getKey([83])) {
    let c = Math.cos(eulerAngles.x);
    camera.transform.position.x -= Math.cos(eulerAngles.y + Math.PI / 2) * speed * dt * c;
    camera.transform.position.z -= -Math.sin(eulerAngles.y + Math.PI / 2) * speed * dt * c;
    camera.transform.position.y -= Math.sin(eulerAngles.x) * speed * dt;
  }
  if (renderer.getKey([65])) {
    camera.transform.position.x -= Math.cos(eulerAngles.y) * speed * dt;
    camera.transform.position.z -= -Math.sin(eulerAngles.y) * speed * dt;
  }
  if (renderer.getKey([68])) {
    camera.transform.position.x += Math.cos(eulerAngles.y) * speed * dt;
    camera.transform.position.z += -Math.sin(eulerAngles.y) * speed * dt;
  }

  if (renderer.getKey([37])) {
    eulerAngles.y += rotSpeed * dt;
  }
  if (renderer.getKey([39])) {
    eulerAngles.y -= rotSpeed * dt;
  }
  if (renderer.getKey([38])) {
    eulerAngles.x += rotSpeed * dt;
  }
  if (renderer.getKey([40])) {
    eulerAngles.x -= rotSpeed * dt;
  }
}

export {
  flyCamera
};