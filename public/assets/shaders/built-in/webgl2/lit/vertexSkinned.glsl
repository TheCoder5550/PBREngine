#version 300 es
in vec3 position;
in vec3 normal;
in vec3 tangent;
in vec3 color;
in vec2 uv;

out vec3 vPosition;
out vec3 vNormal;
out vec3 vTangent;
out vec3 vColor;
out vec2 vUV;
out mat3 vTBN;
out mat4 vSkin;

const int levels = 2;

uniform sharedPerScene {
  mat4 projectionMatrix;
  mat4 viewMatrix;
  mat4 inverseViewMatrix;
  float biases[levels];
};

// uniform mat4 projectionMatrix;
// uniform mat4 viewMatrix;
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

//Shadows
uniform mat4 textureMatrices[levels];
out vec4 projectedTexcoords[levels];

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
  // mat4 world = modelMatrix;

  mat4 TBNWorld = modelMatrix * skinMatrix * modelMatrix;
  vec3 _T = normalize(vec3(TBNWorld * vec4(tangent, 0.0)));
  vec3 _B = normalize(vec3(TBNWorld * vec4(cross(normal, tangent), 0.0)));
  vec3 _N = normalize(vec3(TBNWorld * vec4(normal, 0.0)));
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