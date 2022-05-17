precision highp float;

uniform samplerCube cubemap;
uniform vec3 sunDirection;

varying vec3 vNormal;
varying vec3 vTangent;
varying vec3 vColor;
varying vec2 vUV;
varying vec3 vPos;

vec3 getSkyColor(vec3 e);

void main() {
  vec3 normal = normalize(vPos);
  gl_FragColor = vec4(getSkyColor(normal), 1);
}

vec3 getSkyColor(vec3 e) {
  vec3 sun = max(0., dot(sunDirection, e) - 0.998) * vec3(50000);

  // destructive (e.y)
  e.y = (max(e.y,0.0)*0.8+0.2)*0.8;
  vec3 sky = vec3(pow(1.0-e.y,2.0), 1.0-e.y, 0.6+(1.0-e.y)*0.4) * 1.1;
  sky = pow(sky, vec3(2.2));

  return sky + sun;
}