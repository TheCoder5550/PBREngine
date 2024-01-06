import { shaderBase } from "../../assets/shaders/built-in/base.mjs";

export const vertex = `
${shaderBase}

in vec3 position;
in vec3 normal;
in vec4 tangent;
in vec2 uv;

out vec3 vPosition;
out vec2 vUV;
out mat3 vTBN;

uniform sharedPerScene {
  mat4 projectionMatrix;
  mat4 viewMatrix;
  mat4 inverseViewMatrix;
};

uniform mat4 modelMatrix;

void main() {
  vUV = uv;

  // Tangent-space to world-space
  vec3 _T = normalize(vec3(modelMatrix * vec4(tangent.xyz, 0.0)));
  vec3 _B = normalize(vec3(modelMatrix * vec4(cross(normal, tangent.xyz) * tangent.w, 0.0)));
  vec3 _N = normalize(vec3(modelMatrix * vec4(normal, 0.0)));
  vTBN = mat3(_T, _B, _N);

  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vPosition = vec3(worldPosition);
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`;

export const fragment = `
${shaderBase}

layout (location = 0) out vec4 fragColor;

uniform sampler2D matcapTexture;
uniform sampler2D normalTexture;

uniform sharedPerScene {
  mat4 projectionMatrix;
  mat4 viewMatrix;
  mat4 inverseViewMatrix;
};

in vec3 vPosition;
in mat3 vTBN;
in vec2 vUV;

// vec2 matcap(vec3 eye, vec3 normal) {
//   vec3 reflected = reflect(eye, normal);
//   float m = 2.8284271247461903 * sqrt(reflected.z + 1.0);
//   return reflected.xy / m + 0.5;
// }

vec2 matcap(vec3 eyeVector, vec3 normal) {
  vec3 r = reflect(eyeVector, normal);
  // Transform from world-space to camera view-space
  r = mat3(viewMatrix) * r;

  float m = 2.0 * sqrt(
    pow(r.x, 2.0) +
    pow(r.y, 2.0) +
    pow(r.z + 1.0, 2.0)
  );
  vec2 uv = r.xy / m + 0.5;

  // v-coordinate is upside down because I upload the textures upside down
  uv.y = 1.0 - uv.y;

  return uv;
}

void main() {
  // vec3 tangentNormal = texture(normalTexture, vUV).rgb;
  // tangentNormal = tangentNormal * 2.0 - 1.0;
  vec3 tangentNormal = vec3(0, 0, 1);

  // Convert from tangent-space normals to world-space normals
  vec3 worldNormal = normalize(vTBN * tangentNormal);

  // Extract translation from inverseViewMatrix to get camera position
  vec3 cameraPosition = vec3(inverseViewMatrix * vec4(0, 0, 0, 1));
  // Vector pointing from camera to fragment position (in world-space)
  vec3 viewVector = normalize(vPosition - cameraPosition);

  // Get uvs for matcap texture lookup
  vec2 uv = matcap(viewVector, worldNormal);

  fragColor = vec4(texture(matcapTexture, uv).rgb, 1);
}
`;