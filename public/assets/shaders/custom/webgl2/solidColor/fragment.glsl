#version 300 es
precision highp float;

layout (location = 0) out vec4 fragColor;
layout (location = 1) out vec2 motionVector;

void main() {
  motionVector = vec2(0.5);
  fragColor = vec4(0, 10, 5, 1);
}