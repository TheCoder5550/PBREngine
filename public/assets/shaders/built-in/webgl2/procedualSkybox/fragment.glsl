#version 300 es
precision highp float;

layout (location = 0) out vec4 fragColor;

uniform samplerCube cubemap;

in vec3 vNormal;
in vec3 vTangent;
in vec3 vColor;
in vec2 vUV;
in vec3 vPos;

vec3 getSkyColor(vec3 e);

void main() {
  vec3 normal = normalize(vPos);
  fragColor = vec4(getSkyColor(normal), 1);
  
  // vec3 sunDirection = normalize(vec3(1, 0.2, 1));
  // vec3 sun = max(0., dot(sunDirection, normal) - 0.995) * vec3(50000);

  // vec3 col = max(0., normal.y) * vec3(173, 210, 255) / 256. * 2. + sun;
  // fragColor = vec4(col, 1);
}

vec3 getSkyColor(vec3 e) {
  vec3 sunDirection = normalize(vec3(1, 0.6, 1));
  vec3 sun = max(0., dot(sunDirection, e) - 0.998) * vec3(50000);

  // destructive (e.y)
  e.y = (max(e.y,0.0)*0.8+0.2)*0.8;
  vec3 sky = vec3(pow(1.0-e.y,2.0), 1.0-e.y, 0.6+(1.0-e.y)*0.4) * 1.1;
  sky = pow(sky, vec3(2.2));

  return sky + sun;
}