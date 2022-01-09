#version 300 es
layout (location = 0) in vec2 position;
in vec2 uv;

out vec2 vUV;

void main()
{
    vUV = uv;
    gl_Position = vec4(position, 0.0, 1.0);
}