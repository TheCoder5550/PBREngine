import Vector from "./vector.mjs";

function LOD(levels = []) {
  this.levels = levels;
  this.gameObject = null;

  this.currentLevel = null;
  this.updateInterval = 10;
  var i = Math.floor(Math.random() * this.updateInterval);

  this.render = function(camera, currentMatrix, shadowPass, opaquePass) {
    // if (shadowPass) return; // bruh

    if (!shadowPass && i % this.updateInterval == 0) {
      if (camera.transform) {
        var cameraPos = camera.transform.position;
        var distanceToCenter = Vector.distanceSqr(this.gameObject.transform.worldPosition, cameraPos);
        this.currentLevel = this.levels.find(l => distanceToCenter < l.upToDistance * l.upToDistance);
      }
      else {
        this.currentLevel = this.levels[0];
      }
    }

    if (this.currentLevel) {
      var prevModelMatrix = this.gameObject.prevModelMatrix;
      var meshRenderer = this.currentLevel.meshRenderer;
      meshRenderer.render(camera, currentMatrix, shadowPass, opaquePass, prevModelMatrix);
    }
    
    i++;
  };
}

export {
  LOD
};