use crate::agents_paths;
use serde_json::{json, Map, Value};

const AGENTS: &[&str] = &["grok", "kimi", "claude", "codex"];

pub(crate) fn migrate_session_key(key: &str) -> Option<String> {
    if key.is_empty() {
        return None;
    }
    if let Some((agent, rest)) = key.split_once('/') {
        if rest.is_empty() {
            return None;
        }
        if AGENTS.contains(&agent) {
            Some(key.to_string())
        } else {
            None
        }
    } else {
        Some(format!("grok/{key}"))
    }
}

pub(crate) fn migrate_session_map(value: &Value) -> Value {
    let Some(obj) = value.as_object() else {
        return value.clone();
    };
    let mut out = Map::new();
    for (key, val) in obj {
        if let Some(new_key) = migrate_session_key(key) {
            out.insert(new_key, val.clone());
        }
    }
    Value::Object(out)
}

fn migrate_session_string_array(value: &Value) -> Value {
    let Some(arr) = value.as_array() else {
        return value.clone();
    };
    let migrated: Vec<Value> = arr
        .iter()
        .filter_map(|v| v.as_str())
        .filter_map(migrate_session_key)
        .map(Value::String)
        .collect();
    Value::Array(migrated)
}

pub(crate) fn migrate_workbench_doc(mut doc: Value) -> Value {
    let Some(obj) = doc.as_object_mut() else {
        return doc;
    };

    for field in ["pinned", "titles", "drafts", "archived", "unread"] {
        let Some(val) = obj.get(field).cloned() else {
            continue;
        };
        let migrated = if val.is_object() {
            migrate_session_map(&val)
        } else if (field == "pinned" || field == "archived") && val.is_array() {
            migrate_session_string_array(&val)
        } else {
            val
        };
        obj.insert(field.to_string(), migrated);
    }

    if !obj.contains_key("lastAgent") {
        obj.insert("lastAgent".to_string(), json!("grok"));
    }

    doc
}

pub(crate) fn should_copy_webui(workbench_exists: bool, grok_webui_exists: bool) -> bool {
    agents_paths::should_migrate_webui(workbench_exists, grok_webui_exists)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn migrates_bare_keys_and_keeps_branded() {
        assert_eq!(migrate_session_key("abc").as_deref(), Some("grok/abc"));
        assert_eq!(migrate_session_key("claude/x").as_deref(), Some("claude/x"));
        assert_eq!(migrate_session_key(""), None);
        assert_eq!(migrate_session_key("nope/x"), None);
        let doc = migrate_workbench_doc(json!({
            "pinned": { "s1": true },
            "titles": { "s1": "Hi" },
            "theme": "dark"
        }));
        assert_eq!(doc["pinned"]["grok/s1"], true);
        assert_eq!(doc["titles"]["grok/s1"], "Hi");
        assert_eq!(doc["theme"], "dark");
        assert_eq!(doc["lastAgent"], "grok");
        let arr = migrate_workbench_doc(json!({ "pinned": ["s1", "claude/x"] }));
        assert_eq!(arr["pinned"], json!(["grok/s1", "claude/x"]));
    }

    #[test]
    fn migrate_session_map_drops_invalid_keys() {
        let map = migrate_session_map(&json!({
            "a": 1,
            "b": 2,
            "nope/x": 3,
            "": 4
        }));
        assert_eq!(map["grok/a"], 1);
        assert_eq!(map["grok/b"], 2);
        assert!(map.get("nope/x").is_none());
        assert_eq!(map.as_object().unwrap().len(), 2);
    }

    #[test]
    fn should_copy_webui_delegates_to_agents_paths() {
        assert!(should_copy_webui(false, true));
        assert!(!should_copy_webui(true, true));
        assert!(!should_copy_webui(false, false));
    }
}
