#version 300 es
// Автоматически создано HAOTICA. Не редактируйте вручную — изменения пропадут.
// HAOTICA — лёгкий CRT на весь экран, сила 0.35
precision highp float;
in vec2 v_texcoord;
uniform sampler2D tex;
out vec4 fragColor;

const float K = 0.350;

void main() {
    vec2 uv = v_texcoord;
    vec2 c = uv - 0.5;
    float r2 = dot(c, c);                          // 0 в центре … 0.5 в углах
    float px = 1.0 / float(textureSize(tex, 0).x);
    vec2 off = vec2(px * K * (1.6 + 2.4 * r2), 0.0);
    vec4 base = texture(tex, uv);
    float r = texture(tex, uv + off).r;            // красный луч — левее
    float b = texture(tex, uv - off).b;            // синий — правее
    vec3 col = vec3(r, base.g, b);
    float row = mod(floor(gl_FragCoord.y), 3.0);   // тёмная строка, полутень, светлая
    col *= 1.0 - K * (row < 0.5 ? 0.16 : (row < 1.5 ? 0.05 : 0.0));
    col *= 1.0 - K * 0.42 * smoothstep(0.12, 0.5, r2);
    fragColor = vec4(col, base.a);
}
