use gloo_net::http::Request;
use serde::{Deserialize, Serialize};
use wasm_bindgen::JsValue;
use std::collections::HashMap;
use wasm_bindgen_futures::spawn_local;
use web_sys::{console, HtmlInputElement};
use yew::prelude::*;

#[derive(Debug, Clone, PartialEq, Deserialize, Serialize)]
pub struct Bang {
    pub name: String,
    pub id: Vec<String>,
    pub url: String,
}

const BANG_PREFIX: &str = "!";
const DEFAULT_TAG: &str = "g";

fn build_index(bangs: &[Bang]) -> HashMap<String, Bang> {
    let mut map = HashMap::new();
    for bang in bangs {
        for tag in &bang.id {
            map.insert(tag.clone(), bang.clone());
        }
    }
    map
}

fn handle_query(input: &str, index: &HashMap<String, Bang>) -> Result<(), JsValue> {
    console::log_1(&JsValue::from_str(&format!("Handling query: {}", input)));
    let trimmed = input.trim();
    let (tag, search) = if trimmed.starts_with(BANG_PREFIX) {
        if let Some((t, s)) = trimmed.split_once(' ') {
            (&t[BANG_PREFIX.len()..], s)
        } else {
            (&trimmed[BANG_PREFIX.len()..], "")
        }
    } else {
        (DEFAULT_TAG, trimmed)
    };
    let bang = index.get(tag).unwrap_or_else(|| index.get(DEFAULT_TAG).unwrap());
    let final_url = bang.url.replace("{{{s}}}", &urlencoding::encode(search));
    web_sys::window().ok_or("window missing")?.location().set_href(&final_url)
}

#[function_component(App)]
fn app() -> Html {
    let bang_index = use_state(|| HashMap::<String, Bang>::new());
    let query = use_state(|| "".to_string());

    {
        let bang_index = bang_index.clone();
        use_effect_with((), move |_| {
            spawn_local(async move {
                if let Ok(resp) = Request::get("/poros/static/bangs.json").send().await {
                    if let Ok(text) = resp.text().await {
                        if let Ok(parsed) = serde_json::from_str::<Vec<Bang>>(&text) {
                            let idx = build_index(&parsed);
                            bang_index.set(idx.clone());
                            if let Some(window) = web_sys::window() {
                                if let Ok(href) = window.location().href() {
                                    if let Ok(url) = web_sys::Url::new(&href) {
                                        if let Some(q) = url.search_params().get("query") {
                                            let decoded = urlencoding::decode(&q).unwrap_or_default();
                                            let _ = handle_query(&decoded, &idx);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            });
            || ()
        });
    }

    let oninput = {
        let query = query.clone();
        Callback::from(move |e: InputEvent| {
            let input: HtmlInputElement = e.target_unchecked_into();
            query.set(input.value());
        })
    };

    let onsubmit = {
        let query = query.clone();
        let bang_index = bang_index.clone();
        Callback::from(move |e: SubmitEvent| {
            e.prevent_default();
            let input = (*query).trim().to_string();
            if !bang_index.is_empty() && !input.is_empty() {
                let _ = handle_query(&input, &bang_index);
            }
        })
    };


    html! {
        <div style="height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center; background-color:#1e1e2e;">
            <h1 style="color:#f9e2af;font-size:5em">{"Poros"}</h1>
            <form {onsubmit}>
                <label for="search_input" style="display:none;">{"Search"}</label>
                <input
                    id="search_input"
                    type="text"
                    placeholder="Search with !bang"
                    value={(*query).clone()}
                    {oninput}
                    style="padding:0.5rem 1rem;font-size:1.2rem;width:20rem;border:5px solid #b4befe;border-radius:10px;"
                />
            </form>
        </div>
    }
}

fn main() {
    yew::Renderer::<App>::new().render();
}
