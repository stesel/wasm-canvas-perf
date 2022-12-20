"use strict";
var canvasSize = 500;
var circleSize = 5;
var lineWidth = 1;
var maxSpeed = 3;
var circleAmmount = 3000;
var circles = [];
function getCircleCanvas() {
    var circleCanvas = document.createElement("canvas");
    circleCanvas.width = circleSize;
    circleCanvas.height = circleSize;
    var circleContext2d = circleCanvas.getContext("2d");
    circleContext2d.strokeStyle = "#aaa";
    circleContext2d.lineWidth = lineWidth;
    circleContext2d.beginPath();
    circleContext2d.arc(circleSize / 2, circleSize / 2, circleSize / 2 - lineWidth, 0, Math.PI * 2);
    circleContext2d.stroke();
    return circleCanvas;
}
var circleCanvas = getCircleCanvas();
var canvas = document.getElementById("canvas");
canvas.width = canvasSize;
canvas.height = canvasSize;
var context2d = canvas.getContext("2d");
function getRandomPosition() {
    return Math.random() * (canvasSize - circleSize);
}
function getRandomSpeed() {
    var speed = 0.1 + Math.random() * (maxSpeed - 0.1);
    return Math.random() > 0.5 ? speed : -speed;
}
function initCircles() {
    for (var _ = 0; _ < circleAmmount; _++) {
        circles.push({
            x: getRandomPosition(),
            y: getRandomPosition(),
            speedX: getRandomSpeed(),
            speedY: getRandomSpeed()
        });
    }
}
var fps = 0;
var fpsCounter = 0;
var fpsTimestamp = 0;
var fpsCount = 10;
var second = 1000;
function initFPSText() {
    context2d.fillStyle = "#0f0";
    context2d.font = "14px Helvetica";
    context2d.textAlign = "left";
    context2d.textBaseline = "top";
    context2d.fillText("fps: " + fps.toPrecision(4), 10, 10);
}
function update() {
    window.requestAnimationFrame(function (time) {
        context2d.clearRect(0, 0, canvasSize, canvasSize);
        for (var i = 0; i < circles.length; i++) {
            var circle = circles[i];
            if ((circle.x < 0 && circle.speedX < 0) ||
                (circle.x > canvasSize - circleSize && circle.speedX > 0)) {
                circle.speedX = -circle.speedX;
            }
            if ((circle.y < 0 && circle.speedY < 0) ||
                (circle.y > canvasSize - circleSize && circle.speedY > 0)) {
                circle.speedY = -circle.speedY;
            }
            for (var j = 0; j < circles.length; j++) {
                if (j === i) {
                    continue;
                }
                var next = circles[j];
                var distance = Math.sqrt(Math.pow(next.x - circle.x, 2) + Math.pow(next.y - circle.y, 2));
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
            var delta = time - fpsTimestamp;
            fps = (second * fpsCount) / delta;
            fpsTimestamp = time;
        }
        context2d.fillText("fps: " + fps.toPrecision(4), 10, 10);
    });
    requestUpdate();
}
function requestUpdate() {
    window.requestAnimationFrame(function () {
        update();
    });
}
initCircles();
initFPSText();
update();
//# sourceMappingURL=index.js.map