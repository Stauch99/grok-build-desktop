#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    if std::env::args().any(|a| a == "--acp-mock-stdio") {
        grok_build_webui_lib::run_mock_acp_stdio();
        return;
    }
    grok_build_webui_lib::run();
}
