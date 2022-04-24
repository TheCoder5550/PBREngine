#version 300 es
precision highp float;

layout (location = 0) out vec4 fragColor;

// Attributes
in vec2 vUV;
in vec3 vEyePos;
in vec3 vEyeNormal;
in vec3 vEyeTangent;

uniform sampler2D albedoTexture;
uniform float textureScale;
uniform vec3 scopeColor;

void main() {
  if (length(vUV - vec2(0.5)) > 0.5) {
    discard;
  }

  vec3 normal = normalize(vEyeNormal);
  vec3 tangent = normalize(vEyeTangent);
  vec3 cameraDir = normalize(vEyePos);

  vec3 offset = cameraDir + normal;

  mat3 mat = mat3(
    tangent,
    cross(normal, tangent),
    normal
  );
  offset = mat * offset;

  vec2 uv = offset.xy / textureScale;

  vec4 glassColor = vec4(0, 0, 0, 0.5);
  vec4 finalColor = mix(glassColor, vec4(scopeColor, 1), texture(albedoTexture, uv + vec2(0.5, 0.5)).a);
  
  // float d = clamp((length(uv) - 0.3) * 10., 0., 1.);
  // finalColor = mix(finalColor, vec4(0, 0, 0, 1), d);

  fragColor = finalColor;
}