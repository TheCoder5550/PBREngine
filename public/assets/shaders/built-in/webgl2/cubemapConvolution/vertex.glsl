#version 300 es
layout (location = 0) in vec3 position;

out vec3 localPos;

uniform mat4 projectionMatrix;
uniform mat4 viewMatrix;

void main()
{
    localPos = position;
    gl_Position = projectionMatrix * viewMatrix * vec4(localPos, 1.0);
}