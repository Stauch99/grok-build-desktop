use serde::Serialize;
use serde_json::Value;
use std::fs;
use std::io::{Read, Seek, SeekFrom};
use std::path::Path;

const JSONL_TAIL: u64 = 1024 * 1024;
const KIMI_WINDOW: u64 = 1_048_576;
const CLAUDE_WINDOW: u64 = 200_000;
const CLAUDE_LONG_WINDOW: u64 = 1_000_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub(crate) struct SessionUsage {
    pub used: u64,
    pub size: u64,
}

pub(crate) fn session_usage_from_path(path: &Path) -> Option<SessionUsage> {
    if path.is_file() {
        return usage_from_jsonl(path);
    }
    if !path.is_dir() {
        return None;
    }
    let signals = path.join("signals.json");
    if let Some(usage) = usage_from_signals(&signals) {
        return Some(usage);
    }
    let wire = path.join("agents").join("main").join("wire.jsonl");
    if let Some(usage) = usage_from_jsonl(&wire) {
        return Some(usage);
    }
    if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
        let sibling = path.with_file_name(format!("{name}.jsonl"));
        if let Some(usage) = usage_from_jsonl(&sibling) {
            return Some(usage);
        }
    }
    None
}

fn usage_from_signals(path: &Path) -> Option<SessionUsage> {
    let value: Value = serde_json::from_str(&fs::read_to_string(path).ok()?).ok()?;
    let used = json_u64(value.get("contextTokensUsed")).or_else(|| {
        let pct = json_u64(value.get("contextWindowUsage"))?;
        let size = json_u64(value.get("contextWindowTokens"))?;
        Some(size.saturating_mul(pct) / 100)
    })?;
    let size = json_u64(value.get("contextWindowTokens")).filter(|n| *n > 0)?;
    Some(SessionUsage { used, size })
}

fn usage_from_jsonl(path: &Path) -> Option<SessionUsage> {
    let text = read_jsonl_tail(path)?;
    let mut last: Option<SessionUsage> = None;
    for line in text.lines() {
        let Ok(value) = serde_json::from_str::<Value>(line) else {
            continue;
        };
        if let Some(usage) = usage_from_vendor_line(&value) {
            last = Some(usage);
        }
    }
    last
}

fn usage_from_vendor_line(value: &Value) -> Option<SessionUsage> {
    usage_from_claude_line(value)
        .or_else(|| usage_from_codex_line(value))
        .or_else(|| usage_from_kimi_line(value))
}

fn usage_from_claude_line(value: &Value) -> Option<SessionUsage> {
    if value.get("type").and_then(|v| v.as_str()) != Some("assistant") {
        return None;
    }
    let message = value.get("message")?;
    let usage = message.get("usage")?;
    let used = json_u64(usage.get("input_tokens"))
        .unwrap_or(0)
        .saturating_add(json_u64(usage.get("cache_creation_input_tokens")).unwrap_or(0))
        .saturating_add(json_u64(usage.get("cache_read_input_tokens")).unwrap_or(0));
    if used == 0 {
        return None;
    }
    let model = message.get("model").and_then(|v| v.as_str()).unwrap_or("");
    Some(SessionUsage {
        used,
        size: claude_window(model, used),
    })
}

fn claude_window(model: &str, used: u64) -> u64 {
    let lower = model.to_ascii_lowercase();
    let base = if lower.contains("fable") || lower.contains("1m") {
        CLAUDE_LONG_WINDOW
    } else {
        CLAUDE_WINDOW
    };
    if used > base {
        CLAUDE_LONG_WINDOW.max(used)
    } else {
        base
    }
}

fn usage_from_codex_line(value: &Value) -> Option<SessionUsage> {
    let payload = if value.get("type").and_then(|v| v.as_str()) == Some("event_msg") {
        value.get("payload")?
    } else {
        value
    };
    if payload.get("type").and_then(|v| v.as_str()) != Some("token_count") {
        return None;
    }
    let info = payload.get("info")?;
    let last = info.get("last_token_usage").unwrap_or(info);
    let used = json_u64(last.get("input_tokens")).filter(|n| *n > 0)?;
    let size = json_u64(info.get("model_context_window")).filter(|n| *n > 0)?;
    Some(SessionUsage { used, size })
}

fn usage_from_kimi_line(value: &Value) -> Option<SessionUsage> {
    if value.get("type").and_then(|v| v.as_str()) != Some("usage.record") {
        return None;
    }
    let usage = value.get("usage")?;
    let used = json_u64(usage.get("inputOther"))
        .unwrap_or(0)
        .saturating_add(json_u64(usage.get("inputCacheRead")).unwrap_or(0))
        .saturating_add(json_u64(usage.get("inputCacheCreation")).unwrap_or(0))
        .saturating_add(json_u64(usage.get("input")).unwrap_or(0));
    if used == 0 {
        return None;
    }
    Some(SessionUsage {
        used,
        size: KIMI_WINDOW.max(used),
    })
}

fn read_jsonl_tail(path: &Path) -> Option<String> {
    let mut file = fs::File::open(path).ok()?;
    let len = file.metadata().ok()?.len();
    let start = len.saturating_sub(JSONL_TAIL);
    file.seek(SeekFrom::Start(start)).ok()?;
    let mut buf = String::new();
    file.read_to_string(&mut buf).ok()?;
    if start > 0 {
        if let Some(idx) = buf.find('\n') {
            buf = buf[idx + 1..].to_string();
        }
    }
    Some(buf)
}

fn json_u64(value: Option<&Value>) -> Option<u64> {
    let v = value?;
    if let Some(n) = v.as_u64() {
        return Some(n);
    }
    if let Some(n) = v.as_i64() {
        return Some(n.max(0) as u64);
    }
    v.as_f64().map(|n| n.max(0.0) as u64)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn uniq(label: &str) -> std::path::PathBuf {
        let n = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let path =
            std::env::temp_dir().join(format!("session-usage-{label}-{}-{n}", std::process::id()));
        fs::create_dir_all(&path).unwrap();
        path
    }

    #[test]
    fn reads_grok_signals_json() {
        let dir = uniq("grok");
        fs::write(
            dir.join("signals.json"),
            r#"{"contextTokensUsed":173117,"contextWindowTokens":500000,"contextWindowUsage":34}"#,
        )
        .unwrap();
        assert_eq!(
            session_usage_from_path(&dir),
            Some(SessionUsage {
                used: 173117,
                size: 500000
            })
        );
        fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn reads_claude_assistant_usage_from_jsonl() {
        let dir = uniq("claude");
        let file = dir.join("4fea9f3c-9d1f-449f-ae22-4930197422a6.jsonl");
        fs::write(
            &file,
            concat!(
                r#"{"type":"user","message":{"content":"hi"}}"#,
                "\n",
                r#"{"type":"assistant","message":{"model":"claude-opus-5","usage":{"input_tokens":8,"cache_creation_input_tokens":12382,"cache_read_input_tokens":49528,"output_tokens":156}}}"#,
                "\n",
            ),
        )
        .unwrap();
        assert_eq!(
            session_usage_from_path(&file),
            Some(SessionUsage {
                used: 8 + 12382 + 49528,
                size: 200_000
            })
        );
        fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn claude_long_context_uses_one_million_window() {
        let dir = uniq("claude-long");
        let file = dir.join("sid.jsonl");
        fs::write(
            &file,
            r#"{"type":"assistant","message":{"model":"claude-fable-5","usage":{"input_tokens":13,"cache_creation_input_tokens":45724,"cache_read_input_tokens":163665}}}"#,
        )
        .unwrap();
        let usage = session_usage_from_path(&file).unwrap();
        assert_eq!(usage.used, 13 + 45724 + 163665);
        assert_eq!(usage.size, 1_000_000);
        fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn reads_codex_token_count_from_rollout() {
        let dir = uniq("codex");
        let file =
            dir.join("rollout-2026-08-01T01-14-18-019fb92b-6c3b-7c12-8865-117c1ee2aefd.jsonl");
        fs::write(
            &file,
            concat!(
                r#"{"type":"event_msg","payload":{"type":"task_started","model_context_window":258400}}"#,
                "\n",
                r#"{"type":"event_msg","payload":{"type":"token_count","info":{"last_token_usage":{"input_tokens":31649,"output_tokens":951},"model_context_window":258400}}}"#,
                "\n",
            ),
        )
        .unwrap();
        assert_eq!(
            session_usage_from_path(&file),
            Some(SessionUsage {
                used: 31649,
                size: 258400
            })
        );
        fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn reads_kimi_usage_record_from_session_dir() {
        let dir = uniq("kimi");
        let wire = dir.join("agents").join("main");
        fs::create_dir_all(&wire).unwrap();
        fs::write(
            wire.join("wire.jsonl"),
            concat!(
                r#"{"type":"llm.request","maxTokens":1048576}"#,
                "\n",
                r#"{"type":"usage.record","model":"kimi-code/k3","usage":{"inputOther":1,"output":526,"inputCacheRead":48896,"inputCacheCreation":0}}"#,
                "\n",
            ),
        )
        .unwrap();
        assert_eq!(
            session_usage_from_path(&dir),
            Some(SessionUsage {
                used: 1 + 48896,
                size: 1_048_576
            })
        );
        fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn returns_none_when_vendor_file_has_no_usage() {
        let dir = uniq("empty");
        let file = dir.join("sid.jsonl");
        fs::write(
            &file,
            "{\"type\":\"user\",\"message\":{\"content\":\"hi\"}}\n",
        )
        .unwrap();
        assert_eq!(session_usage_from_path(&file), None);
        fs::remove_dir_all(dir).ok();
    }
}
