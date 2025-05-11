use yew::prelude::*;

#[function_component(App)]
fn app() -> Html {
    html! {
        <div style="display: flex; height: 100vh; justify-content: center; align-items: center; flex-direction: column;">
            <h1>{ "Poros" }</h1>
            <input type="text" placeholder="Enter your search query" style="padding: 5px;"/>
        </div>
    }
}

fn main() {
    yew::Renderer::<App>::new().render();
}
