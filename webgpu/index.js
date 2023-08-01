"use strict";
const canvasSize = 500;
const particleSize = 5;
const lineWidth = 1;
const minSpeed = 0.004;
const maxSpeed = 0.012;
const defaultParticleAmount = 3000;
const particleUniformSize = 6 /* canvasSize, particleSize, seedX, seedY, seedZ, seedW */;
const particleStateSize = 4 /* x, y, speedX, speedY */;
const urlParams = new URLSearchParams(window.location.search);
const rawParticles = urlParams.get("particles");
const particleAmount = rawParticles ? Number(rawParticles) : defaultParticleAmount;
function getRandomPosition() {
    return Math.random() * 2 - 1;
}
function getRandomSpeed() {
    const speed = minSpeed + Math.random() * (maxSpeed - minSpeed);
    return Math.random() > 0.5 ? speed : -speed;
}
async function initWebGPU() {
    if (!navigator.gpu) {
        throw new Error("WebGPU not supported on this browser.");
    }
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
        throw new Error("No appropriate GPUAdapter found.");
    }
    const device = await adapter.requestDevice();
    const canvas = document.getElementById("canvas");
    canvas.width = canvasSize;
    canvas.height = canvasSize;
    const context = canvas.getContext("webgpu");
    const canvasFormat = navigator.gpu.getPreferredCanvasFormat();
    context.configure({
        device: device,
        format: canvasFormat,
    });
    const vertices = new Float32Array([
        -1, -1, 1, -1, 1, 1,
        -1, -1, 1, 1, -1, 1,
    ]);
    const vertexBuffer = device.createBuffer({
        label: "Cell vertices",
        size: vertices.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(vertexBuffer, 0, vertices);
    const uniformArray = new Float32Array([canvasSize, particleSize, Math.random(), Math.random(), Math.random(), Math.random()]);
    const uniformBuffer = device.createBuffer({
        label: "Particle Uniforms",
        size: uniformArray.byteLength + 8,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(uniformBuffer, 0, uniformArray);
    const particleStateArray = new Float32Array(particleStateSize * particleAmount);
    const particleStateBuffers = [
        device.createBuffer({
            label: "Particle State A",
            size: particleStateArray.byteLength,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        }),
        device.createBuffer({
            label: "Particle State B",
            size: particleStateArray.byteLength,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        }),
    ];
    device.queue.writeBuffer(particleStateBuffers[0], 0, particleStateArray);
    const vertexBufferLayout = {
        arrayStride: /* x */ 4 + /* y */ 4,
        stepMode: 'vertex',
        attributes: [
            {
                format: "float32x2",
                offset: 0,
                shaderLocation: 0, // Position, see vertex shader
            },
        ],
    };
    const particleShaderModule = device.createShaderModule({
        label: "Particle Shader",
        code: `
      struct VertexOutput {
        @builtin(position) pos: vec4f,
        @location(0) particlePos: vec2f,
        @location(1) @interpolate(flat) index: u32,
      };

      struct ParticleUniforms {
        canvasSize: f32,
        particleSize: f32,
        seed: vec4f,
      };

      @group(0) @binding(0) var<uniform> particleUniforms : ParticleUniforms;
      @group(0) @binding(1) var<storage, read> particlePosArray: array<f32>;

      @vertex
      fn vertexMain(@builtin(instance_index) instance: u32, @location(0) pos: vec2f) ->
      VertexOutput {
        let scale = particleUniforms.particleSize / particleUniforms.canvasSize;
        let index = instance * 4;
        var output: VertexOutput;
        output.pos = vec4f(pos.x * scale + particlePosArray[index], pos.y * scale + particlePosArray[index + 1], 0, 1);
        output.particlePos = vec2f(pos.x, pos.y);
        output.index = instance * 4;
        return output;
      }

      @fragment
      fn fragmentMain(@location(0) particlePos: vec2f) -> @location(0) vec4f {
        let distance = length(vec2f(particlePos.x, particlePos.y));
        let radius = 1.0;
        let lineWidth = radius * 0.4;
        let circle = vec3f(step(radius - lineWidth, distance) - step(radius, distance));

        return vec4f(circle * 0.66, 1.0);
      }
    `,
    });
    const WORKGROUP_SIZE = 8;
    const computeShaderModule = device.createShaderModule({
        label: "Compute Shader",
        code: `
      @group(0) @binding(1) var<storage, read> particleStateIn: array<f32>;
      @group(0) @binding(2) var<storage, read_write> particleStateOut: array<f32>;

      @compute
      @workgroup_size(${WORKGROUP_SIZE}, ${WORKGROUP_SIZE})
      fn computeMain(@builtin(global_invocation_id) particle: vec3u) {

        const offset: u32 = 4;

        let xIndex = (particle.x + particle.y * ${WORKGROUP_SIZE}) * offset;
        let yIndex = xIndex + 1;
        let speedXIndex = xIndex + 2;
        let speedYIndex = xIndex + 3;

        let x = particleStateOut[xIndex];
        let y = particleStateOut[yIndex];

        let speedX = particleStateOut[speedXIndex];
        let speedY = particleStateOut[speedYIndex];

        let nextX = x + speedX;
        let nextY = y + speedY;

        if ((nextX >= 1 && speedX > 0) || (nextX <= -1 && speedX < 0)) {
          particleStateOut[speedXIndex] = -speedX;
        }

        if ((nextY >= 1 && speedY > 0) || (nextY <= -1 && speedY < 0)) {
          particleStateOut[speedYIndex] = -speedY;
        }

        particleStateOut[xIndex] = nextX;
        particleStateOut[yIndex] = nextY;
      }`,
    });
    const initParticlesShaderModule = device.createShaderModule({
        label: "Init particles Compute Shader",
        code: `
      const minSpeed: f32 = 0.004;
      const maxSpeed: f32 = 0.012;

      var<private> rand_seed : vec2<f32>;

      fn init_random(index : u32, seed : vec4<f32>) {
        rand_seed = seed.xz;
        rand_seed = fract(rand_seed * cos(35.456+f32(index) * seed.yw));
        rand_seed = fract(rand_seed * cos(41.235+f32(index) * seed.xw));
      }
      
      fn random() -> f32 {
        rand_seed.x = fract(cos(dot(rand_seed, vec2<f32>(23.14077926, 232.61690225))) * 136.8168);
        rand_seed.y = fract(cos(dot(rand_seed, vec2<f32>(54.47856553, 345.84153136))) * 534.7645);
        return rand_seed.y;
      }

      fn randomPosition() -> f32 {
        return random() * 2 - 1;
      }
      
      fn randomSpeed() -> f32 {
        let speed = minSpeed + random() * (maxSpeed - minSpeed);

        if (random() > 0.5) {
          return speed;
        } else {
          return -speed;
        }
      }

      struct ParticleUniforms {
        canvasSize: f32,
        particleSize: f32,
        seed: vec4f,
      };

      @group(0) @binding(0) var<uniform> particleUniforms : ParticleUniforms;
      @group(0) @binding(2) var<storage, read_write> particleStateOut: array<f32>;

      @compute
      @workgroup_size(${WORKGROUP_SIZE}, ${WORKGROUP_SIZE})
      fn computeMain(@builtin(global_invocation_id) particle: vec3u) {

        const offset: u32 = 4;

        let index = (particle.x + particle.y * ${WORKGROUP_SIZE}) * offset;

        init_random(index, particleUniforms.seed);

        particleStateOut[index] = randomPosition();
        particleStateOut[index + 1] = randomPosition();
        particleStateOut[index + 2] = randomSpeed();
        particleStateOut[index + 3] = randomSpeed();
      }`,
    });
    const bindGroupLayout = device.createBindGroupLayout({
        label: "Particle Bind Group Layout",
        entries: [
            {
                binding: 0,
                visibility: GPUShaderStage.VERTEX |
                    GPUShaderStage.FRAGMENT |
                    GPUShaderStage.COMPUTE,
                buffer: {},
            },
            {
                binding: 1,
                visibility: GPUShaderStage.VERTEX |
                    GPUShaderStage.COMPUTE,
                buffer: { type: "read-only-storage" },
            },
            {
                binding: 2,
                visibility: GPUShaderStage.COMPUTE,
                buffer: { type: "storage" },
            },
        ],
    });
    const bindGroups = [
        device.createBindGroup({
            label: "Particle renderer bind group A",
            layout: bindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: { buffer: uniformBuffer },
                },
                {
                    binding: 1,
                    resource: { buffer: particleStateBuffers[0] },
                },
                {
                    binding: 2,
                    resource: { buffer: particleStateBuffers[1] },
                },
            ],
        }),
        device.createBindGroup({
            label: "Particle renderer bind group B",
            layout: bindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: { buffer: uniformBuffer },
                },
                {
                    binding: 1,
                    resource: { buffer: particleStateBuffers[1] },
                },
                {
                    binding: 2,
                    resource: { buffer: particleStateBuffers[0] },
                },
            ],
        }),
    ];
    const pipelineLayout = device.createPipelineLayout({
        label: "Particle Pipeline Layout",
        bindGroupLayouts: [bindGroupLayout],
    });
    const particlePipeline = device.createRenderPipeline({
        label: "Render pipeline",
        layout: pipelineLayout,
        vertex: {
            module: particleShaderModule,
            entryPoint: "vertexMain",
            buffers: [vertexBufferLayout],
        },
        fragment: {
            module: particleShaderModule,
            entryPoint: "fragmentMain",
            targets: [
                {
                    format: canvasFormat,
                },
            ],
        },
        primitive: {
            topology: 'triangle-list',
        },
    });
    const computePipeline = device.createComputePipeline({
        label: "Compute pipeline",
        layout: pipelineLayout,
        compute: {
            module: computeShaderModule,
            entryPoint: "computeMain",
        },
    });
    const initParticlesPipeline = device.createComputePipeline({
        label: "Init Particles pipeline",
        layout: pipelineLayout,
        compute: {
            module: initParticlesShaderModule,
            entryPoint: "computeMain",
        },
    });
    const encoder = device.createCommandEncoder();
    const computePass = encoder.beginComputePass();
    computePass.setPipeline(initParticlesPipeline);
    computePass.setBindGroup(0, bindGroups[1]);
    const workgroupCount = Math.ceil(particleAmount / WORKGROUP_SIZE);
    computePass.dispatchWorkgroups(workgroupCount);
    computePass.end();
    const commandBuffer = encoder.finish();
    device.queue.submit([commandBuffer]);
    let step = 0;
    function update() {
        step++;
        const encoder = device.createCommandEncoder();
        const computePass = encoder.beginComputePass();
        computePass.setPipeline(computePipeline);
        computePass.setBindGroup(0, bindGroups[step % 2]);
        const workgroupCount = Math.ceil(particleAmount / WORKGROUP_SIZE);
        computePass.dispatchWorkgroups(workgroupCount);
        computePass.end();
        const renderPass = encoder.beginRenderPass({
            colorAttachments: [
                {
                    view: context.getCurrentTexture().createView(),
                    loadOp: "clear",
                    clearValue: { r: 0, g: 0, b: 0, a: 1 },
                    storeOp: "store",
                },
            ],
        });
        renderPass.setPipeline(particlePipeline);
        renderPass.setVertexBuffer(0, vertexBuffer);
        renderPass.setBindGroup(0, bindGroups[0]);
        renderPass.draw(vertices.length / 2, particleAmount);
        renderPass.end();
        const commandBuffer = encoder.finish();
        device.queue.submit([commandBuffer]);
        window.requestAnimationFrame(update);
    }
    update();
}
initWebGPU();
