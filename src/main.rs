use poros::{logic, storage, ui};

fn main() {
  std::panic::set_hook(Box::new(console_error_panic_hook::hook));

  let window = web_sys::window().expect("Global window object missing");
  let document = window
    .document()
    .expect("Document object missing on window");

  // Fast Path: Query Parameter Redirect
  if let Ok(current_href) = window.location().href() {
    if let Ok(parsed_url) = web_sys::Url::new(&current_href) {
      if let Some(query_string) = parsed_url.search_params().get("query") {
        let decoded_query = urlencoding::decode(&query_string).unwrap_or_default();
        if !decoded_query.is_empty() {
          let bang_definitions = storage::load_bangs(&window);
          logic::execute_redirect(&decoded_query, &bang_definitions, &window);
          return;
        }
      }
    }
  }

  ui::inject_global_styles(&document);
  let body = document.body().expect("Document body missing");
  let _ = body.set_attribute("style", "margin: 0; padding: 0; background-color: #1e1e2e;");
  body.set_inner_html("");

  let main_container = ui::create_element(
        &document,
        "div",
        "min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; background-color: #1e1e2e; font-family: sans-serif;",
    );
  body.append_child(&main_container).unwrap();

  let is_settings_page = window
    .location()
    .search()
    .unwrap_or_default()
    .contains("settings");

  if is_settings_page {
    ui::settings::render(&window, &document, &main_container);
  } else {
    ui::home::render(&window, &document, &main_container);
  }
}
