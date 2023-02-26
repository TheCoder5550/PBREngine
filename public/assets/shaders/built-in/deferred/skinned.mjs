import { shaderBase } from "../base.mjs";
import * as basic from "./basic.mjs";

var vertex = `
${shaderBase}

in vec3 position;
in vec3 normal;
in vec4 tangent;
in vec3 color;
in vec2 uv;

out vec4 vPosition;
out vec3 vNormal;
out vec4 vTangent;
out vec3 vColor;
out vec2 vUV;
out mat3 vTBN;

uniform mat4 projectionMatrix;
uniform mat4 viewMatrix;
uniform mat4 modelMatrix;

//Skinning
in vec4 weights;
in vec4 joints;

uniform sampler2D u_jointTexture;
uniform float u_numJoints;

// these offsets assume the texture is 4 pixels across
#define ROW0_U ((0.5 + 0.0) / 4.)
#define ROW1_U ((0.5 + 1.0) / 4.)
#define ROW2_U ((0.5 + 2.0) / 4.)
#define ROW3_U ((0.5 + 3.0) / 4.)

mat4 getBoneMatrix(float jointNdx) {
  float v = (jointNdx + 0.5) / u_numJoints;
  return mat4(
    texture(u_jointTexture, vec2(ROW0_U, v)),
    texture(u_jointTexture, vec2(ROW1_U, v)),
    texture(u_jointTexture, vec2(ROW2_U, v)),
    texture(u_jointTexture, vec2(ROW3_U, v))
  );
}

void main() {
  mat4 skinMatrix = getBoneMatrix(joints[0]) * weights[0] +
                    getBoneMatrix(joints[1]) * weights[1] +
                    getBoneMatrix(joints[2]) * weights[2] +
                    getBoneMatrix(joints[3]) * weights[3];

  vNormal = mat3(modelMatrix * skinMatrix) * normal; // in world-space
  vTangent = tangent;
  vUV = uv;
  vColor = color;

  vec3 _T = normalize(vec3(modelMatrix * skinMatrix * modelMatrix * vec4(vTangent.xyz, 0.0)));
  vec3 _B = normalize(vec3(modelMatrix * skinMatrix * modelMatrix * vec4(cross(normal, vTangent.xyz) * vTangent.w, 0.0)));
  vec3 _N = normalize(vec3(modelMatrix * skinMatrix * modelMatrix * vec4(normal, 0.0)));
  vTBN = mat3(_T, _B, _N);

  vec4 worldPosition = modelMatrix * skinMatrix * vec4(position, 1.0);
  vPosition = worldPosition;
  
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`;

var fragment = basic.fragment;

vertex = vertex.trim();
fragment = fragment.trim();

export {
  vertex,
  fragment
};