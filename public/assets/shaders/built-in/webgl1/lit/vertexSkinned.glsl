attribute vec3 position;
attribute vec3 normal;
attribute vec3 tangent;
attribute vec3 color;
attribute vec2 uv;

uniform mat4 projectionMatrix;
uniform mat4 viewMatrix;
uniform mat4 modelMatrix;

varying vec3 vPosition;
varying vec3 vNormal;
varying vec3 vTangent;
varying vec3 vColor;
varying vec2 vUV;
varying mat3 vTBN;
varying mat4 vSkin;

//Skinning
attribute vec4 weights;
attribute vec4 joints;

uniform sampler2D u_jointTexture;
uniform float u_numJoints;

// these offsets assume the texture is 4 pixels across
#define ROW0_U ((0.5 + 0.0) / 4.)
#define ROW1_U ((0.5 + 1.0) / 4.)
#define ROW2_U ((0.5 + 2.0) / 4.)
#define ROW3_U ((0.5 + 3.0) / 4.)
 
mat4 getBoneMatrix(float jointNdx) {
  float v = 1. - (jointNdx + 0.5) / u_numJoints;
  return mat4(
    texture2D(u_jointTexture, vec2(ROW0_U, v)),
    texture2D(u_jointTexture, vec2(ROW1_U, v)),
    texture2D(u_jointTexture, vec2(ROW2_U, v)),
    texture2D(u_jointTexture, vec2(ROW3_U, v))
  );
}

//Shadows
const int levels = 2;
uniform mat4 textureMatrices[levels];
varying vec4 projectedTexcoords[levels];

void main() {
  vTangent = tangent;
  vUV = uv;
  vColor = color;

  mat4 skinMatrix = getBoneMatrix(joints[0]) * weights[0] +
                    getBoneMatrix(joints[1]) * weights[1] +
                    getBoneMatrix(joints[2]) * weights[2] +
                    getBoneMatrix(joints[3]) * weights[3];
  mat4 world = modelMatrix * skinMatrix;
  // mat4 world = skinMatrix * modelMatrix;

  vec3 _T = normalize(vec3(world * vec4(tangent, 0.0)));
  vec3 _B = normalize(vec3(world * vec4(cross(normal, tangent), 0.0)));
  vec3 _N = normalize(vec3(world * vec4(normal, 0.0)));
  vTBN = mat3(_T, _B, _N);

  vec4 worldPosition = world * vec4(position, 1.0);
  for (int i = 0; i < levels; i++) {
    projectedTexcoords[i] = textureMatrices[i] * worldPosition;
  }
  
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
  vPosition = worldPosition.xyz;
  vNormal = normal;
  // vNormal = mat3(inverse(modelMatrix * skinMatrix)) * normal;
  // vNormal = mat3(world * inverse(modelMatrix)) * normal;

  vSkin = skinMatrix;
}