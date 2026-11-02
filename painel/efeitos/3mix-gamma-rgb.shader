// 3Mix · Gamma RGB por canal.
// Uniformes consumidos pelo obs-shaderfilter; valores padrão neutros.
uniform float gamma_r<
    string label = "Gamma R";
    string widget_type = "slider";
    float minimum = 0.1;
    float maximum = 4.0;
    float step = 0.01;
> = 1.0;

uniform float gamma_g<
    string label = "Gamma G";
    string widget_type = "slider";
    float minimum = 0.1;
    float maximum = 4.0;
    float step = 0.01;
> = 1.0;

uniform float gamma_b<
    string label = "Gamma B";
    string widget_type = "slider";
    float minimum = 0.1;
    float maximum = 4.0;
    float step = 0.01;
> = 1.0;

float4 mainImage(VertData v_in) : TARGET
{
    float4 c = image.Sample(textureSampler, v_in.uv);
    float3 g = float3(clamp(gamma_r, 0.1, 4.0), clamp(gamma_g, 0.1, 4.0), clamp(gamma_b, 0.1, 4.0));
    c.rgb = pow(max(c.rgb, float3(0.0, 0.0, 0.0)), 1.0 / g);
    return c;
}
