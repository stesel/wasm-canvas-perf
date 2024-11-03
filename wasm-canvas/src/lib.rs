use std::{cell::RefCell, f64::consts::PI, rc::Rc};

use js_sys::{self, Reflect};
use rand::random;
use wasm_bindgen::{prelude::*, JsCast};
use web_sys::{self, CanvasRenderingContext2d, HtmlCanvasElement, UrlSearchParams};

#[derive(Clone)]
struct Particle {
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
static DEFAULT_CIRCLE_AMOUNT: u32 = 3000;

static FPS_KEY: &str = "__FPS__";

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

fn get_particle_amount() -> u32 {
    let uri_search_params =
        UrlSearchParams::new_with_str(window().location().search().unwrap().as_str()).unwrap();

    let particle_amout: u32 = uri_search_params
        .get("particles")
        .unwrap_or(DEFAULT_CIRCLE_AMOUNT.to_string())
        .parse()
        .unwrap();

    particle_amout
}

fn get_particle_canvas() -> web_sys::HtmlCanvasElement {
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

    context.set_stroke_style_str("#aaa");
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

fn get_particles(particle_amout: u32) -> Vec<Particle> {
    let mut particles: Vec<Particle> = vec![];

    for _ in 0..particle_amout {
        particles.push(Particle {
            x: get_random_position(),
            y: get_random_position(),
            speed_x: get_random_speed(),
            speed_y: get_random_speed(),
        })
    }

    particles
}

fn init_fps_text(context_2d: &CanvasRenderingContext2d) {
    context_2d.set_fill_style_str("#0f0");
    context_2d.set_font("14px Helvetica");
    context_2d.set_text_align("left");
    context_2d.set_text_baseline("top");
}

#[wasm_bindgen]
pub fn render_particles() {
    let particle_amount = get_particle_amount();

    let particle_canvas = get_particle_canvas();

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

    let mut particles = get_particles(particle_amount);

    let mut fps = 0_f64;
    let mut fps_counter = 0_u32;
    let mut fps_timestamp = 0_f64;
    let fps_count = 10_u32;
    let second = 1000_f64;

    let update: Rc<RefCell<Option<Closure<dyn FnMut(f64)>>>> = Rc::new(RefCell::new(None));
    let request_update = update.clone();

    *request_update.borrow_mut() = Some(Closure::new(move |time| {
        context_2d.clear_rect(0.0, 0.0, CANVAS_SIZE, CANVAS_SIZE);

        let next_particles = particles.to_vec();

        for i in 0..particle_amount as usize {
            let particle = particles.get_mut(i).unwrap();

            if (particle.x < 0.0 && particle.speed_x < 0.0)
                || (particle.x > CANVAS_SIZE - CIRCLE_SIZE && particle.speed_x > 0.0)
            {
                particle.speed_x = -particle.speed_x;
            }

            if (particle.y < 0.0 && particle.speed_y < 0.0)
                || (particle.y > CANVAS_SIZE - CIRCLE_SIZE && particle.speed_y > 0.0)
            {
                particle.speed_y = -particle.speed_y;
            }

            for j in 0..particle_amount as usize {
                if j == i {
                    continue;
                }

                let next = next_particles.get(j).unwrap();

                let distance =
                    ((next.x - particle.x).powf(2.0) + (next.y - particle.y).powf(2.0)).sqrt();

                if distance < CIRCLE_SIZE {
                    particle.speed_x = -particle.speed_x;
                    particle.speed_y = -particle.speed_y;
                }
            }

            particle.x += particle.speed_x;
            particle.y += particle.speed_y;

            context_2d
                .draw_image_with_html_canvas_element(&particle_canvas, particle.x, particle.y)
                .unwrap();
        }

        fps_counter += 1;
        if fps_counter % fps_count == 0 {
            let delta: f64 = time - fps_timestamp;
            fps = (second * fps_count as f64) / delta;

            Reflect::set(
                &JsValue::from(window()),
                &JsValue::from(FPS_KEY),
                &fps.into(),
            )
            .unwrap();

            fps_timestamp = time;
        }

        context_2d
            .fill_text(format!("fps: {:.2}", fps).as_str(), 10.0, 10.0)
            .unwrap();

        request_animation_frame(update.borrow().as_ref().unwrap());
    }));

    request_animation_frame(request_update.borrow().as_ref().unwrap());
}
