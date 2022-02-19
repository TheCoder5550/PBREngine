#version 300 es
precision highp float;

out vec4 FragColor;
in vec3 localPos;

uniform samplerCube environmentMap;

const float PI = 3.14159265359;

void main() {		
    // the sample direction equals the hemisphere's orientation 
    vec3 normal = normalize(localPos);
  
    vec3 irradiance = vec3(0.0);  

    vec3 up = vec3(0.0, 1.0, 0.0);
    vec3 right = normalize(cross(up, normal));
    up = normalize(cross(normal, right));

    // FragColor = vec4(texture(environmentMap, normal).rgb, 1.0);
    // return;

    float sampleDelta = 0.025 / 3.;
    float nrSamples = 0.0; 
    for(float phi = 0.0; phi < 2.0 * PI; phi += sampleDelta) {
        for(float theta = 0.0; theta < 0.5 * PI; theta += sampleDelta) {
            // spherical to cartesian (in tangent space)
            vec3 tangentSample = vec3(sin(theta) * cos(phi),  sin(theta) * sin(phi), cos(theta));
            // tangent space to world
            vec3 sampleVec = tangentSample.x * right + tangentSample.y * up + tangentSample.z * normal; 

            vec3 sampleColor = texture(environmentMap, sampleVec).rgb;
            // sampleColor = pow(sampleColor, vec3(2.2));

            irradiance += min(sampleColor, vec3(3000000)) * cos(theta) * sin(theta);
            nrSamples++;
        }
    }

    irradiance = PI * irradiance * (1.0 / float(nrSamples));
    // irradiance = pow(irradiance, vec3(1. / 2.2));
  
    FragColor = vec4(irradiance, 1.0);
}