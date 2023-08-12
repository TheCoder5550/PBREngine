import { clamp } from "./helper.mjs";

function Light() {
  this.componentType = "Light";

  this.gameObject = null;
  this.angle = Math.PI / 3;
  this.color = [1, 0.5, 0.1];
  this.type = 0;

  this.kelvinToRgb = function(k, intensity = 1) {
    return Light.kelvinToRgb(k, intensity);
  };

  this.copy = function() {
    var l = new Light();
    l.angle = this.angle;
    l.color = Array.from(this.color);
    l.type = this.type;
    return l;
  };
}

Light.kelvinToRgb = function(k, intensity = 1) {
  var retColor = [0, 0, 0];

  k = clamp(k, 1000, 40000) / 100;
  
  if (k <= 66) {
    retColor[0] = 1;
    retColor[1] = clamp(0.3900815787690196 * Math.log(k) - 0.6318414437886274, 0, 1);
  }
  else {
    var t = k - 60;
    retColor[0] = clamp(1.292936186062745 * Math.pow(t, -0.1332047592), 0, 1);
    retColor[1] = clamp(1.129890860895294 * Math.pow(t, -0.0755148492), 0, 1);
  }
  
  if (k > 66)
    retColor[2] = 1;
  else if (k <= 19)
    retColor[2] = 0;
  else
    retColor[2] = clamp(0.5432067891101960 * Math.log(k - 10) - 1.19625408914, 0, 1);

  retColor[0] *= intensity;
  retColor[1] *= intensity;
  retColor[2] *= intensity;

  return retColor;
};

export {
  Light
};