const canvasSizePx = 500;
const particleSizePx = 5;
const particleSize = particleSizePx / canvasSizePx;
const defaultParticleAmount = 3000;

const particleStateSize = 4 /* x, y, speedX, speedY */;

const urlParams = new URLSearchParams(window.location.search);
const rawParticles = urlParams.get("particles");
const particleAmount = rawParticles ? Number(rawParticles) : defaultParticleAmount;

const fpsElement = document.getElementById('fps') as HTMLParagraphElement;

interface Window {
  __FPS__?: number;
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

  const canvas = document.getElementById("canvas") as HTMLCanvasElement;
  canvas.width = canvasSizePx;
  canvas.height = canvasSizePx;

  const context = canvas.getContext("webgpu") as GPUCanvasContext;

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

  const uniformArray = new Float32Array([particleAmount, particleSize, Math.random(), Math.random(), Math.random(), Math.random() ]);

  const uniformBuffer = device.createBuffer({
    label: "Particle Uniforms",
    size: 32,
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

  device.queue.writeBuffer(particleStateBuffers[ 0 ], 0, particleStateArray);

  const vertexBufferLayout: GPUVertexBufferLayout = {
    arrayStride: /* x */ 4 + /* y */ 4,
    stepMode: 'vertex',
    attributes: [
      {
        format: "float32x2",
        offset: 0,
        shaderLocation: 0,
      },
    ],
  };

  const WORKGROUP_SIZE = 16;

  const initStateShaderModule = device.createShaderModule({
    label: "Init Particles State",
    code: `
      const stateOffset: u32 = 4;
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

      fn randomPosition(particleSize: f32) -> f32 {
        return particleSize + random() * (2 - 2 * particleSize) - 1;
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
        particleAmount: f32,
        particleSize: f32,
        seed: vec4f,
      };

      @group(0) @binding(0) var<uniform> particleUniforms : ParticleUniforms;
      @group(0) @binding(2) var<storage, read_write> particleStateOut: array<f32>;

      @compute
      @workgroup_size(${WORKGROUP_SIZE})
      fn computeMain(@builtin(global_invocation_id) particle: vec3u) {
        let particleAmount = u32(particleUniforms.particleAmount);

        if (particle.x >= particleAmount) {
          return;
        }

        let index = particle.x * stateOffset;

        init_random(index, particleUniforms.seed);

        particleStateOut[index] = randomPosition(particleUniforms.particleSize);
        particleStateOut[index + 1] = randomPosition(particleUniforms.particleSize);
        particleStateOut[index + 2] = randomSpeed();
        particleStateOut[index + 3] = randomSpeed();
      }`,
  });

  const updateStateShaderModule = device.createShaderModule({
    label: "Update Particles State",
    code: `
      const stateOffset: u32 = 4;

      fn distance(x1: f32, y1: f32, x2: f32, y2: f32) -> f32 {
          let dx = x1 - x2;
          let dy = y1 - y2;
          return sqrt(dx * dx + dy * dy);
      }

      struct ParticleUniforms {
        particleAmount: f32,
        particleSize: f32,
        seed: vec4f,
      };

      @group(0) @binding(0) var<uniform> particleUniforms : ParticleUniforms;
      @group(0) @binding(1) var<storage, read> particleStateIn: array<f32>;
      @group(0) @binding(2) var<storage, read_write> particleStateOut: array<f32>;

      @compute
      @workgroup_size(${WORKGROUP_SIZE}, ${WORKGROUP_SIZE})
      fn computeMain(@builtin(global_invocation_id) particle: vec3u) {
        let particleAmount = u32(particleUniforms.particleAmount);

        if (particle.x >= particleAmount || particle.y >= particleAmount) {
          return;
        }

        let xIndex = particle.x * stateOffset;
        let yIndex = xIndex + 1;

        let speedXIndex = xIndex + 2;
        let speedYIndex = xIndex + 3;

        let x = particleStateIn[xIndex];
        let y = particleStateIn[yIndex];

        var speedX: f32;
        var speedY: f32;

        if (particle.y == 0) {
          speedX = particleStateIn[speedXIndex];
          speedY = particleStateIn[speedYIndex];

          let halfSize = particleUniforms.particleSize / 2;

          if ((x >= 1 - halfSize && speedX > 0) || (x <= -1 + halfSize && speedX < 0)) {
            speedX = -speedX;
          }
  
          if ((y >= 1 - halfSize && speedY > 0) || (y <= -1 + halfSize && speedY < 0)) {
            speedY = -speedY;
          }

          particleStateOut[speedXIndex] = speedX;
          particleStateOut[speedYIndex] = speedY;
        }

        speedX = particleStateOut[speedXIndex];
        speedY = particleStateOut[speedYIndex];

        let nextIndex = particle.y * stateOffset;

        if nextIndex != xIndex {
          let nextX = particleStateIn[nextIndex];
          let nextY = particleStateIn[nextIndex + 1];

          let dist = distance(x, y, nextX, nextY);
          if dist <= particleUniforms.particleSize && dist > 0 {
            particleStateOut[speedXIndex] = -speedX;
            particleStateOut[speedYIndex] = -speedY;
          }
        }

        if(particle.y == particleAmount - 1) {
          particleStateOut[xIndex] = x + speedX;
          particleStateOut[yIndex] = y + speedY;
        }
      }`,
  });

  const renderShaderModule = device.createShaderModule({
    label: "Render Particle Shader",
    code: `
      const stateOffset: u32 = 4;

      struct VertexOutput {
        @builtin(position) position: vec4f,
        @location(0) particlePosition: vec2f,
      };

      struct ParticleUniforms {
        particleAmount: f32,
        particleSize: f32,
        seed: vec4f,
      };

      @group(0) @binding(0) var<uniform> particleUniforms : ParticleUniforms;
      @group(0) @binding(1) var<storage, read> particleStateArray: array<f32>;

      @vertex
      fn vertexMain(@builtin(instance_index) instance: u32, @location(0) position: vec2f) ->
      VertexOutput {
        let index = instance * stateOffset;
        var output: VertexOutput;
        output.position = vec4f(position.x * particleUniforms.particleSize + particleStateArray[index], position.y * particleUniforms.particleSize + particleStateArray[index + 1], 0, 1);
        output.particlePosition = vec2f(position.x, position.y);
        return output;
      }

      @fragment
      fn fragmentMain(@location(0) particlePosition: vec2f) -> @location(0) vec4f {
        let distance = length(vec2f(particlePosition.x, particlePosition.y));
        let radius = 1.0;
        let lineWidth = radius * 0.4;
        let circle = vec3f(step(radius - lineWidth, distance) - step(radius, distance));

        return vec4f(circle * 0.66, 1.0);
      }
    `,
  });

  const bindGroupLayout = device.createBindGroupLayout({
    label: "Bind Group Layout",
    entries: [
      {
        binding: 0,
        visibility:
          GPUShaderStage.VERTEX |
          GPUShaderStage.FRAGMENT |
          GPUShaderStage.COMPUTE,
        buffer: {},
      },
      {
        binding: 1,
        visibility:
          GPUShaderStage.VERTEX |
          GPUShaderStage.COMPUTE,
        buffer: { type: "read-only-storage" },
      },
      {
        binding: 2,
        visibility:
          GPUShaderStage.COMPUTE,
        buffer: { type: "storage" },
      },
    ],
  });

  const bindGroups = [
    device.createBindGroup({
      label: "Bind Group A",
      layout: bindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: { buffer: uniformBuffer },
        },
        {
          binding: 1,
          resource: { buffer: particleStateBuffers[ 0 ] },
        },
        {
          binding: 2,
          resource: { buffer: particleStateBuffers[ 1 ] },
        },
      ],
    }),
    device.createBindGroup({
      label: "Bind Group B",
      layout: bindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: { buffer: uniformBuffer },
        },
        {
          binding: 1,
          resource: { buffer: particleStateBuffers[ 1 ] },
        },
        {
          binding: 2,
          resource: { buffer: particleStateBuffers[ 0 ] },
        },
      ],
    }),
  ];

  const pipelineLayout = device.createPipelineLayout({
    label: "Particle Pipeline Layout",
    bindGroupLayouts: [ bindGroupLayout ],
  });

  const initStatePipeline = device.createComputePipeline({
    label: "Init Particles State Pipeline",
    layout: pipelineLayout,
    compute: {
      module: initStateShaderModule,
      entryPoint: "computeMain",
    },
  });

  const updateStatePipeline = device.createComputePipeline({
    label: "Update Particles State Pipeline",
    layout: pipelineLayout,
    compute: {
      module: updateStateShaderModule,
      entryPoint: "computeMain",
    },
  });

  const renderPipeline = device.createRenderPipeline({
    label: "Render Particles Pipeline",
    layout: pipelineLayout,
    vertex: {
      module: renderShaderModule,
      entryPoint: "vertexMain",
      buffers: [ vertexBufferLayout ],
    },
    fragment: {
      module: renderShaderModule,
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

  let step = 0;

  const encoder = device.createCommandEncoder();
  const initStatePass = encoder.beginComputePass();

  initStatePass.setPipeline(initStatePipeline);
  initStatePass.setBindGroup(0, bindGroups[ step ]);

  const workgroupCount = Math.ceil(particleAmount / WORKGROUP_SIZE);
  initStatePass.dispatchWorkgroups(workgroupCount);

  initStatePass.end();

  const commandBuffer = encoder.finish();
  device.queue.submit([ commandBuffer ]);

  let fps = 0;
  let fpsCounter = 0;
  let fpsTimestamp = 0;
  const fpsCount = 10;
  const second = 1000;

  function update(time: number) {
    step++;

    const encoder = device.createCommandEncoder();

    const updateStatePass = encoder.beginComputePass();

    updateStatePass.setPipeline(updateStatePipeline);
    updateStatePass.setBindGroup(0, bindGroups[ step % 2 ]);

    updateStatePass.dispatchWorkgroups(workgroupCount, workgroupCount);

    updateStatePass.end();

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

    renderPass.setPipeline(renderPipeline);
    renderPass.setVertexBuffer(0, vertexBuffer);
    renderPass.setBindGroup(0, bindGroups[ step % 2 ]);
    renderPass.draw(vertices.length / 2, particleAmount);

    renderPass.end();

    const commandBuffer = encoder.finish();
    device.queue.submit([ commandBuffer ]);

    fpsCounter++;

    if (fpsCounter % fpsCount === 0) {
      const delta = time - fpsTimestamp;
      fps = (second * fpsCount) / delta;
      window.__FPS__ = fps;
      fpsElement.innerText = "fps: " + fps.toPrecision(4);

      fpsTimestamp = time;
    }

    window.requestAnimationFrame(update);
  }

  window.requestAnimationFrame(update);
}

initWebGPU();
