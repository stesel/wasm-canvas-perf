"use strict";
const canvasSize = 500;
const particleSize = 5;
const lineWidth = 1;
const maxSpeed = 3;
const defaultParticleAmmount = 3000;
const urlParams = new URLSearchParams(window.location.search);
const rawParticles = urlParams.get("particles");
const particleAmmount = rawParticles ? Number(rawParticles) : 3000;
const particles = [];
function getParticleCanvas() {
    const particleCanvas = document.createElement("canvas");
    particleCanvas.width = particleSize;
    particleCanvas.height = particleSize;
    const particleContext2d = particleCanvas.getContext("2d");
    particleContext2d.strokeStyle = "#aaa";
    particleContext2d.lineWidth = lineWidth;
    particleContext2d.beginPath();
    particleContext2d.arc(particleSize / 2, particleSize / 2, particleSize / 2 - lineWidth, 0, Math.PI * 2);
    particleContext2d.stroke();
    return particleCanvas;
}
const particleCanvas = getParticleCanvas();
const canvas = document.getElementById("canvas");
canvas.width = canvasSize;
canvas.height = canvasSize;
const context2d = canvas.getContext("2d");
function getRandomPosition() {
    return Math.random() * (canvasSize - particleSize);
}
function getRandomSpeed() {
    const speed = 0.1 + Math.random() * (maxSpeed - 0.1);
    return Math.random() > 0.5 ? speed : -speed;
}
function initParticles() {
    for (let _ = 0; _ < particleAmmount; _++) {
        particles.push({
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
function update(time) {
    context2d.clearRect(0, 0, canvasSize, canvasSize);
    for (let i = 0; i < particles.length; i++) {
        const particle = particles[i];
        if ((particle.x < 0 && particle.speedX < 0) ||
            (particle.x > canvasSize - particleSize && particle.speedX > 0)) {
            particle.speedX = -particle.speedX;
        }
        if ((particle.y < 0 && particle.speedY < 0) ||
            (particle.y > canvasSize - particleSize && particle.speedY > 0)) {
            particle.speedY = -particle.speedY;
        }
        for (let j = 0; j < particles.length; j++) {
            if (j === i) {
                continue;
            }
            const next = particles[j];
            const distance = Math.sqrt(Math.pow(next.x - particle.x, 2) + Math.pow(next.y - particle.y, 2));
            if (distance < particleSize) {
                particle.speedX = -particle.speedX;
                particle.speedY = -particle.speedY;
            }
        }
        particle.x += particle.speedX;
        particle.y += particle.speedY;
        context2d.drawImage(particleCanvas, particle.x, particle.y);
    }
    fpsCounter++;
    if (fpsCounter % fpsCount === 0) {
        const delta = time - fpsTimestamp;
        fps = (second * fpsCount) / delta;
        window.__FPS__ = fps;
        fpsTimestamp = time;
    }
    context2d.fillText("fps: " + fps.toPrecision(4), 10, 10);
}
function requestUpdate() {
    window.requestAnimationFrame((time) => {
        update(time);
        requestUpdate();
    });
}
initParticles();
initFPSText();
requestUpdate();
