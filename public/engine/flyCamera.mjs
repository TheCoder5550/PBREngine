import Vector from "./vector.mjs";
import Quaternion from "./quaternion.mjs";
import { Camera } from "./renderer.mjs";

export default function FlyCamera(renderer, cameraSettings) {
  var _this = this;
  this.eulerAngles = Vector.zero();
  this.baseSpeed = 3;
  this.sprintSpeed = 15;
  this.speed = this.baseSpeed; 

  this.camera = new Camera(cameraSettings);
  this.camera.setAspect(renderer.aspect);

  renderer.canvas.addEventListener("mousedown", function(e) {
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
      var c = Math.cos(this.eulerAngles.x);
      this.camera.transform.position.x += Math.cos(this.eulerAngles.y + Math.PI / 2) * this.speed * dt * c;
      this.camera.transform.position.z += -1 * Math.sin(this.eulerAngles.y + Math.PI / 2) * this.speed * dt * c;
      this.camera.transform.position.y += Math.sin(this.eulerAngles.x) * this.speed * dt;
    }
    if (renderer.getKey([83])) {
      var c = Math.cos(this.eulerAngles.x);
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
  }
}