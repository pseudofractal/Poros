use crate::models::BangDefinition;
use std::collections::HashMap;
use web_sys::Window;

const BANG_TRIGGER: &str = "!";
const DEFAULT_BANG_IDENTIFIER: &str = "g";

pub fn execute_redirect(
  raw_input: &str,
  bang_definitions: &HashMap<String, BangDefinition>,
  window: &Window,
) {
  let input_tokens: Vec<&str> = raw_input.split_whitespace().collect();
  let mut selected_identifier = DEFAULT_BANG_IDENTIFIER;
  let mut search_query_parts = Vec::new();
  let mut bang_has_been_found = false;

  for token in input_tokens {
    if !bang_has_been_found && token.starts_with(BANG_TRIGGER) {
      let potential_identifier = &token[BANG_TRIGGER.len()..];
      if bang_definitions.contains_key(potential_identifier) {
        selected_identifier = potential_identifier;
        bang_has_been_found = true;
        continue;
      }
    }
    search_query_parts.push(token);
  }

  let search_query = search_query_parts.join(" ");

  let target_bang = bang_definitions
    .get(selected_identifier)
    .unwrap_or_else(|| bang_definitions.get(DEFAULT_BANG_IDENTIFIER).unwrap());

  let encoded_search_query = urlencoding::encode(&search_query);
  let final_destination_url = target_bang
    .redirect_pattern
    .replace("{{{s}}}", &encoded_search_query);

  let _ = window.location().set_href(&final_destination_url);
}
