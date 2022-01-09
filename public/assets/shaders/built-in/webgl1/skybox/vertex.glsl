attribute vec4 position;

varying vec4 vPosition;

void main() {
  vPosition = position;

  gl_Position = position;
  gl_Position.z = 1.;
}