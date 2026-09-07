use serde_json::{json, Value};
use std::io::{BufRead, Write};

const MOCK_SESSION_ID: &str = "mock-session";
const MOCK_REPLY: &str = "ok";

pub fn use_mock_acp() -> bool {
    use_mock_acp_from_env(|k| std::env::var(k).ok())
}

pub fn use_mock_acp_from_env(get: impl Fn(&str) -> Option<String>) -> bool {
    ["GROK_BUILD_ACP", "GROK_APP_ACP"]
        .iter()
        .any(|key| get(key).is_some_and(|v| v.eq_ignore_ascii_case("mock")))
}

/// JSON-RPC replies (notifications first, then the result) for one client request.
pub fn mock_acp_replies(req: &Value) -> Vec<Value> {
    let id = req.get("id").cloned().unwrap_or(json!(null));
    let method = req.get("method").and_then(|v| v.as_str()).unwrap_or("");
    let params = req.get("params").cloned().unwrap_or(json!({}));
    match method {
        "initialize" => vec![json!({
            "jsonrpc": "2.0",
            "id": id,
            "result": {
                "protocolVersion": 1,
                "agentCapabilities": { "loadSession": false },
                "agentInfo": { "name": "mock-acp" }
            }
        })],
        "session/new" => vec![json!({
            "jsonrpc": "2.0",
            "id": id,
            "result": { "sessionId": MOCK_SESSION_ID }
        })],
        "session/prompt" => {
            let session_id = params
                .get("sessionId")
                .and_then(|v| v.as_str())
                .unwrap_or(MOCK_SESSION_ID);
            vec![
                json!({
                    "jsonrpc": "2.0",
                    "method": "session/update",
                    "params": {
                        "sessionId": session_id,
                        "update": {
                            "sessionUpdate": "agent_message_chunk",
                            "content": { "type": "text", "text": MOCK_REPLY }
                        }
                    }
                }),
                json!({
                    "jsonrpc": "2.0",
                    "id": id,
                    "result": { "stopReason": "end_turn" }
                }),
            ]
        }
        "session/cancel" => vec![json!({
            "jsonrpc": "2.0",
            "id": id,
            "result": {}
        })],
        "session/list" => vec![json!({
            "jsonrpc": "2.0",
            "id": id,
            "result": { "sessions": [] }
        })],
        _ => vec![json!({
            "jsonrpc": "2.0",
            "id": id,
            "error": { "code": -32601, "message": format!("mock: unknown method {method}") }
        })],
    }
}

pub fn run_mock_acp_stdio() {
    let stdin = std::io::stdin();
    let mut stdout = std::io::stdout();
    for line in stdin.lock().lines() {
        let Ok(line) = line else { break };
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let Ok(req) = serde_json::from_str::<Value>(trimmed) else {
            continue;
        };
        for reply in mock_acp_replies(&req) {
            if writeln!(stdout, "{reply}").is_err() {
                return;
            }
        }
        let _ = stdout.flush();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mock_env_accepts_either_var() {
        assert!(!use_mock_acp_from_env(|_| None));
        assert!(use_mock_acp_from_env(
            |k| (k == "GROK_BUILD_ACP").then(|| "mock".into())
        ));
        assert!(use_mock_acp_from_env(
            |k| (k == "GROK_APP_ACP").then(|| "MOCK".into())
        ));
        assert!(!use_mock_acp_from_env(
            |k| (k == "GROK_BUILD_ACP").then(|| "real".into())
        ));
    }

    #[test]
    fn initialize_and_prompt_are_golden() {
        let init =
            mock_acp_replies(&json!({"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}));
        assert_eq!(init[0]["result"]["protocolVersion"], 1);
        let created = mock_acp_replies(
            &json!({"jsonrpc":"2.0","id":2,"method":"session/new","params":{"cwd":"."}}),
        );
        assert_eq!(created[0]["result"]["sessionId"], MOCK_SESSION_ID);
        let prompted = mock_acp_replies(&json!({
            "jsonrpc":"2.0","id":3,"method":"session/prompt",
            "params":{"sessionId":"s1","prompt":[{"type":"text","text":"hi"}]}
        }));
        assert_eq!(prompted.len(), 2);
        assert_eq!(prompted[0]["method"], "session/update");
        assert_eq!(
            prompted[0]["params"]["update"]["content"]["text"],
            MOCK_REPLY
        );
        assert_eq!(prompted[1]["result"]["stopReason"], "end_turn");
        let cancel = mock_acp_replies(
            &json!({"jsonrpc":"2.0","id":4,"method":"session/cancel","params":{}}),
        );
        assert_eq!(cancel[0]["result"], json!({}));
    }
}
