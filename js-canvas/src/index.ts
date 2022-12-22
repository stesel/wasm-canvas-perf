const canvasSize = 500;
const circleSize = 5;
const lineWidth = 1;
const maxSpeed = 3;
const defaultCircleAmmount = 3000;

const urlParams = new URLSearchParams(window.location.search);
const particles = urlParams.get('particles');

const circleAmmount = particles ? Number(particles) : 3000;

interface Circle {
  x: number;
  y: number;
  speedX: number;
  speedY: number;
}

const circles: Circle[] = [];

function getCircleCanvas() {
  const circleCanvas = document.createElement("canvas");
  circleCanvas.width = circleSize;
  circleCanvas.height = circleSize;

  const circleContext2d = circleCanvas.getContext("2d")!;
  circleContext2d.strokeStyle = "#aaa";
  circleContext2d.lineWidth = lineWidth;
  circleContext2d.beginPath();
  circleContext2d.arc(
    circleSize / 2,
    circleSize / 2,
    circleSize / 2 - lineWidth,
    0,
    Math.PI * 2
  );
  circleContext2d.stroke();

  return circleCanvas;
}

const circleCanvas = getCircleCanvas();

const canvas = document.getElementById("canvas") as HTMLCanvasElement;
canvas.width = canvasSize;
canvas.height = canvasSize;

const context2d = canvas.getContext("2d")!;

function getRandomPosition() {
  return Math.random() * (canvasSize - circleSize);
}

function getRandomSpeed() {
  const speed = 0.1 + Math.random() * (maxSpeed - 0.1);
  return Math.random() > 0.5 ? speed : -speed;
}

function initCircles() {
  for (let _ = 0; _ < circleAmmount; _++) {
    circles.push({
      x: getRandomPosition(),
      y: getRandomPosition(),
      speedX: getRandomSpeed(),
      speedY: getRandomSpeed(),
    });
  }
}

let fps = 0;
let fpsCounter = 0;
let fpsTimestamp = 0;
const fpsCount = 10;
const second = 1000;

function initFPSText() {
  context2d.fillStyle = "#0f0";
  context2d.font = "14px Helvetica";
  context2d.textAlign = "left";
  context2d.textBaseline = "top";
  context2d.fillText("fps: " + fps.toPrecision(4), 10, 10);
}

function update() {
  window.requestAnimationFrame((time) => {
    context2d.clearRect(0, 0, canvasSize, canvasSize);

    for (let i = 0; i < circles.length; i++) {
      const circle = circles[i];

      if (
        (circle.x < 0 && circle.speedX < 0) ||
        (circle.x > canvasSize - circleSize && circle.speedX > 0)
      ) {
        circle.speedX = -circle.speedX;
      }

      if (
        (circle.y < 0 && circle.speedY < 0) ||
        (circle.y > canvasSize - circleSize && circle.speedY > 0)
      ) {
        circle.speedY = -circle.speedY;
      }

      for (let j = 0; j < circles.length; j++) {
        if (j === i) {
          continue;
        }

        const next = circles[j];
        
        const distance = Math.sqrt(Math.pow(next.x - circle.x, 2) + Math.pow(next.y - circle.y, 2));

        if (distance < circleSize) {
          circle.speedX = -circle.speedX;
          circle.speedY = -circle.speedY;
        }
      }

      circle.x += circle.speedX;
      circle.y += circle.speedY;

      context2d.drawImage(circleCanvas, circle.x, circle.y);
    }

    fpsCounter++;

    if (fpsCounter % fpsCount === 0) {
      const delta = time - fpsTimestamp;
      fps = (second * fpsCount) / delta;

      fpsTimestamp = time;
    }
    context2d.fillText("fps: " + fps.toPrecision(4), 10, 10);
  });

  requestUpdate();
}

function requestUpdate() {
  window.requestAnimationFrame(() => {
    update();
  });
}

initCircles();

initFPSText();

update();
