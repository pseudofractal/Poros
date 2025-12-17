pub mod home;
pub mod settings;

use web_sys::{Document, Element};

pub fn create_element(doc: &Document, tag: &str, style: &str) -> Element {
  let el = doc.create_element(tag).unwrap();
  let _ = el.set_attribute("style", style);
  el
}

pub fn render_header(document: &Document, container: &Element) {
  let logo_image = create_element(document, "img", "margin-bottom: 1rem;");
  let _ = logo_image.set_attribute("src", "static/logo.svg");
  let _ = logo_image.set_attribute("width", "120");
  container.append_child(&logo_image).unwrap();

  let title_heading = create_element(
    document,
    "h1",
    "color: #f9e2af; font-size: 4em; margin: 0; margin-bottom: 2rem;",
  );
  title_heading.set_text_content(Some("Poros"));
  container.append_child(&title_heading).unwrap();
}

pub fn inject_global_styles(document: &Document) {
  let style = document.create_element("style").unwrap();

  let css = r#"
        /* Scrollbar for WebKit (Chrome, Edge, Safari) */
        ::-webkit-scrollbar {
            width: 10px;
        }
        ::-webkit-scrollbar-track {
            background: #1e1e2e; 
        }
        ::-webkit-scrollbar-thumb {
            background: #45475a; 
            border-radius: 5px;
            border: 2px solid #1e1e2e; /* Creates padding effect */
        }
        ::-webkit-scrollbar-thumb:hover {
            background: #585b70; 
        }

        /* Scrollbar for Firefox */
        * {
            scrollbar-width: thin;
            scrollbar-color: #45475a #1e1e2e;
        }
    "#;

  style.set_text_content(Some(css));

  let head = document.head().expect("Document head missing");
  head.append_child(&style).unwrap();
}
