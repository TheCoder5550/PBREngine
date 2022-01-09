#version 300 es
precision highp float;

layout (location = 0) out vec4 fragColor;

uniform sampler2D normalTexture;
uniform vec2 uvScale;
uniform float iTime;

uniform mat4 inverseViewMatrix;
uniform mat4 modelMatrix;
uniform vec3 sunDirection;
uniform vec3 albedo;

in vec3 vPosition;
in vec3 vNormal;
in vec3 vTangent;
in vec3 vColor;
in vec2 vUV;

uniform samplerCube environmentCubemap;

float specularIntensity = 0.5;
float specularSharpness = 64.;

vec3 waterColor = vec3(0.9, 0.95, 1);
float reflectionSmoothness = 5. / 5.;
float waterSpeed = 0.05;
float normalMapStrength = 0.3;

//Normal map
vec3 tangentToObject(vec3 normal, vec3 tangent, vec3 normalMapTangent) {
  vec3 bitangent = cross(normal, tangent);
  return normalMapTangent * mat3(
    tangent.x, bitangent.x, normal.x,
    tangent.y, bitangent.y, normal.y,
    tangent.z, bitangent.z, normal.z
  );
}

vec3 normalStrength(vec3 normal, float strength) {
  return vec3(normal.xy * strength, mix(1., normal.z, clamp(strength, 0., 1.)));
}

void main() {
  vec3 viewDirection = normalize(vec3(inverseViewMatrix * vec4(0, 0, 0, 1)) - vPosition); 
  vec3 H = normalize(sunDirection + viewDirection);

  vec3 worldNormal = normalize(mat3(modelMatrix) * vNormal);
  vec3 worldTangent = normalize(mat3(modelMatrix) * vTangent);

  vec3 normalMap1 = tangentToObject(worldNormal, worldTangent, normalStrength(vec3(texture(normalTexture, vUV * uvScale + vec2(waterSpeed) * iTime)) * 2. - 1., normalMapStrength));
  vec3 normalMap2 = tangentToObject(worldNormal, worldTangent, normalStrength(vec3(texture(normalTexture, vUV * uvScale * 2. + vec2(waterSpeed / 2.) * iTime)) * 2. - 1., normalMapStrength / 2.));
  worldNormal = mix(normalMap1, normalMap2, 0.5);

  vec3 reflection = textureLod(environmentCubemap, reflect(-viewDirection, worldNormal), reflectionSmoothness).xyz * 1.5;
  vec3 specular = vec3(specularIntensity) * pow(clamp(dot(worldNormal, H), 0., 1.), specularSharpness) * 1.5;

  fragColor = vec4(reflection, 1);
}