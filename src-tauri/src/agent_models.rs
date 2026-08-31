use std::path::{Path, PathBuf};
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::State;
use toml_edit::{DocumentMut, Item};

use crate::agent_host::{parse_agent_id_arg, AgentId};
use crate::{AppError, AppResult, AppState};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SlimModelDto {
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub efforts: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub default_effort: Option<String>,
    #[serde(default)]
    pub is_default: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SlimBundle {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub current_model: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub current_effort: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub models: Vec<SlimModelDto>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentModelSourceDto {
    pub agent_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub grok_list: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub grok_cache: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub grok_prefs: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub kimi: Option<SlimBundle>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub claude: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub codex: Option<SlimBundle>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentModelPatch {
    pub model: Option<String>,
    pub effort: Option<String>,
}

fn read_text(path: &Path) -> String {
    if !path.is_file() {
        return String::new();
    }
    std::fs::read_to_string(path).unwrap_or_default()
}

fn array_strings(item: Option<&Item>) -> Vec<String> {
    item.and_then(|i| i.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(|s| s.trim().to_string()))
                .filter(|s| !s.is_empty())
                .collect()
        })
        .unwrap_or_default()
}

pub(crate) fn kimi_bundle_from_toml(text: &str) -> SlimBundle {
    let doc = text.parse::<DocumentMut>().unwrap_or_default();
    let current_model = doc
        .get("default_model")
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    let current_effort = doc
        .get("thinking")
        .and_then(|t| t.get("effort"))
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    let mut models = Vec::new();
    if let Some(tbl) = doc.get("models").and_then(|i| i.as_table()) {
        for (key, item) in tbl.iter() {
            let Some(model_tbl) = item.as_table() else { continue };
            let id = key.trim();
            if id.is_empty() {
                continue;
            }
            let label = model_tbl
                .get("display_name")
                .and_then(|v| v.as_str())
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty());
            let efforts = array_strings(model_tbl.get("support_efforts"));
            let default_effort = model_tbl
                .get("default_effort")
                .and_then(|v| v.as_str())
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty());
            models.push(SlimModelDto {
                is_default: current_model.as_deref() == Some(id),
                id: id.to_string(),
                label,
                efforts,
                default_effort,
            });
        }
    }
    SlimBundle {
        current_model,
        current_effort,
        models,
    }
}

pub(crate) fn claude_excerpt(text: &str) -> Value {
    let v: Value = serde_json::from_str(text).unwrap_or_else(|_| json!({}));
    json!({
        "model": v.get("model").and_then(|x| x.as_str()),
        "effortLevel": v.get("effortLevel").or_else(|| v.get("effort")).and_then(|x| x.as_str()),
    })
}

pub(crate) fn slim_codex_cache(v: &Value) -> Vec<SlimModelDto> {
    let Some(arr) = v.get("models").and_then(|m| m.as_array()) else {
        return Vec::new();
    };
    let mut out = Vec::new();
    for row in arr {
        if let Some(vis) = row.get("visibility").and_then(|x| x.as_str()) {
            if vis != "list" {
                continue;
            }
        }
        let Some(id) = row.get("slug").and_then(|x| x.as_str()).map(str::trim).filter(|s| !s.is_empty()) else {
            continue;
        };
        let label = row
            .get("display_name")
            .and_then(|x| x.as_str())
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string());
        let default_effort = row
            .get("default_reasoning_level")
            .and_then(|x| x.as_str())
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string());
        let efforts = row
            .get("supported_reasoning_levels")
            .and_then(|x| x.as_array())
            .map(|levels| {
                levels
                    .iter()
                    .filter_map(|l| l.get("effort").and_then(|e| e.as_str()).map(|s| s.trim().to_string()))
                    .filter(|s| !s.is_empty())
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();
        out.push(SlimModelDto {
            id: id.to_string(),
            label,
            efforts,
            default_effort,
            is_default: false,
        });
    }
    out
}

fn grok_prefs_from_toml(text: &str) -> Value {
    let doc = text.parse::<DocumentMut>().unwrap_or_default();
    let model = doc
        .get("models")
        .and_then(|t| t.get("default"))
        .and_then(|v| v.as_str());
    let effort = doc
        .get("models")
        .and_then(|t| t.get("default_reasoning_effort"))
        .and_then(|v| v.as_str());
    json!({ "model": model, "effort": effort })
}

fn slim_grok_cache(v: Value) -> Value {
    let Some(models) = v.get("models").and_then(|m| m.as_object()) else {
        return json!({ "models": {} });
    };
    let mut out = serde_json::Map::new();
    for (id, row) in models {
        let info = row.get("info");
        let hidden = info.and_then(|i| i.get("hidden")).and_then(|h| h.as_bool()).unwrap_or(false);
        if hidden {
            continue;
        }
        let slug = info
            .and_then(|i| i.get("id"))
            .and_then(|x| x.as_str())
            .unwrap_or(id);
        let name = info.and_then(|i| i.get("name")).and_then(|x| x.as_str());
        out.insert(
            id.clone(),
            json!({ "info": { "id": slug, "name": name, "hidden": false } }),
        );
    }
    json!({ "models": out })
}

fn codex_toml_prefs(text: &str) -> (Option<String>, Option<String>) {
    let doc = text.parse::<DocumentMut>().unwrap_or_default();
    let model = doc
        .get("model")
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    let effort = doc
        .get("model_reasoning_effort")
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    (model, effort)
}

fn clean_pref(raw: Option<&str>) -> AppResult<Option<String>> {
    let Some(s) = raw.map(str::trim).filter(|v| !v.is_empty()) else {
        return Ok(None);
    };
    if s.contains('\n') || s.contains('\0') {
        return Err(AppError::Message("不支持的设置字段".into()));
    }
    Ok(Some(s.to_string()))
}

fn write_text(path: &Path, text: &str) -> AppResult<()> {
    crate::reject_oversized_config_text(text)?;
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    std::fs::write(path, text).map_err(|e| AppError::Message(e.to_string()))
}

fn patch_kimi_toml(text: &str, model: Option<&str>, effort: Option<&str>) -> AppResult<String> {
    let mut doc = text.parse::<DocumentMut>().unwrap_or_default();
    if let Some(model) = model {
        doc["default_model"] = toml_edit::value(model);
    }
    if let Some(effort) = effort {
        crate::ensure_table(&mut doc, "thinking")["effort"] = toml_edit::value(effort);
    }
    Ok(doc.to_string())
}

fn patch_codex_toml(text: &str, model: Option<&str>, effort: Option<&str>) -> AppResult<String> {
    let mut doc = text.parse::<DocumentMut>().unwrap_or_default();
    if let Some(model) = model {
        doc["model"] = toml_edit::value(model);
    }
    if let Some(effort) = effort {
        doc["model_reasoning_effort"] = toml_edit::value(effort);
    }
    Ok(doc.to_string())
}

fn patch_claude_json(text: &str, model: Option<&str>, effort: Option<&str>) -> AppResult<String> {
    let mut v: Value = if text.trim().is_empty() {
        json!({})
    } else {
        serde_json::from_str(text).map_err(|e| AppError::Message(e.to_string()))?
    };
    let obj = v
        .as_object_mut()
        .ok_or_else(|| AppError::Message("不支持的设置字段".into()))?;
    if let Some(model) = model {
        obj.insert("model".into(), json!(model));
    }
    if let Some(effort) = effort {
        obj.insert("effortLevel".into(), json!(effort));
    }
    serde_json::to_string_pretty(&v).map_err(|e| AppError::Message(e.to_string()))
}

fn kimi_config_path(home: &Path) -> PathBuf {
    home.join(".kimi-code").join("config.toml")
}

fn claude_settings_path(home: &Path) -> PathBuf {
    home.join(".claude").join("settings.json")
}

fn codex_config_path(home: &Path) -> PathBuf {
    home.join(".codex").join("config.toml")
}

fn grok_source() -> AgentModelSourceDto {
    let grok = crate::grok_home();
    let grok_prefs = grok_prefs_from_toml(&read_text(&crate::config_path()));
    let grok_cache = {
        let path = grok.join("models_cache.json");
        let text = read_text(&path);
        if text.trim().is_empty() {
            None
        } else {
            serde_json::from_str::<Value>(&text)
                .ok()
                .map(slim_grok_cache)
        }
    };
    AgentModelSourceDto {
        agent_id: "grok".into(),
        grok_list: None,
        grok_cache,
        grok_prefs: Some(grok_prefs),
        kimi: None,
        claude: None,
        codex: None,
    }
}

fn kimi_source(home: &Path) -> AgentModelSourceDto {
    AgentModelSourceDto {
        agent_id: "kimi".into(),
        grok_list: None,
        grok_cache: None,
        grok_prefs: None,
        kimi: Some(kimi_bundle_from_toml(&read_text(&kimi_config_path(home)))),
        claude: None,
        codex: None,
    }
}

fn claude_source(home: &Path) -> AgentModelSourceDto {
    AgentModelSourceDto {
        agent_id: "claude".into(),
        grok_list: None,
        grok_cache: None,
        grok_prefs: None,
        kimi: None,
        claude: Some(claude_excerpt(&read_text(&claude_settings_path(home)))),
        codex: None,
    }
}

fn codex_source(home: &Path) -> AgentModelSourceDto {
    let (current_model, current_effort) = codex_toml_prefs(&read_text(&codex_config_path(home)));
    let cache_text = read_text(&home.join(".codex").join("models_cache.json"));
    let cache: Value = serde_json::from_str(&cache_text).unwrap_or_else(|_| json!({}));
    let mut models = slim_codex_cache(&cache);
    if let Some(id) = current_model.as_deref() {
        for row in &mut models {
            row.is_default = row.id == id;
        }
    }
    AgentModelSourceDto {
        agent_id: "codex".into(),
        grok_list: None,
        grok_cache: None,
        grok_prefs: None,
        kimi: None,
        claude: None,
        codex: Some(SlimBundle {
            current_model,
            current_effort,
            models,
        }),
    }
}

#[tauri::command]
pub async fn read_agent_model_source(agent_id: Option<String>) -> AppResult<AgentModelSourceDto> {
    let id = parse_agent_id_arg(agent_id.as_deref()).map_err(AppError::Message)?;
    let home = crate::dirs_home();
    let mut source = match id {
        AgentId::Grok => grok_source(),
        AgentId::Kimi => kimi_source(&home),
        AgentId::Claude => claude_source(&home),
        AgentId::Codex => codex_source(&home),
    };
    if id == AgentId::Grok {
        source.grok_list = crate::cli_bridge::list_models_text().await.ok();
    }
    Ok(source)
}

#[tauri::command]
pub async fn patch_agent_model_settings(
    state: State<'_, Arc<AppState>>,
    agent_id: Option<String>,
    patch: AgentModelPatch,
) -> AppResult<Value> {
    let id = parse_agent_id_arg(agent_id.as_deref()).map_err(AppError::Message)?;
    let model = clean_pref(patch.model.as_deref())?;
    let effort = clean_pref(patch.effort.as_deref())?;
    if model.is_none() && effort.is_none() {
        return Ok(json!({ "ok": true }));
    }
    let _guard = state.config_write.lock().await;
    let home = crate::dirs_home();
    tokio::task::spawn_blocking(move || {
        match id {
            AgentId::Grok => {
                let path = crate::config_path();
                let text = read_text(&path);
                crate::reject_oversized_config_text(&text)?;
                let mut doc = text.parse::<DocumentMut>().unwrap_or_default();
                let mut obj = serde_json::Map::new();
                if let Some(model) = model {
                    obj.insert("model".into(), json!(model));
                }
                if let Some(effort) = effort {
                    obj.insert("effort".into(), json!(effort));
                }
                crate::apply_cli_patch(&mut doc, &Value::Object(obj))?;
                write_text(&path, &doc.to_string())?;
            }
            AgentId::Kimi => {
                let path = kimi_config_path(&home);
                let next = patch_kimi_toml(&read_text(&path), model.as_deref(), effort.as_deref())?;
                write_text(&path, &next)?;
            }
            AgentId::Claude => {
                let path = claude_settings_path(&home);
                let next = patch_claude_json(&read_text(&path), model.as_deref(), effort.as_deref())?;
                write_text(&path, &next)?;
            }
            AgentId::Codex => {
                let path = codex_config_path(&home);
                let next = patch_codex_toml(&read_text(&path), model.as_deref(), effort.as_deref())?;
                write_text(&path, &next)?;
            }
        }
        Ok(json!({ "ok": true }))
    })
    .await
    .map_err(|e| AppError::Message(e.to_string()))?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn kimi_bundle_drops_api_keys() {
        let text = r#"
default_model = "kimi-code/k3"
api_key = "sk-secret"

[thinking]
effort = "high"

[models."kimi-code/k3"]
display_name = "Kimi K3"
support_efforts = ["low", "high", "max"]
default_effort = "high"
api_key = "sk-model-secret"

[models.custom]
display_name = "Custom"
support_efforts = ["low", "medium", "high", "xhigh", "none"]
token = "leak-me"
"#;
        let bundle = kimi_bundle_from_toml(text);
        let dumped = serde_json::to_string(&bundle).unwrap();
        assert!(!dumped.contains("sk-secret"));
        assert!(!dumped.contains("sk-model-secret"));
        assert!(!dumped.contains("leak-me"));
        assert!(!dumped.contains("api_key"));
        assert_eq!(bundle.current_model.as_deref(), Some("kimi-code/k3"));
        assert_eq!(bundle.current_effort.as_deref(), Some("high"));
        let k3 = bundle.models.iter().find(|m| m.id == "kimi-code/k3").unwrap();
        assert_eq!(k3.label.as_deref(), Some("Kimi K3"));
        assert_eq!(k3.efforts, vec!["low", "high", "max"]);
        let custom = bundle.models.iter().find(|m| m.id == "custom").unwrap();
        assert_eq!(custom.efforts.last().map(String::as_str), Some("none"));
        assert_eq!(bundle.models.len(), 2);
    }

    #[test]
    fn claude_excerpt_keeps_only_model_and_effort() {
        let v = claude_excerpt(r#"{"model":"opus[1m]","effortLevel":"max","env":{"ANTHROPIC_API_KEY":"sk-ant"}}"#);
        let dumped = v.to_string();
        assert!(!dumped.contains("sk-ant"));
        assert_eq!(v.get("model").and_then(|x| x.as_str()), Some("opus[1m]"));
        assert_eq!(v.get("effortLevel").and_then(|x| x.as_str()), Some("max"));
    }

    #[test]
    fn codex_cache_drops_base_instructions() {
        let raw = json!({
            "models": [{
                "slug": "gpt-5.4",
                "display_name": "GPT-5.4",
                "default_reasoning_level": "medium",
                "visibility": "list",
                "base_instructions": "NEVER LEAK THIS SYSTEM PROMPT",
                "supported_reasoning_levels": [
                    { "effort": "low", "description": "fast" },
                    { "effort": "high", "description": "think" }
                ]
            }, {
                "slug": "hidden",
                "visibility": "hidden",
                "base_instructions": "nope"
            }]
        });
        let rows = slim_codex_cache(&raw);
        let dumped = serde_json::to_string(&rows).unwrap();
        assert!(!dumped.contains("NEVER LEAK"));
        assert!(!dumped.contains("base_instructions"));
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].id, "gpt-5.4");
        assert_eq!(rows[0].efforts, vec!["low", "high"]);
    }

    #[test]
    fn patch_kimi_writes_default_model_and_thinking() {
        let next = patch_kimi_toml("", Some("kimi-code/k2"), Some("max")).unwrap();
        assert!(next.contains("default_model"));
        assert!(next.contains("kimi-code/k2"));
        assert!(next.contains("[thinking]"));
        assert!(next.contains("max"));
    }

    #[test]
    fn patch_codex_writes_root_keys() {
        let next = patch_codex_toml("model = \"old\"\n", Some("gpt-5.4"), Some("high")).unwrap();
        let doc = next.parse::<DocumentMut>().unwrap();
        assert_eq!(doc["model"].as_str(), Some("gpt-5.4"));
        assert_eq!(doc["model_reasoning_effort"].as_str(), Some("high"));
    }

    #[test]
    fn patch_claude_preserves_other_keys() {
        let next = patch_claude_json(
            r#"{"model":"sonnet","theme":"dark"}"#,
            Some("opus[1m]"),
            Some("low"),
        )
        .unwrap();
        let v: Value = serde_json::from_str(&next).unwrap();
        assert_eq!(v["model"], "opus[1m]");
        assert_eq!(v["effortLevel"], "low");
        assert_eq!(v["theme"], "dark");
    }
}
