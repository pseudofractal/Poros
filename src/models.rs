use wasm_bindgen::prelude::*;
use wasm_bindgen::JsCast;

// Manual bindings to JS built-ins to avoid bundling heavy Rust JSON libraries
#[wasm_bindgen]
extern "C" {
  #[wasm_bindgen(js_namespace = JSON, catch)]
  fn parse(text: &str) -> Result<JsValue, JsValue>;

  type Array;
  #[wasm_bindgen(method, structural, getter)]
  fn length(this: &Array) -> u32;

  #[wasm_bindgen(method, structural, indexing_getter)]
  fn get(this: &Array, index: u32) -> JsValue;

  #[wasm_bindgen(js_namespace = Reflect, catch, js_name = get)]
  fn reflect_get(target: &JsValue, key: &JsValue) -> Result<JsValue, JsValue>;
}

#[derive(Clone, Debug)]
pub struct BangDefinition {
  pub name: String,
  pub identifiers: Vec<String>,
  pub redirect_pattern: String,
}

pub fn parse_js_value(json_string: &str) -> Vec<BangDefinition> {
  let mut parsed_bangs = Vec::new();

  let javascript_value = match parse(json_string) {
    Ok(value) => value,
    Err(_) => {
      web_sys::console::error_1(&"Failed to parse JSON".into());
      return parsed_bangs;
    }
  };

  let javascript_array = match javascript_value.dyn_into::<Array>() {
    Ok(array) => array,
    Err(_) => return parsed_bangs,
  };

  for index in 0..javascript_array.length() {
    let bang_object = javascript_array.get(index);

    let url_key = JsValue::from_str("url");
    let url_value = reflect_get(&bang_object, &url_key).unwrap_or(JsValue::UNDEFINED);
    let redirect_pattern = url_value.as_string().unwrap_or_default();

    let name_key = JsValue::from_str("name");
    let name_value = reflect_get(&bang_object, &name_key).unwrap_or(JsValue::UNDEFINED);
    let name = name_value
      .as_string()
      .unwrap_or_else(|| "Custom".to_string());

    let id_key = JsValue::from_str("id");
    let id_value = reflect_get(&bang_object, &id_key).unwrap_or(JsValue::UNDEFINED);

    let mut identifiers = Vec::new();
    if let Ok(id_array) = id_value.dyn_into::<Array>() {
      for sub_index in 0..id_array.length() {
        if let Some(identifier_string) = id_array.get(sub_index).as_string() {
          identifiers.push(identifier_string);
        }
      }
    }

    if !redirect_pattern.is_empty() && !identifiers.is_empty() {
      parsed_bangs.push(BangDefinition {
        name,
        identifiers,
        redirect_pattern,
      });
    }
  }
  parsed_bangs
}

/*
    Manually serializes the struct into a JSON string.
    We do this because `serde_json` is large, and we only need basic serialization
    for saving to localStorage. We carefully escape quotes to prevent invalid JSON.
*/
pub fn serialize_bangs(bangs: &[BangDefinition]) -> String {
  let mut json = String::from("[");
  for (i, bang) in bangs.iter().enumerate() {
    if i > 0 {
      json.push(',');
    }

    let safe_name = bang.name.replace("\"", "\\\"");
    let safe_url = bang.redirect_pattern.replace("\"", "\\\"");

    let ids_json = bang
      .identifiers
      .iter()
      .map(|id| format!("\"{}\"", id))
      .collect::<Vec<_>>()
      .join(",");

    json.push_str(&format!(
      r#"{{"name":"{}","id":[{}],"url":"{}"}}"#,
      safe_name, ids_json, safe_url
    ));
  }
  json.push(']');
  json
}
