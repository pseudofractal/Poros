use crate::models::{parse_js_value, serialize_bangs, BangDefinition};
use std::collections::HashMap;
use web_sys::Window;

const LOCAL_STORAGE_KEY: &str = "poros_bangs";
const BUILT_IN_BANGS_JSON: &str = include_str!("../static/bangs.json");

pub fn load_bangs(window: &Window) -> HashMap<String, BangDefinition> {
  let mut bang_map = HashMap::new();

  let default_bangs = parse_js_value(BUILT_IN_BANGS_JSON);
  for bang in default_bangs {
    for identifier in &bang.identifiers {
      bang_map.insert(identifier.clone(), bang.clone());
    }
  }

  if let Ok(Some(local_storage)) = window.local_storage() {
    if let Ok(Some(user_json)) = local_storage.get_item(LOCAL_STORAGE_KEY) {
      let user_bangs = parse_js_value(&user_json);
      for bang in user_bangs {
        for identifier in &bang.identifiers {
          bang_map.insert(identifier.clone(), bang.clone());
        }
      }
    }
  }

  bang_map
}

pub fn load_raw_list(window: &Window) -> Vec<BangDefinition> {
  if let Ok(Some(local_storage)) = window.local_storage() {
    if let Ok(Some(user_json)) = local_storage.get_item(LOCAL_STORAGE_KEY) {
      let user_bangs = parse_js_value(&user_json);
      if !user_bangs.is_empty() {
        return user_bangs;
      }
    }
  }
  parse_js_value(BUILT_IN_BANGS_JSON)
}

pub fn save_raw_list(window: &Window, bangs: &[BangDefinition]) {
  if let Ok(Some(storage)) = window.local_storage() {
    let json_string = serialize_bangs(bangs);
    let _ = storage.set_item(LOCAL_STORAGE_KEY, &json_string);
  }
}
