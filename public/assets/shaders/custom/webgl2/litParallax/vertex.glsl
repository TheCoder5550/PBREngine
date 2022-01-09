#version 300 es

in vec3 position;
in vec3 normal;
in vec3 tangent;
in vec3 color;
in vec2 uv;

uniform mat4 projectionMatrix;
uniform mat4 viewMatrix;
uniform mat4 inverseViewMatrix;
uniform mat4 modelMatrix;

out vec3 vPosition;
out vec3 vNormal;
out vec3 vTangent;
out vec3 vColor;
out vec2 vUV;
// out vec3 vTangentViewDirection;

//Shadows
const int levels = 2;
uniform mat4 textureMatrices[levels];
out vec4 projectedTexcoords[levels];

void main() {
  vNormal = normal;
  vTangent = tangent;
  vUV = uv;
  vColor = color;

  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  for (int i = 0; i < levels; i++) {
    projectedTexcoords[i] = textureMatrices[i] * worldPosition;
  }

  vPosition = vec3(worldPosition);
  
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);

  // vec3 T   = normalize(mat3(modelMatrix) * tangent);
  // vec3 B   = normalize(mat3(modelMatrix) * cross(normal, tangent));
  // vec3 N   = normalize(mat3(modelMatrix) * normal);
  // mat3 TBN = transpose(mat3(T, B, N));

  // vTangentViewDirection = TBN * normalize(vec3(inverseViewMatrix * vec4(0, 0, 0, 1)) - vPosition);
}