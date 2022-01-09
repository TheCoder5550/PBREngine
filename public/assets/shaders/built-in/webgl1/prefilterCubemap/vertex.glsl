attribute vec3 position;

varying vec3 localPos;

uniform mat4 projectionMatrix;
uniform mat4 viewMatrix;

void main() {
    localPos = position;
    gl_Position = projectionMatrix * viewMatrix * vec4(localPos, 1.0);
}