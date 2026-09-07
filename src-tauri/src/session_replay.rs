use serde_json::{json, Value};
use std::fs;
use std::io::{BufRead, BufReader, Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};

const TAIL_MAX: u64 = 4 * 1024 * 1024;
const MS_EPOCH_FLOOR: f64 = 100_000_000_000.0;

pub(crate) fn normalize_epoch_ms(n: f64) -> u64 {
    if n > MS_EPOCH_FLOOR {
        n as u64
    } else {
        (n * 1000.0) as u64
    }
}

fn agent_timestamp_ms(value: &Value) -> Option<u64> {
    let metas = [
        value.get("_meta"),
        value.get("params").and_then(|p| p.get("_meta")),
        value
            .get("params")
            .and_then(|p| p.get("update"))
            .and_then(|u| u.get("_meta")),
        value.get("update").and_then(|u| u.get("_meta")),
    ];
    for meta in metas.into_iter().flatten() {
        let Some(raw) = meta.get("agentTimestampMs") else {
            continue;
        };
        if let Some(n) = raw
            .as_u64()
            .or_else(|| raw.as_f64().map(|f| f as u64))
            .filter(|n| *n > 0)
        {
            return Some(n);
        }
    }
    None
}

pub(crate) fn timestamp_ms_from_record(value: &Value) -> Option<u64> {
    agent_timestamp_ms(value)
        .or_else(|| ts_from(value))
        .or_else(|| value.get("params").and_then(ts_from))
}

pub struct ReplayPage {
    pub rows: Vec<Value>,
    pub next_byte: u64,
    pub truncated: bool,
}

pub fn empty_page() -> ReplayPage {
    ReplayPage {
        rows: Vec::new(),
        next_byte: 0,
        truncated: false,
    }
}

pub fn resolve_transcript(path: &Path) -> Option<PathBuf> {
    if path.is_file() {
        return Some(path.to_path_buf());
    }
    if !path.is_dir() {
        return None;
    }
    let grok = path.join("updates.jsonl");
    if grok.is_file() {
        return Some(grok);
    }
    let kimi = path.join("agents").join("main").join("wire.jsonl");
    if kimi.is_file() {
        return Some(kimi);
    }
    if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
        let sibling = path.with_file_name(format!("{name}.jsonl"));
        if sibling.is_file() {
            return Some(sibling);
        }
    }
    None
}

pub fn replay_session(path: &Path, after_byte: Option<u64>) -> Result<ReplayPage, String> {
    let Some(transcript) = resolve_transcript(path) else {
        return Ok(empty_page());
    };
    if transcript.file_name().and_then(|n| n.to_str()) == Some("updates.jsonl") {
        return Ok(empty_page());
    }
    replay_vendor_jsonl(&transcript, after_byte)
}

fn replay_vendor_jsonl(path: &Path, after_byte: Option<u64>) -> Result<ReplayPage, String> {
    let io = |e: std::io::Error| e.to_string();
    let mut file = fs::File::open(path).map_err(io)?;
    let file_len = file.metadata().map_err(io)?.len();
    let (start, truncated) = match after_byte {
        Some(n) if n > 0 => (n.min(file_len), false),
        _ if file_len > TAIL_MAX => (file_len.saturating_sub(TAIL_MAX), true),
        _ => (0, false),
    };
    file.seek(SeekFrom::Start(start)).map_err(io)?;
    let mut pos = start;
    if truncated && start > 0 {
        let aligned = {
            file.seek(SeekFrom::Start(start - 1)).map_err(io)?;
            let mut prev = [0u8; 1];
            file.read_exact(&mut prev).map_err(io)?;
            prev[0] == b'\n'
        };
        if !aligned {
            loop {
                let mut b = [0u8; 1];
                let n = file.read(&mut b).map_err(io)?;
                if n == 0 {
                    break;
                }
                pos += 1;
                if b[0] == b'\n' {
                    break;
                }
            }
        }
    }
    let mut reader = BufReader::new(file);
    let mut buf = Vec::new();
    let mut rows = Vec::new();
    let sidechain = allow_sidechain(path);
    loop {
        buf.clear();
        let n = reader.read_until(b'\n', &mut buf).map_err(io)?;
        if n == 0 {
            break;
        }
        if buf.last() != Some(&b'\n') {
            break;
        }
        pos += n as u64;
        let Ok(line) = std::str::from_utf8(&buf) else {
            continue;
        };
        rows.extend(parse_vendor_line(line, sidechain));
    }
    Ok(ReplayPage {
        rows,
        next_byte: pos,
        truncated,
    })
}

fn allow_sidechain(path: &Path) -> bool {
    path.components().any(|c| c.as_os_str() == "subagents")
}

fn parse_vendor_line(line: &str, allow_sidechain: bool) -> Vec<Value> {
    let Ok(value) = serde_json::from_str::<Value>(line.trim_end()) else {
        return Vec::new();
    };
    if let Some(rows) = parse_kimi_wire(&value) {
        return rows;
    }
    if let Some(rows) = parse_claude_transcript(&value, allow_sidechain) {
        return rows;
    }
    parse_codex_event(&value).unwrap_or_default()
}

fn with_ts(update: Value, ts: Option<u64>) -> Value {
    let mut params = json!({ "update": update });
    if let Some(ms) = ts {
        params["_ts"] = json!(ms);
    }
    params
}

fn chunk(kind: &str, text: &str, ts: Option<u64>) -> Option<Value> {
    let text = text.trim();
    if text.is_empty() {
        return None;
    }
    Some(with_ts(
        json!({
            "sessionUpdate": kind,
            "content": { "text": text }
        }),
        ts,
    ))
}

fn tool_kind_from_name(name: &str) -> &'static str {
    let n = name.to_ascii_lowercase();
    if n.contains("bash") || n.contains("shell") || n.contains("exec") || n == "command" {
        "execute"
    } else if n.contains("read") || n == "cat" {
        "read"
    } else if n.contains("edit") || n.contains("patch") || n.contains("write") {
        "edit"
    } else if n.contains("search") || n.contains("grep") || n.contains("glob") {
        "search"
    } else {
        "other"
    }
}

fn tool_call_row(
    id: &str,
    title: &str,
    kind: &str,
    status: &str,
    raw_input: Option<&Value>,
    ts: Option<u64>,
) -> Value {
    let mut update = json!({
        "sessionUpdate": "tool_call",
        "toolCallId": id,
        "title": title,
        "kind": kind,
        "status": status,
    });
    if let Some(input) = raw_input {
        update["rawInput"] = input.clone();
    }
    with_ts(update, ts)
}

fn tool_update_row(id: &str, status: &str, detail: &str, ts: Option<u64>) -> Value {
    let mut update = json!({
        "sessionUpdate": "tool_call_update",
        "toolCallId": id,
        "status": status,
    });
    if !detail.trim().is_empty() {
        update["content"] = json!([{ "type": "content", "content": { "text": detail } }]);
        update["rawOutput"] = json!({ "output": detail });
    }
    with_ts(update, ts)
}

fn json_text(value: &Value) -> String {
    if let Some(s) = value.as_str() {
        return s.to_string();
    }
    if let Some(s) = value.get("text").and_then(|v| v.as_str()) {
        return s.to_string();
    }
    if let Some(s) = value.get("think").and_then(|v| v.as_str()) {
        return s.to_string();
    }
    if let Some(s) = value.get("thinking").and_then(|v| v.as_str()) {
        return s.to_string();
    }
    if let Some(s) = value.get("output").and_then(|v| v.as_str()) {
        return s.to_string();
    }
    let Some(arr) = value.as_array() else {
        return String::new();
    };
    let mut out = String::new();
    for block in arr {
        out.push_str(&json_text(block));
    }
    out
}

fn ts_from(value: &Value) -> Option<u64> {
    match value.get("time").or_else(|| value.get("timestamp")) {
        Some(Value::Number(n)) => n.as_f64().map(normalize_epoch_ms),
        Some(Value::String(s)) => parse_ts_string(s),
        _ => None,
    }
}

fn parse_ts_string(s: &str) -> Option<u64> {
    let s = s.trim();
    if let Ok(n) = s.parse::<u64>() {
        return Some(if (n as f64) > MS_EPOCH_FLOOR {
            n
        } else {
            n.saturating_mul(1000)
        });
    }
    if let Ok(f) = s.parse::<f64>() {
        return Some(normalize_epoch_ms(f));
    }
    parse_rfc3339_millis(s)
}

fn parse_iso_offset(s: &str) -> Option<i64> {
    if s.eq_ignore_ascii_case("Z") {
        return Some(0);
    }
    let sign = match s.as_bytes().first()? {
        b'+' => 1i64,
        b'-' => -1i64,
        _ => return None,
    };
    let rest = &s[1..];
    let (hour, min) = if rest.len() >= 5 && rest.as_bytes().get(2) == Some(&b':') {
        (
            rest[..2].parse::<i64>().ok()?,
            rest[3..5].parse::<i64>().ok()?,
        )
    } else if rest.len() >= 4 {
        (
            rest[..2].parse::<i64>().ok()?,
            rest[2..4].parse::<i64>().ok()?,
        )
    } else {
        return None;
    };
    Some(sign * (hour * 3600 + min * 60))
}

fn split_rfc3339_offset(s: &str) -> Option<(&str, i64)> {
    if let Some(body) = s.strip_suffix('Z').or_else(|| s.strip_suffix('z')) {
        return Some((body, 0));
    }
    let t_pos = s.find('T').or_else(|| s.find(' '))?;
    let time = &s[t_pos + 1..];
    let mut off_at = None;
    for (i, &b) in time.as_bytes().iter().enumerate().rev() {
        if b == b'+' || b == b'-' {
            off_at = Some(i);
            break;
        }
    }
    let Some(i) = off_at else {
        return Some((s, 0));
    };
    let offset = parse_iso_offset(&time[i..])?;
    Some((&s[..t_pos + 1 + i], offset))
}

fn parse_rfc3339_millis(s: &str) -> Option<u64> {
    let s = s.trim();
    let (body, offset_secs) = split_rfc3339_offset(s)?;
    let (date, time) = body.split_once('T').or_else(|| body.split_once(' '))?;
    let mut d = date.split('-');
    let year: i32 = d.next()?.parse().ok()?;
    let month: u32 = d.next()?.parse().ok()?;
    let day: u32 = d.next()?.parse().ok()?;
    let (hms, frac) = match time.split_once('.') {
        Some((hms, frac)) => (hms, Some(frac)),
        None => (time, None),
    };
    let mut t = hms.split(':');
    let hour: u32 = t.next()?.parse().ok()?;
    let min: u32 = t.next()?.parse().ok()?;
    let sec: u32 = t.next()?.parse().ok()?;
    let millis = match frac {
        None => 0u32,
        Some(f) => {
            let digits: String = f.chars().filter(|c| c.is_ascii_digit()).take(3).collect();
            format!("{:0<3}", digits).parse().ok()?
        }
    };
    let days = days_from_civil(year, month, day)?;
    let secs = days
        .checked_mul(86400)?
        .checked_add(i64::from(hour) * 3600)?
        .checked_add(i64::from(min) * 60)?
        .checked_add(i64::from(sec))?;
    let local_ms = secs.checked_mul(1000)?.checked_add(i64::from(millis))?;
    let utc_ms = local_ms.checked_sub(offset_secs.checked_mul(1000)?)?;
    u64::try_from(utc_ms).ok()
}

fn days_from_civil(year: i32, month: u32, day: u32) -> Option<i64> {
    if !(1..=12).contains(&month) || day == 0 || day > 31 {
        return None;
    }
    let y = if month <= 2 { year - 1 } else { year };
    let era = y.div_euclid(400);
    let yoe = y.rem_euclid(400) as u32;
    let mp = (month + 9) % 12;
    let doy = (153 * mp + 2) / 5 + day - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    Some(i64::from(era) * 146097 + i64::from(doe) - 719468)
}

fn parse_kimi_wire(value: &Value) -> Option<Vec<Value>> {
    let kind = value.get("type").and_then(|v| v.as_str())?;
    let ts = ts_from(value);
    match kind {
        "turn.prompt" => Some(
            chunk("user_message_chunk", &json_text(value.get("input")?), ts)
                .into_iter()
                .collect(),
        ),
        "context.append_loop_event" => Some(parse_kimi_loop(value.get("event")?, ts)),
        "context.append_message" => Some(parse_kimi_append_message(value, ts)),
        _ => None,
    }
}

fn parse_kimi_append_message(value: &Value, ts: Option<u64>) -> Vec<Value> {
    let Some(message) = value.get("message") else {
        return Vec::new();
    };
    if message.get("role").and_then(|v| v.as_str()) != Some("user") {
        return Vec::new();
    }
    let origin = message
        .get("origin")
        .and_then(|o| o.get("kind"))
        .and_then(|v| v.as_str())
        .unwrap_or("");
    if origin == "injection" {
        return Vec::new();
    }
    let text = json_text(message.get("content").unwrap_or(&Value::Null));
    if is_harness_user_text(&text) {
        return Vec::new();
    }
    chunk("user_message_chunk", &text, ts).into_iter().collect()
}

fn is_harness_user_text(text: &str) -> bool {
    let t = text.trim_start();
    t.eq_ignore_ascii_case("[Request interrupted by user]")
        || t.starts_with("<local-command-caveat>")
        || t.starts_with("<command-name>")
        || t.starts_with("<command-message>")
        || t.starts_with("<command-args>")
        || t.starts_with("<local-command-stdout>")
        || t.starts_with("<task-notification>")
        || t.starts_with("<system-reminder>")
        || t.starts_with("<INSTRUCTIONS")
        || t.starts_with("<permissions")
        || t.starts_with("<multi_agent_mode>")
}

fn parse_kimi_loop(event: &Value, ts: Option<u64>) -> Vec<Value> {
    match event.get("type").and_then(|v| v.as_str()).unwrap_or("") {
        "content.part" => {
            let Some(part) = event.get("part") else {
                return Vec::new();
            };
            match part.get("type").and_then(|v| v.as_str()) {
                Some("text") => chunk("agent_message_chunk", &json_text(part), ts)
                    .into_iter()
                    .collect(),
                Some("think") => chunk("agent_thought_chunk", &json_text(part), ts)
                    .into_iter()
                    .collect(),
                _ => Vec::new(),
            }
        }
        "tool.call" => {
            let id = event
                .get("toolCallId")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            if id.is_empty() {
                return Vec::new();
            }
            let name = event
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or("工具调用");
            let title = event
                .get("description")
                .and_then(|v| v.as_str())
                .filter(|s| !s.is_empty())
                .unwrap_or(name);
            vec![tool_call_row(
                id,
                title,
                tool_kind_from_name(name),
                "in_progress",
                event.get("args"),
                ts,
            )]
        }
        "tool.result" => {
            let id = event
                .get("toolCallId")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            if id.is_empty() {
                return Vec::new();
            }
            let detail = json_text(event.get("result").unwrap_or(event));
            let failed = event
                .get("isError")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            vec![tool_update_row(
                id,
                if failed { "failed" } else { "completed" },
                &detail,
                ts,
            )]
        }
        _ => Vec::new(),
    }
}

fn parse_claude_transcript(value: &Value, allow_sidechain: bool) -> Option<Vec<Value>> {
    if !allow_sidechain && value.get("isSidechain").and_then(|v| v.as_bool()) == Some(true) {
        return Some(Vec::new());
    }
    let kind = value.get("type").and_then(|v| v.as_str())?;
    if kind != "user" && kind != "assistant" {
        return None;
    }
    let ts = ts_from(value);
    let content = value.get("message")?.get("content")?;
    if kind == "user" && claude_hide_user(value, content) {
        return Some(Vec::new());
    }
    Some(claude_rows(kind, content, ts))
}

fn claude_hide_user(value: &Value, content: &Value) -> bool {
    if value.get("isMeta").and_then(|v| v.as_bool()) == Some(true) {
        return true;
    }
    is_harness_user_text(&json_text(content))
}

fn claude_rows(kind: &str, content: &Value, ts: Option<u64>) -> Vec<Value> {
    if let Some(s) = content.as_str() {
        let update = if kind == "user" {
            "user_message_chunk"
        } else {
            "agent_message_chunk"
        };
        return chunk(update, s, ts).into_iter().collect();
    }
    let Some(arr) = content.as_array() else {
        return Vec::new();
    };
    let mut out = Vec::new();
    for block in arr {
        let ty = block.get("type").and_then(|v| v.as_str()).unwrap_or("");
        match (kind, ty) {
            ("assistant", "thinking") => {
                if let Some(row) = chunk("agent_thought_chunk", &json_text(block), ts) {
                    out.push(row);
                }
            }
            ("assistant", "tool_use") => {
                let id = block.get("id").and_then(|v| v.as_str()).unwrap_or("");
                if id.is_empty() {
                    continue;
                }
                let title = block
                    .get("name")
                    .and_then(|v| v.as_str())
                    .unwrap_or("工具调用");
                out.push(tool_call_row(
                    id,
                    title,
                    tool_kind_from_name(title),
                    "in_progress",
                    block.get("input"),
                    ts,
                ));
            }
            ("assistant", "text") => {
                if let Some(row) = chunk("agent_message_chunk", &json_text(block), ts) {
                    out.push(row);
                }
            }
            ("user", "tool_result") => {
                let id = block
                    .get("tool_use_id")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                if id.is_empty() {
                    continue;
                }
                let detail = json_text(block.get("content").unwrap_or(&Value::Null));
                let failed = block
                    .get("is_error")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false);
                out.push(tool_update_row(
                    id,
                    if failed { "failed" } else { "completed" },
                    &detail,
                    ts,
                ));
            }
            ("user", _) if ty != "tool_result" => {
                if let Some(row) = chunk("user_message_chunk", &json_text(block), ts) {
                    out.push(row);
                }
            }
            _ => {}
        }
    }
    out
}

fn parse_codex_event(value: &Value) -> Option<Vec<Value>> {
    let kind = value.get("type").and_then(|v| v.as_str())?;
    let ts = ts_from(value);
    match kind {
        "event_msg" => Some(parse_codex_event_msg(value.get("payload")?, ts)),
        "response_item" => Some(parse_codex_response_item(value.get("payload")?, ts)),
        "session_meta" | "turn_context" => Some(Vec::new()),
        _ => None,
    }
}

fn parse_codex_event_msg(payload: &Value, ts: Option<u64>) -> Vec<Value> {
    let kind = payload.get("type").and_then(|v| v.as_str()).unwrap_or("");
    let ts = ts.or_else(|| ts_from(payload));
    let text = payload
        .get("message")
        .and_then(|v| v.as_str())
        .or_else(|| payload.get("text").and_then(|v| v.as_str()))
        .unwrap_or("");
    match kind {
        "user_message" => {
            if is_harness_user_text(text) {
                Vec::new()
            } else {
                chunk("user_message_chunk", text, ts).into_iter().collect()
            }
        }
        "agent_message" => chunk("agent_message_chunk", text, ts).into_iter().collect(),
        "agent_reasoning" => chunk("agent_thought_chunk", text, ts).into_iter().collect(),
        _ => Vec::new(),
    }
}

fn parse_codex_args(payload: &Value) -> Option<Value> {
    let args = payload.get("arguments").or_else(|| payload.get("input"))?;
    if let Some(s) = args.as_str() {
        return serde_json::from_str(s)
            .ok()
            .or_else(|| Some(json!({ "input": s })));
    }
    Some(args.clone())
}

fn parse_codex_response_item(payload: &Value, ts: Option<u64>) -> Vec<Value> {
    let kind = payload.get("type").and_then(|v| v.as_str()).unwrap_or("");
    match kind {
        "reasoning" => chunk(
            "agent_thought_chunk",
            &json_text(payload.get("summary").unwrap_or(&Value::Null)),
            ts,
        )
        .into_iter()
        .collect(),
        "function_call" | "custom_tool_call" => {
            let id = payload
                .get("call_id")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            if id.is_empty() {
                return Vec::new();
            }
            let name = payload
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or("工具调用");
            let raw = parse_codex_args(payload);
            vec![tool_call_row(
                id,
                name,
                tool_kind_from_name(name),
                "in_progress",
                raw.as_ref(),
                ts,
            )]
        }
        "function_call_output" | "custom_tool_call_output" => {
            let id = payload
                .get("call_id")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            if id.is_empty() {
                return Vec::new();
            }
            let detail = payload.get("output").and_then(|v| v.as_str()).unwrap_or("");
            vec![tool_update_row(id, "completed", detail, ts)]
        }
        // API transcript, not the UI thread: developer/system instructions,
        // injected AGENTS.md / environment blobs, and a duplicate of the
        // assistant reply. Visible turns come from event_msg.
        "message" => Vec::new(),
        _ => Vec::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;

    fn uniq(prefix: &str) -> PathBuf {
        let n = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!("{prefix}_{n}"))
    }

    fn texts(page: &ReplayPage) -> Vec<(String, String)> {
        page.rows
            .iter()
            .filter_map(|row| {
                let update = row.get("update")?;
                let kind = update.get("sessionUpdate")?.as_str()?.to_string();
                let text = update.get("content")?.get("text")?.as_str()?.to_string();
                Some((kind, text))
            })
            .collect()
    }

    fn kinds(page: &ReplayPage) -> Vec<String> {
        page.rows
            .iter()
            .filter_map(|row| {
                row.get("update")?
                    .get("sessionUpdate")?
                    .as_str()
                    .map(str::to_string)
            })
            .collect()
    }

    fn tool_ids(page: &ReplayPage) -> Vec<String> {
        page.rows
            .iter()
            .filter_map(|row| {
                row.get("update")?
                    .get("toolCallId")?
                    .as_str()
                    .map(str::to_string)
            })
            .collect()
    }

    #[test]
    fn kimi_wire_jsonl_replays_prompt_and_assistant_text() {
        let dir = uniq("kimi_wire");
        let wire = dir.join("agents").join("main");
        fs::create_dir_all(&wire).unwrap();
        fs::write(
            wire.join("wire.jsonl"),
            concat!(
                r#"{"type":"turn.prompt","input":[{"type":"text","text":"美化PPT"}],"time":100}"#,
                "\n",
                r#"{"type":"context.append_message","message":{"role":"user","content":[{"type":"text","text":"<system-reminder>\nskip"}]},"time":101}"#,
                "\n",
                r#"{"type":"context.append_loop_event","event":{"type":"content.part","part":{"type":"text","text":"先给方案"}},"time":102}"#,
                "\n",
            ),
        )
        .unwrap();
        let page = replay_session(&dir, None).unwrap();
        assert_eq!(
            texts(&page),
            vec![
                ("user_message_chunk".into(), "美化PPT".into()),
                ("agent_message_chunk".into(), "先给方案".into()),
            ]
        );
        fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn kimi_append_message_keeps_user_followup_and_drops_injections() {
        let dir = uniq("kimi_followup");
        let wire = dir.join("agents").join("main");
        fs::create_dir_all(&wire).unwrap();
        fs::write(
            wire.join("wire.jsonl"),
            concat!(
                r#"{"type":"turn.prompt","input":[{"type":"text","text":"美化PPT"}],"time":1785300746544}"#,
                "\n",
                r#"{"type":"context.append_message","message":{"role":"user","content":[{"type":"text","text":"美化PPT"}],"origin":{"kind":"user"}},"time":1785300746545}"#,
                "\n",
                r#"{"type":"context.append_message","message":{"role":"user","content":[{"type":"text","text":"<system-reminder>\nskip"}]},"origin":{"kind":"injection","variant":"plan_mode"},"time":1785300746546}"#,
                "\n",
                r#"{"type":"context.append_message","message":{"role":"user","content":[{"type":"text","text":"继续"}],"origin":{"kind":"user"}},"time":1785301905526}"#,
                "\n",
            ),
        )
        .unwrap();
        let page = replay_session(&dir, None).unwrap();
        assert_eq!(
            texts(&page),
            vec![
                ("user_message_chunk".into(), "美化PPT".into()),
                ("user_message_chunk".into(), "美化PPT".into()),
                ("user_message_chunk".into(), "继续".into()),
            ]
        );
        assert_eq!(
            page.rows[0].get("_ts").and_then(|v| v.as_u64()),
            Some(1_785_300_746_544)
        );
        fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn claude_jsonl_stamps_offset_iso_time() {
        let path = uniq("claude_offset.jsonl");
        fs::write(
            &path,
            concat!(
                r#"{"type":"user","timestamp":"2026-09-07T16:07:29.976+08:00","message":{"role":"user","content":"继续"}}"#,
                "\n",
            ),
        )
        .unwrap();
        let page = replay_session(&path, None).unwrap();
        assert_eq!(
            page.rows[0].get("_ts").and_then(|v| v.as_u64()),
            Some(1_788_768_449_976)
        );
        fs::remove_file(path).ok();
    }

    #[test]
    fn kimi_wire_jsonl_replays_think_and_tool_calls() {
        let dir = uniq("kimi_tools");
        let wire = dir.join("agents").join("main");
        fs::create_dir_all(&wire).unwrap();
        fs::write(
            wire.join("wire.jsonl"),
            concat!(
                r#"{"type":"turn.prompt","input":[{"type":"text","text":"读文件"}],"time":100}"#,
                "\n",
                r#"{"type":"context.append_loop_event","event":{"type":"content.part","part":{"type":"think","think":"先看路径"}},"time":101}"#,
                "\n",
                r#"{"type":"context.append_loop_event","event":{"type":"tool.call","toolCallId":"Read_0","name":"Read","args":{"path":"a.ts"},"description":"Reading a.ts"},"time":102}"#,
                "\n",
                r#"{"type":"context.append_loop_event","event":{"type":"tool.result","toolCallId":"Read_0","result":{"output":"export const n = 1"}},"time":103}"#,
                "\n",
                r#"{"type":"context.append_loop_event","event":{"type":"content.part","part":{"type":"text","text":"读完了"}},"time":104}"#,
                "\n",
            ),
        )
        .unwrap();
        let page = replay_session(&dir, None).unwrap();
        assert_eq!(
            kinds(&page),
            vec![
                "user_message_chunk",
                "agent_thought_chunk",
                "tool_call",
                "tool_call_update",
                "agent_message_chunk",
            ]
        );
        assert_eq!(tool_ids(&page), vec!["Read_0", "Read_0"]);
        assert_eq!(
            texts(&page),
            vec![
                ("user_message_chunk".into(), "读文件".into()),
                ("agent_thought_chunk".into(), "先看路径".into()),
                ("agent_message_chunk".into(), "读完了".into()),
            ]
        );
        let result = &page.rows[3]["update"];
        assert_eq!(result["status"], "completed");
        assert_eq!(
            result["content"][0]["content"]["text"],
            "export const n = 1"
        );
        fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn claude_session_dir_replays_sibling_jsonl() {
        let dir = uniq("claude_sid_dir");
        fs::create_dir_all(dir.join("subagents")).unwrap();
        fs::write(
            PathBuf::from(format!("{}.jsonl", dir.display())),
            concat!(
                r#"{"type":"user","message":{"role":"user","content":"请你在 X 上全面深度调研"},"cwd":"/proj"}"#,
                "\n",
                r#"{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"先开几个调研员"}]}}"#,
                "\n",
            ),
        )
        .unwrap();
        let page = replay_session(&dir, None).unwrap();
        assert_eq!(
            texts(&page),
            vec![
                (
                    "user_message_chunk".into(),
                    "请你在 X 上全面深度调研".into()
                ),
                ("agent_message_chunk".into(), "先开几个调研员".into()),
            ]
        );
        fs::remove_dir_all(&dir).ok();
        let _ = fs::remove_file(PathBuf::from(format!("{}.jsonl", dir.display())));
    }

    #[test]
    fn claude_subagent_jsonl_replays_sidechain_turns() {
        let dir = uniq("claude_subagents");
        let path = dir.join("subagents").join("agent-ab4a5fb3123330325.jsonl");
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(
            &path,
            concat!(
                r#"{"type":"user","isSidechain":true,"message":{"role":"user","content":"你是写作项目调研员"}}"#,
                "\n",
                r#"{"type":"assistant","isSidechain":true,"message":{"role":"assistant","content":[{"type":"text","text":"先搜近四个月动态"}]}}"#,
                "\n",
            ),
        )
        .unwrap();
        let page = replay_session(&path, None).unwrap();
        assert_eq!(
            texts(&page),
            vec![
                ("user_message_chunk".into(), "你是写作项目调研员".into()),
                ("agent_message_chunk".into(), "先搜近四个月动态".into()),
            ]
        );
        fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn claude_jsonl_replays_user_and_assistant_text() {
        let path = uniq("claude.jsonl");
        fs::write(
            &path,
            concat!(
                r#"{"type":"user","message":{"role":"user","content":"现在优化一下"},"cwd":"/proj"}"#,
                "\n",
                r#"{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"我先摸代码"}]}}"#,
                "\n",
                r#"{"type":"user","isSidechain":true,"message":{"role":"user","content":"sidechain"}}"#,
                "\n",
                r#"{"type":"user","message":{"role":"user","content":[{"type":"tool_result","content":"ls output"}]}}"#,
                "\n",
            ),
        )
        .unwrap();
        let page = replay_session(&path, None).unwrap();
        assert_eq!(
            texts(&page),
            vec![
                ("user_message_chunk".into(), "现在优化一下".into()),
                ("agent_message_chunk".into(), "我先摸代码".into()),
            ]
        );
        fs::remove_file(path).ok();
    }

    #[test]
    fn claude_jsonl_hides_harness_user_messages() {
        let path = uniq("claude_harness.jsonl");
        fs::write(
            &path,
            concat!(
                r#"{"type":"user","message":{"role":"user","content":"继续"}}"#,
                "\n",
                r#"{"type":"user","isMeta":true,"message":{"role":"user","content":"<local-command-caveat>Caveat: DO NOT respond</local-command-caveat>"}}"#,
                "\n",
                r#"{"type":"user","message":{"role":"user","content":"<command-name>/model</command-name>\n<command-message>model</command-message>\n<command-args>opus</command-args>"}}"#,
                "\n",
                r#"{"type":"user","message":{"role":"user","content":"<local-command-stdout>Set model to opus</local-command-stdout>"}}"#,
                "\n",
                r#"{"type":"user","message":{"role":"user","content":"<task-notification>\n<summary>No completion record was found for 6 background agents</summary>\n</task-notification>"}}"#,
                "\n",
                r#"{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"好"}]}}"#,
                "\n",
            ),
        )
        .unwrap();
        let page = replay_session(&path, None).unwrap();
        assert_eq!(
            texts(&page),
            vec![
                ("user_message_chunk".into(), "继续".into()),
                ("agent_message_chunk".into(), "好".into()),
            ]
        );
        let blob = texts(&page)
            .into_iter()
            .map(|(_, t)| t)
            .collect::<Vec<_>>()
            .join("\n");
        assert!(!blob.contains("local-command-caveat"));
        assert!(!blob.contains("command-name"));
        assert!(!blob.contains("task-notification"));
        fs::remove_file(path).ok();
    }

    #[test]
    fn claude_jsonl_hides_interrupt_and_stamps_iso_time() {
        let path = uniq("claude_interrupt.jsonl");
        fs::write(
            &path,
            concat!(
                r#"{"type":"user","timestamp":"2026-09-07T08:06:42.659Z","message":{"role":"user","content":[{"type":"text","text":"[Request interrupted by user]"}]}}"#,
                "\n",
                r#"{"type":"user","timestamp":"2026-09-07T08:07:29.976Z","message":{"role":"user","content":[{"type":"text","text":"继续"}]}}"#,
                "\n",
            ),
        )
        .unwrap();
        let page = replay_session(&path, None).unwrap();
        assert_eq!(
            texts(&page),
            vec![("user_message_chunk".into(), "继续".into())]
        );
        assert_eq!(
            page.rows[0].get("_ts").and_then(|v| v.as_u64()),
            Some(1_788_768_449_976)
        );
        fs::remove_file(path).ok();
    }

    #[test]
    fn claude_jsonl_replays_thinking_and_tool_use() {
        let path = uniq("claude_work.jsonl");
        fs::write(
            &path,
            concat!(
                r#"{"type":"user","message":{"role":"user","content":"看目录"}}"#,
                "\n",
                r#"{"type":"assistant","message":{"role":"assistant","content":[{"type":"thinking","thinking":"先 ls"},{"type":"tool_use","id":"toolu_1","name":"Bash","input":{"command":"ls"}},{"type":"text","text":"列一下"}]}}"#,
                "\n",
                r#"{"type":"user","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"toolu_1","content":"a.ts"}]}}"#,
                "\n",
            ),
        )
        .unwrap();
        let page = replay_session(&path, None).unwrap();
        assert_eq!(
            kinds(&page),
            vec![
                "user_message_chunk",
                "agent_thought_chunk",
                "tool_call",
                "agent_message_chunk",
                "tool_call_update",
            ]
        );
        assert_eq!(
            texts(&page),
            vec![
                ("user_message_chunk".into(), "看目录".into()),
                ("agent_thought_chunk".into(), "先 ls".into()),
                ("agent_message_chunk".into(), "列一下".into()),
            ]
        );
        assert_eq!(page.rows[2]["update"]["toolCallId"], "toolu_1");
        assert_eq!(page.rows[2]["update"]["title"], "Bash");
        assert_eq!(page.rows[4]["update"]["status"], "completed");
        fs::remove_file(path).ok();
    }

    #[test]
    fn codex_event_msg_replays_user_and_agent_messages() {
        let path = uniq("codex.jsonl");
        fs::write(
            &path,
            concat!(
                r#"{"type":"session_meta","payload":{"session_id":"abc","cwd":"/zaoyi"}}"#,
                "\n",
                r#"{"type":"event_msg","payload":{"type":"user_message","message":"改推广资料"}}"#,
                "\n",
                r#"{"type":"event_msg","payload":{"type":"agent_reasoning","message":"内部推理"}}"#,
                "\n",
                r#"{"type":"event_msg","payload":{"type":"agent_message","message":"我会先转成文本"}}"#,
                "\n",
            ),
        )
        .unwrap();
        let page = replay_session(&path, None).unwrap();
        assert_eq!(
            texts(&page),
            vec![
                ("user_message_chunk".into(), "改推广资料".into()),
                ("agent_thought_chunk".into(), "内部推理".into()),
                ("agent_message_chunk".into(), "我会先转成文本".into()),
            ]
        );
        fs::remove_file(path).ok();
    }

    #[test]
    fn codex_response_item_replays_reasoning_and_function_calls() {
        let path = uniq("codex_tools.jsonl");
        fs::write(
            &path,
            concat!(
                r#"{"type":"response_item","payload":{"type":"reasoning","summary":[{"type":"summary_text","text":"先跑 pwd"}]}}"#,
                "\n",
                r#"{"type":"response_item","payload":{"type":"function_call","name":"exec_command","arguments":"{\"cmd\":\"pwd\"}","call_id":"call_1"}}"#,
                "\n",
                r#"{"type":"response_item","payload":{"type":"function_call_output","call_id":"call_1","output":"/proj"}}"#,
                "\n",
                r#"{"type":"response_item","payload":{"type":"message","role":"assistant","content":[{"type":"output_text","text":"当前目录是 /proj"}]}}"#,
                "\n",
            ),
        )
        .unwrap();
        let page = replay_session(&path, None).unwrap();
        assert_eq!(
            kinds(&page),
            vec!["agent_thought_chunk", "tool_call", "tool_call_update"]
        );
        assert_eq!(tool_ids(&page), vec!["call_1", "call_1"]);
        assert_eq!(page.rows[1]["update"]["title"], "exec_command");
        assert_eq!(page.rows[2]["update"]["status"], "completed");
        assert_eq!(
            texts(&page)
                .into_iter()
                .filter(|(k, _)| k != "tool_call" && k != "tool_call_update")
                .collect::<Vec<_>>(),
            vec![("agent_thought_chunk".into(), "先跑 pwd".into())]
        );
        fs::remove_file(path).ok();
    }

    #[test]
    fn codex_hides_injected_response_item_prompts() {
        let path = uniq("codex_injected.jsonl");
        fs::write(
            &path,
            concat!(
                r#"{"type":"response_item","payload":{"type":"message","role":"developer","content":[{"type":"input_text","text":"<permissions instructions> sandbox rules"}]}}"#,
                "\n",
                r#"{"type":"response_item","payload":{"type":"message","role":"developer","content":[{"type":"input_text","text":"<multi_agent_mode> hide"}]}}"#,
                "\n",
                r##"{"type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"# AGENTS.md instructions\n<INSTRUCTIONS> do not show"}]}}"##,
                "\n",
                r#"{"type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"ping"}]}}"#,
                "\n",
                r#"{"type":"event_msg","payload":{"type":"user_message","message":"ping"}}"#,
                "\n",
                r#"{"type":"event_msg","payload":{"type":"agent_message","message":"pong"}}"#,
                "\n",
                r#"{"type":"response_item","payload":{"type":"message","role":"assistant","content":[{"type":"output_text","text":"pong"}]}}"#,
                "\n",
            ),
        )
        .unwrap();
        let page = replay_session(&path, None).unwrap();
        assert_eq!(
            texts(&page),
            vec![
                ("user_message_chunk".into(), "ping".into()),
                ("agent_message_chunk".into(), "pong".into()),
            ]
        );
        let blob = texts(&page)
            .into_iter()
            .map(|(_, t)| t)
            .collect::<Vec<_>>()
            .join("\n");
        assert!(!blob.contains("permissions instructions"));
        assert!(!blob.contains("AGENTS.md"));
        assert!(!blob.contains("multi_agent_mode"));
        fs::remove_file(path).ok();
    }

    #[test]
    fn unknown_vendor_jsonl_stays_empty() {
        let dir = uniq("chat_jsonl");
        fs::create_dir_all(&dir).unwrap();
        fs::write(
            dir.join("chat.jsonl"),
            r#"{"type":"message","role":"user","content":"hello from kimi"}"#,
        )
        .unwrap();
        let page = replay_session(&dir, None).unwrap();
        assert!(page.rows.is_empty());
        fs::remove_dir_all(dir).ok();
    }
}
