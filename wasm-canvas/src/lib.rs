use std::{cell::RefCell, f64::consts::PI, rc::Rc};

use rand::random;
use wasm_bindgen::{prelude::*, JsCast};
use web_sys::{self, CanvasRenderingContext2d, HtmlCanvasElement};

#[derive(Clone)]
struct Circle {
    x: f64,
    y: f64,
    speed_x: f64,
    speed_y: f64,
}

static CANVAS_SIZE: f64 = 500.0;
static CIRCLE_SIZE: f64 = 5.0;
static CIRCLE_RADIUS: f64 = CIRCLE_SIZE / 2.0;
static LINE_WIDTH: f64 = 1.0;
static MAX_SPEED: f64 = 3.0;
static CIRCLE_AMMOUNT: u32 = 3000;

fn window() -> web_sys::Window {
    web_sys::window().unwrap()
}

fn document() -> web_sys::Document {
    window().document().unwrap()
}

fn request_animation_frame(f: &Closure<dyn FnMut(f64)>) {
    window()
        .request_animation_frame(f.as_ref().unchecked_ref())
        .unwrap();
}

fn get_circle_canvas() -> web_sys::HtmlCanvasElement {
    let canvas = document().create_element("canvas").unwrap();

    let canvas: web_sys::HtmlCanvasElement = canvas
        .dyn_into::<web_sys::HtmlCanvasElement>()
        .map_err(|_| ())
        .unwrap();

    canvas.set_width(CIRCLE_SIZE as u32);
    canvas.set_height(CIRCLE_SIZE as u32);

    let context = canvas
        .get_context("2d")
        .unwrap()
        .unwrap()
        .dyn_into::<web_sys::CanvasRenderingContext2d>()
        .unwrap();

    context.set_stroke_style(&"#aaa".into());
    context.set_line_width(LINE_WIDTH.into());

    context.begin_path();
    context
        .arc(
            CIRCLE_RADIUS,
            CIRCLE_RADIUS,
            CIRCLE_RADIUS - LINE_WIDTH,
            0.0,
            PI * 2.0,
        )
        .unwrap();
    context.stroke();

    canvas
}

fn get_random_position() -> f64 {
    (CANVAS_SIZE - CIRCLE_SIZE) * random::<f64>()
}

fn get_random_speed() -> f64 {
    let speed = 0.1 + (MAX_SPEED - 0.1) * random::<f64>();
    if random::<bool>() {
        speed
    } else {
        -speed
    }
}

fn get_circles() -> Vec<Circle> {
    let mut circles: Vec<Circle> = vec![];

    for _ in 0..CIRCLE_AMMOUNT {
        circles.push(Circle {
            x: get_random_position(),
            y: get_random_position(),
            speed_x: get_random_speed(),
            speed_y: get_random_speed(),
        })
    }

    circles
}

fn init_fps_text(context_2d: &CanvasRenderingContext2d) {
    context_2d.set_fill_style(&"#0f0".into());
    context_2d.set_font("14px Helvetica");
    context_2d.set_text_align("left");
    context_2d.set_text_baseline("top");
}

#[wasm_bindgen]
pub fn render_circles() {
    let circle_canvas = get_circle_canvas();

    let canvas = document().get_element_by_id("canvas").unwrap();

    let canvas: HtmlCanvasElement = canvas
        .dyn_into::<HtmlCanvasElement>()
        .map_err(|_| ())
        .unwrap();

    canvas.set_width(CANVAS_SIZE as u32);
    canvas.set_height(CANVAS_SIZE as u32);

    let context_2d = canvas
        .get_context("2d")
        .unwrap()
        .unwrap()
        .dyn_into::<CanvasRenderingContext2d>()
        .unwrap();

    init_fps_text(&context_2d);

    let mut circles = get_circles();

    let mut fps = 0_f64;
    let mut fps_counter = 0_u32;
    let mut fps_timestamp = 0_f64;
    let fps_count = 10_u32;
    let second = 1000_f64;

    let f: Rc<RefCell<Option<Closure<dyn FnMut(f64)>>>> = Rc::new(RefCell::new(None));
    let g = f.clone();

    *g.borrow_mut() = Some(Closure::new(move |time| {
        context_2d.clear_rect(0.0, 0.0, CANVAS_SIZE, CANVAS_SIZE);

        let next_circles = circles.to_vec();

        for i in 0..CIRCLE_AMMOUNT as usize {
            let mut circle = circles.get_mut(i).unwrap();

            if (circle.x < 0.0 && circle.speed_x < 0.0)
                || (circle.x > CANVAS_SIZE - CIRCLE_SIZE && circle.speed_x > 0.0)
            {
                circle.speed_x = -circle.speed_x;
            }

            if (circle.y < 0.0 && circle.speed_y < 0.0)
                || (circle.y > CANVAS_SIZE - CIRCLE_SIZE && circle.speed_y > 0.0)
            {
                circle.speed_y = -circle.speed_y;
            }

            for j in 0..CIRCLE_AMMOUNT as usize {
                if j == i {
                    continue;
                }

                let next = next_circles.get(j).unwrap();

                let distance =
                    ((next.x - circle.x).powf(2.0) + (next.y - circle.y).powf(2.0)).sqrt();

                if distance < CIRCLE_SIZE {
                    circle.speed_x = -circle.speed_x;
                    circle.speed_y = -circle.speed_y;
                }
            }

            circle.x += circle.speed_x;
            circle.y += circle.speed_y;

            context_2d
                .draw_image_with_html_canvas_element(&circle_canvas, circle.x, circle.y)
                .unwrap();
        }

        fps_counter += 1;
        if fps_counter % fps_count == 0 {
            let delta: f64 = time - fps_timestamp;
            fps = (second * fps_count as f64) / delta;
            fps_timestamp = time;
        }

        context_2d
            .fill_text(format!("fps: {:.2}", fps).as_str(), 10.0, 10.0)
            .unwrap();

        request_animation_frame(f.borrow().as_ref().unwrap());
    }));

    request_animation_frame(g.borrow().as_ref().unwrap());
}
