#version 300 es
precision highp float;

out vec4 FragColor;
in vec2 vUV;

uniform samplerCube cubemap;

float PI = 3.14159;

void main()
{
    float a = vUV.x * 2. * PI + PI * 0.5; 
	float b = vUV.y * PI - PI * 0.5; 
        
	vec3 rd = vec3(
        -cos(b) * cos(a),
    	sin(b),
    	cos(b) * sin(a)
    );
    
    FragColor = vec4(texture(cubemap, rd).rgb, 1);
}