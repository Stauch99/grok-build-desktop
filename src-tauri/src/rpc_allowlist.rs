use serde_json::Value;

#[derive(Clone, Copy)]
pub(crate) struct AgentRpcCaps {
    pub load_session: bool,
    pub list_sessions: bool,
    pub set_mode: bool,
    pub set_config_option: bool,
    pub authenticate: bool,
    pub vendor_xai: bool,
}

impl AgentRpcCaps {
    pub fn grok_legacy() -> Self {
        Self {
            load_session: true,
            list_sessions: false,
            set_mode: false,
            set_config_option: false,
            authenticate: false,
            vendor_xai: true,
        }
    }
}

const ALWAYS_RPC_METHODS: &[&str] = &[
    "initialize",
    "session/new",
    "session/prompt",
    "session/cancel",
];

pub(crate) fn rpc_payload_allowed(payload: &Value) -> bool {
    rpc_payload_allowed_for(payload, &AgentRpcCaps::grok_legacy())
}

pub(crate) fn rpc_payload_allowed_for(payload: &Value, caps: &AgentRpcCaps) -> bool {
    let Some(obj) = payload.as_object() else {
        return false;
    };
    let method = obj.get("method");
    let method_absent = method.is_none() || method == Some(&Value::Null);
    if method_absent {
        return obj.contains_key("id") && (obj.contains_key("result") || obj.contains_key("error"));
    }
    let Some(name) = method.and_then(Value::as_str) else {
        return false;
    };
    if ALWAYS_RPC_METHODS.contains(&name) {
        return true;
    }
    if caps.load_session && matches!(name, "session/load" | "session/resume") {
        return true;
    }
    if caps.list_sessions && name == "session/list" {
        return true;
    }
    if caps.set_mode && name == "session/set_mode" {
        return true;
    }
    if caps.set_config_option && matches!(name, "session/set_config_option" | "session/set_model") {
        return true;
    }
    if caps.authenticate && name == "authenticate" {
        return true;
    }
    if caps.vendor_xai && name.starts_with("_x.ai/") {
        return true;
    }
    false
}

#[cfg(test)]
mod rpc_allowlist_tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn rpc_payload_allowed_accepts_listed_methods() {
        for method in [
            "initialize",
            "session/new",
            "session/load",
            "session/resume",
            "session/prompt",
            "session/cancel",
        ] {
            let payload = json!({ "jsonrpc": "2.0", "id": 1, "method": method, "params": {} });
            assert!(rpc_payload_allowed(&payload), "{method}");
        }
        assert!(rpc_payload_allowed(&json!({
            "jsonrpc": "2.0",
            "method": "session/cancel",
            "params": { "sessionId": "s1" }
        })));
    }

    #[test]
    fn rpc_payload_allowed_accepts_jsonrpc_response() {
        assert!(rpc_payload_allowed(&json!({
            "jsonrpc": "2.0",
            "id": 7,
            "result": { "outcome": { "outcome": "selected", "optionId": "allow" } }
        })));
        assert!(rpc_payload_allowed(&json!({
            "id": "req-1",
            "error": { "code": -32600, "message": "invalid" }
        })));
        assert!(rpc_payload_allowed(&json!({
            "id": 1,
            "result": {},
            "method": null
        })));
    }

    #[test]
    fn rpc_payload_allowed_rejects_unknown_methods() {
        assert!(!rpc_payload_allowed(&json!({})));
        assert!(!rpc_payload_allowed(&json!({ "method": "fs/write", "params": {} })));
        assert!(!rpc_payload_allowed(&json!({ "jsonrpc": "2.0", "id": 1, "method": "session/foo" })));
        assert!(!rpc_payload_allowed(&json!({ "id": 1 })));
        assert!(!rpc_payload_allowed(&json!({ "method": "session/set_mode" })));
    }

    #[test]
    fn rpc_payload_allowed_accepts_xai_billing() {
        assert!(rpc_payload_allowed(&json!({
            "jsonrpc": "2.0",
            "id": 3,
            "method": "_x.ai/billing",
            "params": {}
        })));
        assert!(rpc_payload_allowed(&json!({ "method": "_x.ai/session/update" })));
        assert!(!rpc_payload_allowed(&json!({ "method": "_x.ai" })));
    }

    #[test]
    fn rpc_payload_allowed_for_kimi_caps_allows_session_config() {
        let caps = AgentRpcCaps {
            load_session: true,
            list_sessions: true,
            set_mode: true,
            set_config_option: true,
            authenticate: true,
            vendor_xai: false,
        };
        assert!(rpc_payload_allowed_for(
            &json!({ "method": "session/set_mode" }),
            &caps
        ));
        assert!(rpc_payload_allowed_for(
            &json!({ "method": "session/set_config_option" }),
            &caps
        ));
        assert!(rpc_payload_allowed_for(
            &json!({ "method": "session/set_model" }),
            &caps
        ));
        assert!(rpc_payload_allowed_for(
            &json!({ "method": "session/list" }),
            &caps
        ));
        assert!(rpc_payload_allowed_for(
            &json!({ "method": "authenticate" }),
            &caps
        ));
        assert!(!rpc_payload_allowed_for(
            &json!({ "method": "_x.ai/billing" }),
            &caps
        ));
    }

    #[test]
    fn grok_legacy_still_rejects_set_mode() {
        assert!(!rpc_payload_allowed(&json!({ "method": "session/set_mode" })));
        assert!(!rpc_payload_allowed(&json!({ "method": "authenticate" })));
        assert!(!rpc_payload_allowed(&json!({ "method": "session/list" })));
    }
}
