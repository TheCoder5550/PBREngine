#version 300 es
precision mediump float;

layout (location = 0) out vec4 fragColor;

in vec4 vPosition;
 
uniform samplerCube skybox;
uniform mat4 viewDirectionProjectionInverse;

void main() {
  vec4 t = viewDirectionProjectionInverse * vPosition;
  vec3 col = texture(skybox, normalize(t.xyz / t.w)).rgb;

  fragColor = vec4(col, 1);
}