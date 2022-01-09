#version 300 es
in vec4 position;

out vec4 vPosition;

void main() {
  vPosition = position;

  gl_Position = position;
  gl_Position.z = 1.;
}