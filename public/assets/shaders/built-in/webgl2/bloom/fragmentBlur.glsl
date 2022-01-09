#version 300 es
precision highp float;

layout (location = 0) out vec4 fragColor;

uniform sampler2D mainTexture;
uniform sampler2D secondTexture;
uniform vec2 screenSize;
uniform bool horizontal;
uniform bool firstIter;
uniform bool downsample;

float weight[5] = float[] (0.227027, 0.1945946, 0.1216216, 0.054054, 0.016216);

void main() {
  vec2 uv = gl_FragCoord.xy / screenSize;

  if (firstIter) {
    vec3 result = texture(mainTexture, uv).rgb;
    float brightness = dot(result, vec3(0.2126, 0.7152, 0.0722));
    if (brightness < 1.) {
      result = vec3(0);
    }

    fragColor = vec4(result, 1.0);
    return;
  }

  if (downsample) {
    vec2 tex_offset = 1. / vec2(textureSize(mainTexture, 0)); // gets size of single texel
    vec3 result = texture(mainTexture, uv).rgb * weight[0]; // current fragment's contribution
    if(horizontal)
    {
        for(int i = 1; i < 5; ++i)
        {
            result += texture(mainTexture, uv + vec2(tex_offset.x * float(i), 0.0)).rgb * weight[i];
            result += texture(mainTexture, uv - vec2(tex_offset.x * float(i), 0.0)).rgb * weight[i];
        }
    }
    else
    {
        for(int i = 1; i < 5; ++i)
        {
            result += texture(mainTexture, uv + vec2(0.0, tex_offset.y * float(i))).rgb * weight[i];
            result += texture(mainTexture, uv - vec2(0.0, tex_offset.y * float(i))).rgb * weight[i];
        }
    }

    fragColor = vec4(result, 1.0);
    return;
  }

  vec3 result = texture(mainTexture, uv).rgb + texture(secondTexture, uv).rgb;
  fragColor = vec4(result, 1.0);
}