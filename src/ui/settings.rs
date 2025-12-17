use crate::models::BangDefinition;
use crate::storage::{load_raw_list, save_raw_list};
use crate::ui::create_element;
use std::cell::RefCell;
use std::rc::Rc;
use wasm_bindgen::prelude::*;
use wasm_bindgen::JsCast;
use web_sys::{Event, HtmlInputElement, Window};

pub fn render(window: &Window, document: &web_sys::Document, container: &web_sys::Element) {
  let bangs_state = Rc::new(RefCell::new(load_raw_list(window)));

  // Header
  let header = create_element(
        document,
        "div",
        "display: flex; justify-content: space-between; align-items: center; width: 100%; max-width: 600px; margin-bottom: 1rem;",
    );
  let title = create_element(document, "h2", "color: #f9e2af; margin: 0;");
  title.set_text_content(Some("Manage Bangs"));

  let close_link = create_element(
    document,
    "a",
    "color: #89b4fa; text-decoration: none; font-size: 1.1em;",
  );
  close_link.set_text_content(Some("Done"));
  let _ = close_link.set_attribute("href", "./");

  header.append_child(&title).unwrap();
  header.append_child(&close_link).unwrap();
  container.append_child(&header).unwrap();

  // List Container
  let list_container = create_element(
    document,
    "div",
    "width: 100%; max-width: 600px; max-height: 60vh; overflow-y: auto;",
  );
  container.append_child(&list_container).unwrap();

  refresh_bang_list(document, &list_container, bangs_state.clone(), window);

  // Add Button
  let add_btn = create_element(
        document,
        "button",
        "margin-top: 1rem; padding: 0.8rem; width: 100%; max-width: 600px; background: #a6e3a1; color: #1e1e2e; border: none; border-radius: 8px; font-weight: bold; cursor: pointer; font-size: 1rem;",
    );
  add_btn.set_text_content(Some("+ Add New Bang"));
  container.append_child(&add_btn).unwrap();

  // Modal
  let (modal_overlay, _, _, _) = create_modal(
    document,
    window,
    bangs_state.clone(),
    &list_container,
    &add_btn,
  );
  document
    .body()
    .unwrap()
    .append_child(&modal_overlay)
    .unwrap();
}

fn refresh_bang_list(
  document: &web_sys::Document,
  list_container: &web_sys::Element,
  bangs_state: Rc<RefCell<Vec<BangDefinition>>>,
  window: &Window,
) {
  list_container.set_inner_html("");
  let bangs = bangs_state.borrow();

  for (index, bang) in bangs.iter().enumerate() {
    let card = create_element(
            document,
            "div",
            "background: #313244; padding: 1rem; margin-bottom: 0.5rem; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; border: 1px solid #45475a;",
        );

    let info_div = document.create_element("div").unwrap();
    let name_el = create_element(document, "div", "color: #cdd6f4; font-weight: bold;");
    name_el.set_text_content(Some(&format!(
      "{} (!{})",
      bang.name,
      bang.identifiers.join(", !")
    )));

    let url_el = create_element(
            document,
            "div",
            "color: #a6adc8; font-size: 0.85em; margin-top: 0.2rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 300px;",
        );
    url_el.set_text_content(Some(&bang.redirect_pattern));

    info_div.append_child(&name_el).unwrap();
    info_div.append_child(&url_el).unwrap();
    card.append_child(&info_div).unwrap();

    let delete_btn = create_element(
            document,
            "button",
            "background: #f38ba8; color: #1e1e2e; border: none; padding: 0.4rem 0.8rem; border-radius: 5px; cursor: pointer; font-weight: bold;",
        );
    delete_btn.set_text_content(Some("Delete"));

    let bangs_clone = bangs_state.clone();
    let window_clone = window.clone();
    let doc_clone = document.clone();
    let list_clone = list_container.clone();

    let delete_handler = Closure::<dyn FnMut(_)>::new(move |_: Event| {
      if web_sys::window()
        .unwrap()
        .confirm_with_message("Delete this bang?")
        .unwrap_or(false)
      {
        bangs_clone.borrow_mut().remove(index);
        save_raw_list(&window_clone, &bangs_clone.borrow());
        refresh_bang_list(&doc_clone, &list_clone, bangs_clone.clone(), &window_clone);
      }
    });

    delete_btn
      .add_event_listener_with_callback("click", delete_handler.as_ref().unchecked_ref())
      .unwrap();
    delete_handler.forget();

    card.append_child(&delete_btn).unwrap();
    list_container.append_child(&card).unwrap();
  }
}

fn create_input(doc: &web_sys::Document, placeholder: &str) -> web_sys::Element {
  let input = create_element(
        doc,
        "input",
        "padding: 0.8rem; background: #313244; border: 1px solid #45475a; border-radius: 5px; color: #cdd6f4; outline: none;",
    );
  let _ = input.set_attribute("type", "text");
  let _ = input.set_attribute("placeholder", placeholder);
  input
}

/*
    Constructs the modal for adding new bangs.
    Uses Closures to handle Open, Close, and Save actions.
*/
fn create_modal(
  document: &web_sys::Document,
  window: &Window,
  bangs_state: Rc<RefCell<Vec<BangDefinition>>>,
  list_container: &web_sys::Element,
  trigger_btn: &web_sys::Element,
) -> (
  web_sys::Element,
  web_sys::Element,
  web_sys::Element,
  web_sys::Element,
) {
  let modal_overlay = create_element(
        document,
        "div",
        "display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); justify-content: center; align-items: center; z-index: 1000;",
    );
  let modal_content = create_element(
        document,
        "div",
        "background: #1e1e2e; padding: 2rem; border-radius: 10px; width: 90%; max-width: 400px; border: 1px solid #45475a; display: flex; flex-direction: column; gap: 1rem;",
    );

  let input_name = create_input(document, "Name (e.g. GitHub)");
  let input_trigger = create_input(document, "Triggers (e.g. gh, github)");
  let input_url = create_input(document, "URL (use {{{s}}} for query)");

  let modal_actions = create_element(
    document,
    "div",
    "display: flex; gap: 1rem; margin-top: 1rem;",
  );
  let save_btn = create_element(
        document,
        "button",
        "flex: 1; padding: 0.5rem; background: #89b4fa; border: none; border-radius: 5px; cursor: pointer; color: #1e1e2e; font-weight: bold;",
    );
  save_btn.set_text_content(Some("Save"));
  let cancel_btn = create_element(
        document,
        "button",
        "flex: 1; padding: 0.5rem; background: #45475a; border: none; border-radius: 5px; cursor: pointer; color: #cdd6f4;",
    );
  cancel_btn.set_text_content(Some("Cancel"));

  modal_actions.append_child(&save_btn).unwrap();
  modal_actions.append_child(&cancel_btn).unwrap();
  modal_content.append_child(&input_name).unwrap();
  modal_content.append_child(&input_trigger).unwrap();
  modal_content.append_child(&input_url).unwrap();
  modal_content.append_child(&modal_actions).unwrap();
  modal_overlay.append_child(&modal_content).unwrap();

  let modal_open = modal_overlay.clone();
  let open_handler = Closure::<dyn FnMut(_)>::new(move |_: Event| {
    let _ = modal_open.set_attribute("style", "display: flex; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); justify-content: center; align-items: center; z-index: 1000;");
  });
  trigger_btn
    .add_event_listener_with_callback("click", open_handler.as_ref().unchecked_ref())
    .unwrap();
  open_handler.forget();

  let modal_close = modal_overlay.clone();
  let close_handler = Closure::<dyn FnMut(_)>::new(move |_: Event| {
    let _ = modal_close.set_attribute("style", "display: none;");
  });
  cancel_btn
    .add_event_listener_with_callback("click", close_handler.as_ref().unchecked_ref())
    .unwrap();
  close_handler.forget();

  let modal_save = modal_overlay.clone();
  let doc_save = document.clone();
  let win_save = window.clone();
  let list_save = list_container.clone();
  let in_name: HtmlInputElement = input_name.clone().dyn_into().unwrap();
  let in_trigger: HtmlInputElement = input_trigger.clone().dyn_into().unwrap();
  let in_url: HtmlInputElement = input_url.clone().dyn_into().unwrap();

  let save_handler = Closure::<dyn FnMut(_)>::new(move |_: Event| {
    let name_val = in_name.value();
    let trigger_val = in_trigger.value();
    let url_val = in_url.value();

    if name_val.is_empty() || trigger_val.is_empty() || url_val.is_empty() {
      web_sys::window()
        .unwrap()
        .alert_with_message("Please fill all the fields!")
        .unwrap();
      return;
    }

    let triggers: Vec<String> = trigger_val
      .split(',')
      .map(|s| s.trim().to_string())
      .filter(|s| !s.is_empty())
      .collect();

    let new_bang = BangDefinition {
      name: name_val,
      identifiers: triggers,
      redirect_pattern: url_val,
    };

    bangs_state.borrow_mut().push(new_bang);
    save_raw_list(&win_save, &bangs_state.borrow());
    refresh_bang_list(&doc_save, &list_save, bangs_state.clone(), &win_save);

    let _ = modal_save.set_attribute("style", "display: none;");
    in_name.set_value("");
    in_trigger.set_value("");
    in_url.set_value("");
  });
  save_btn
    .add_event_listener_with_callback("click", save_handler.as_ref().unchecked_ref())
    .unwrap();
  save_handler.forget();

  (modal_overlay, input_name, input_trigger, input_url)
}
