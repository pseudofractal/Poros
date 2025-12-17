use crate::logic::execute_redirect;
use crate::storage::load_bangs;
use crate::ui::render_header;
use wasm_bindgen::prelude::*;
use wasm_bindgen::JsCast;
use web_sys::{HtmlInputElement, Window};

pub fn render(window: &Window, document: &web_sys::Document, container: &web_sys::Element) {
  render_header(document, container);

  let search_form = document.create_element("form").unwrap();
  let input_field = document
    .create_element("input")
    .unwrap()
    .dyn_into::<HtmlInputElement>()
    .unwrap();

  let _ = input_field.set_attribute("type", "text");
  let _ = input_field.set_attribute("placeholder", "search with a bang !wiki");
  let _ = input_field.set_attribute(
        "style",
        "padding: 0.5rem 1rem; font-size: 1.2rem; width: 20rem; border: 5px solid #b4befe; border-radius: 10px; background: #1e1e2e; color: #cdd6f4;",
    );
  let _ = input_field.set_attribute("autofocus", "true");

  search_form.append_child(&input_field).unwrap();
  container.append_child(&search_form).unwrap();

  let settings_link = document.create_element("a").unwrap();
  settings_link.set_text_content(Some("Configure Bangs"));
  let _ = settings_link.set_attribute("href", "?settings");
  let _ = settings_link.set_attribute(
    "style",
    "margin-top: 2rem; color: #6c7086; text-decoration: none; font-size: 0.9rem;",
  );
  container.append_child(&settings_link).unwrap();

  let window_clone = window.clone();

  let form_submission_handler = Closure::<dyn FnMut(_)>::new(move |event: web_sys::SubmitEvent| {
    event.prevent_default();
    let input_value = input_field.value();

    if !input_value.is_empty() {
      let bang_definitions = load_bangs(&window_clone);
      execute_redirect(&input_value, &bang_definitions, &window_clone);
    }
  });

  search_form
    .add_event_listener_with_callback("submit", form_submission_handler.as_ref().unchecked_ref())
    .unwrap();

  form_submission_handler.forget();
}
