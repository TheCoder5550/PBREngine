import { shaderBase } from "../../assets/shaders/built-in/base.mjs";

export const vertex = `
${shaderBase}

in vec3 position;
out vec3 vPosition;

uniform mat4 projectionMatrix;
uniform mat4 viewMatrix;

out vec3 nearPoint;
out vec3 farPoint;

vec3 UnprojectPoint(vec3 p) {
  vec4 unprojectedPoint = inverse(viewMatrix) * inverse(projectionMatrix) * vec4(p, 1.0);
  return unprojectedPoint.xyz / unprojectedPoint.w;
}

void main() {
  nearPoint = UnprojectPoint(vec3(position.xy, 0.0));
  farPoint = UnprojectPoint(vec3(position.xy, 1.0));
  gl_Position = vec4(position, 1.0);
}
`;

export const fragment = `
${shaderBase}

layout (location = 0) out vec4 fragColor;
layout (location = 1) out vec2 motionVector;

in vec3 nearPoint;
in vec3 farPoint;

uniform float strength;
uniform vec3 color;
uniform float gridSize;
uniform float mainAxisWidth;
uniform float maxDistance;

uniform float near;
uniform float far;
uniform mat4 projectionMatrix;
uniform mat4 viewMatrix;

vec4 grid(vec3 fragPos3D, float scale, bool drawAxis) {
  vec2 coord = fragPos3D.xz / scale;
  vec2 derivative = fwidth(coord);
  vec2 grid = abs(fract(coord - 0.5) - 0.5) / derivative;
  float line = min(grid.x, grid.y);
  float minimumz = min(derivative.y, 1.0);
  float minimumx = min(derivative.x, 1.0);
  vec4 color = vec4(color * strength, 1.0 - min(line, 1.0));

  // z axis
  if (fragPos3D.x > -mainAxisWidth / 2.0 * minimumx && fragPos3D.x < mainAxisWidth / 2.0 * minimumx) {
    color.z = 1.0;
  }

  // x axis
  if (fragPos3D.z > -mainAxisWidth / 2.0 * minimumz && fragPos3D.z < mainAxisWidth / 2.0 * minimumz) {
    color.x = 1.0;
  }

  return color;
}

float computeDepth(vec3 pos) {
  vec4 clip_space_pos = projectionMatrix * viewMatrix * vec4(pos, 1.0);
  return (clip_space_pos.z / clip_space_pos.w);
}

float computeLinearDepth(vec3 pos) {
  vec4 clip_space_pos = projectionMatrix * viewMatrix * vec4(pos, 1.0);
  float clip_space_depth = (clip_space_pos.z / clip_space_pos.w) * 2.0 - 1.0; // put back between -1 and 1
  float linearDepth = (2.0 * near * far) / (far + near - clip_space_depth * (far - near)); // get linear value between 0.01 and 100
  return linearDepth;
}

void main() {
  motionVector = vec2(0.5);

  float t = -nearPoint.y / (farPoint.y - nearPoint.y);
  vec3 fragPos3D = nearPoint + t * (farPoint - nearPoint);

  gl_FragDepth = ((gl_DepthRange.diff * computeDepth(fragPos3D)) + gl_DepthRange.near + gl_DepthRange.far) / 2.0;

  float linearDepth = computeLinearDepth(fragPos3D);
  float fading = max(0.0, (0.5 - linearDepth / maxDistance));

  fragColor = (
    grid(fragPos3D, gridSize * 100.0, true) +
    grid(fragPos3D, gridSize * 10.0, true) +
    grid(fragPos3D, gridSize, true)
  ) * float(t > 0.0);
  fragColor.a *= fading;
}
`;