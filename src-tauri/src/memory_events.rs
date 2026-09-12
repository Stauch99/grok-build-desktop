use serde::{Deserialize, Serialize};
use std::io::Write as _;
use std::path::{Path, PathBuf};

/// Append-only event stream under `.dreams/events.jsonl`, consumed by the
/// growth UI (timeline, heatmaps) and by the dream threshold gate.
pub const EVENTS_MAX_BYTES: u64 = 1024 * 1024;
/// Rotation keeps at most this many bytes (half the cap) so a rotated file
/// has headroom and does not re-trigger rotation on every append.
pub const EVENTS_KEEP_BYTES: u64 = EVENTS_MAX_BYTES / 2;
pub const EVENTS_KEEP_LINES: usize = 2000;
pub const MAX_EVENT_KIND_CHARS: usize = 32;
pub const MAX_AGENT_CHARS: usize = 16;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryEvent {
    pub at: i64,
    pub kind: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub agent: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub count: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bytes: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub prompts: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub in_chars: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub out_chars: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivityDay {
    pub day: String,
    pub daily_lines: i64,
    pub mcp_appends: i64,
    pub new_sessions: i64,
    pub promoted: i64,
    pub mem_bytes: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivitySnapshot {
    pub days: Vec<ActivityDay>,
    pub earliest_day: Option<String>,
}

pub fn events_path(root: &Path) -> PathBuf {
    root.join(".dreams").join("events.jsonl")
}

fn valid_kind(kind: &str) -> bool {
    !kind.is_empty()
        && kind.len() <= MAX_EVENT_KIND_CHARS
        && kind
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_')
}

pub fn sanitize_event(mut event: MemoryEvent) -> MemoryEvent {
    event.kind = event.kind.trim().to_string();
    if let Some(agent) = event.agent.as_mut() {
        let trimmed = agent.trim().to_string();
        event.agent = if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.chars().take(MAX_AGENT_CHARS).collect())
        };
    }
    event
}

pub fn append_event(root: &Path, event: &MemoryEvent) -> Result<(), String> {
    if !valid_kind(&event.kind) {
        return Err("invalid event kind".into());
    }
    if event.at < 0 {
        return Err("invalid event time".into());
    }
    let event = sanitize_event(event.clone());
    let path = events_path(root);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let mut line = serde_json::to_string(&event).map_err(|e| e.to_string())?;
    line.push('\n');
    rotate_if_needed(&path, line.len() as u64)?;
    let mut file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|e| e.to_string())?;
    file.write_all(line.as_bytes()).map_err(|e| e.to_string())
}

/// Keep the newest lines that fit both the byte budget and the line cap.
fn rotate_if_needed(path: &Path, incoming: u64) -> Result<(), String> {
    let current = match std::fs::metadata(path) {
        Ok(meta) => meta.len(),
        Err(_) => return Ok(()),
    };
    if current + incoming <= EVENTS_MAX_BYTES {
        return Ok(());
    }
    let raw = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    let lines: Vec<&str> = raw.lines().collect();
    let budget = EVENTS_KEEP_BYTES.saturating_sub(incoming);
    let mut kept_bytes: u64 = 0;
    let mut count = 0usize;
    for line in lines.iter().rev() {
        let len = line.len() as u64 + 1;
        if count >= EVENTS_KEEP_LINES || kept_bytes + len > budget {
            break;
        }
        kept_bytes += len;
        count += 1;
    }
    let mut body = lines[lines.len() - count..].join("\n");
    if !body.is_empty() {
        body.push('\n');
    }
    std::fs::write(path, body).map_err(|e| e.to_string())
}

pub fn read_events(root: &Path) -> Result<Vec<MemoryEvent>, String> {
    let path = events_path(root);
    let raw = match std::fs::read_to_string(&path) {
        Ok(raw) => raw,
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(err) => return Err(err.to_string()),
    };
    let mut out = Vec::new();
    for line in raw.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        match serde_json::from_str::<MemoryEvent>(trimmed) {
            Ok(event) if valid_kind(&event.kind) => out.push(event),
            _ => continue,
        }
    }
    out.sort_by_key(|e| e.at);
    Ok(out)
}

#[allow(dead_code)]
pub fn events_since<'a>(events: &'a [MemoryEvent], since_ms: i64, kind: &str) -> Vec<&'a MemoryEvent> {
    events
        .iter()
        .filter(|e| e.kind == kind && e.at >= since_ms)
        .collect()
}

fn day_from_daily_name(name: &str) -> Option<String> {
    let stem = name.strip_suffix(".md")?;
    if stem.len() != 10 {
        return None;
    }
    let bytes = stem.as_bytes();
    if bytes[4] != b'-' || bytes[7] != b'-' {
        return None;
    }
    if !bytes[..4].iter().all(u8::is_ascii_digit)
        || !bytes[5..7].iter().all(u8::is_ascii_digit)
        || !bytes[8..].iter().all(u8::is_ascii_digit)
    {
        return None;
    }
    Some(stem.to_string())
}

fn count_daily_lines(path: &Path) -> i64 {
    match std::fs::read_to_string(path) {
        Ok(raw) => raw
            .lines()
            .filter(|l| l.starts_with("- ["))
            .count() as i64,
        Err(_) => 0,
    }
}

pub fn activity(root: &Path) -> Result<ActivitySnapshot, String> {
    let mut days: Vec<ActivityDay> = Vec::new();
    let daily_dir = root.join("daily");
    if let Ok(entries) = std::fs::read_dir(&daily_dir) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().into_owned();
            let Some(day) = day_from_daily_name(&name) else {
                continue;
            };
            days.push(ActivityDay {
                day,
                daily_lines: count_daily_lines(&entry.path()),
                mcp_appends: 0,
                new_sessions: 0,
                promoted: 0,
                mem_bytes: 0,
            });
        }
    }
    days.sort_by(|a, b| a.day.cmp(&b.day));
    let mut earliest: Option<String> = days.first().map(|d| d.day.clone());
    for event in read_events(root)? {
        let day = utc_ymd((event.at.max(0) / 1000) as u64);
        let slot = match days.iter_mut().find(|d| d.day == day) {
            Some(slot) => slot,
            None => {
                days.push(ActivityDay {
                    day: day.clone(),
                    daily_lines: 0,
                    mcp_appends: 0,
                    new_sessions: 0,
                    promoted: 0,
                    mem_bytes: 0,
                });
                days.sort_by(|a, b| a.day.cmp(&b.day));
                days.iter_mut().find(|d| d.day == day).expect("just inserted")
            }
        };
        match event.kind.as_str() {
            "mcp_append" => slot.mcp_appends += event.count.unwrap_or(1).max(0),
            "session_new" => slot.new_sessions += 1,
            "promote" => slot.promoted += event.count.unwrap_or(0).max(0),
            "dream_sweep" => slot.mem_bytes += event.bytes.unwrap_or(0).max(0),
            _ => {}
        }
        if earliest.as_ref().is_none_or(|d| &day < d) {
            earliest = Some(day);
        }
    }
    Ok(ActivitySnapshot {
        days,
        earliest_day: earliest,
    })
}

/// UTC calendar day from unix epoch millis (same shape as memory_host::utc_ymd).
fn utc_ymd(secs: u64) -> String {
    let mut z = (secs / 86_400) as i64 + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    z = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = mp + if mp < 10 { 3 } else { -9 };
    let y = z + if m <= 2 { 1 } else { 0 };
    format!("{y:04}-{m:02}-{d:02}")
}

#[tauri::command]
pub fn append_memory_event(event: MemoryEvent) -> Result<(), String> {
    append_event(&crate::memory_host::memory_root(), &event)
}

#[tauri::command]
pub fn read_memory_events() -> Result<Vec<MemoryEvent>, String> {
    read_events(&crate::memory_host::memory_root())
}

#[tauri::command]
pub fn memory_activity() -> Result<ActivitySnapshot, String> {
    activity(&crate::memory_host::memory_root())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_root() -> PathBuf {
        use std::sync::atomic::{AtomicU64, Ordering};
        static NEXT: AtomicU64 = AtomicU64::new(0);
        let n = NEXT.fetch_add(1, Ordering::Relaxed);
        let dir = std::env::temp_dir().join(format!(
            "memory-events-{}-{}-{}",
            std::process::id(),
            n,
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or(0)
        ));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn event(at: i64, kind: &str) -> MemoryEvent {
        MemoryEvent {
            at,
            kind: kind.into(),
            agent: None,
            count: None,
            bytes: None,
            prompts: None,
            in_chars: None,
            out_chars: None,
        }
    }

    #[test]
    fn append_then_read_roundtrips() {
        let root = temp_root();
        append_event(&root, &event(100, "session_new")).unwrap();
        append_event(&root, &event(200, "mcp_append")).unwrap();
        let events = read_events(&root).unwrap();
        assert_eq!(events.len(), 2);
        assert_eq!(events[0].at, 100);
        assert_eq!(events[1].kind, "mcp_append");
    }

    #[test]
    fn read_missing_file_is_empty() {
        let root = temp_root();
        assert!(read_events(&root).unwrap().is_empty());
    }

    #[test]
    fn rejects_bad_kind_and_negative_time() {
        let root = temp_root();
        assert!(append_event(&root, &event(100, "bad kind!")).is_err());
        assert!(append_event(&root, &event(-1, "promote")).is_err());
        assert!(read_events(&root).unwrap().is_empty());
    }

    #[test]
    fn malformed_lines_are_skipped() {
        let root = temp_root();
        append_event(&root, &event(100, "promote")).unwrap();
        let path = events_path(&root);
        let mut raw = std::fs::read_to_string(&path).unwrap();
        raw.push_str("not json\n{\"at\":300,\"kind\":\"bad kind!\"}\n{\"at\":200,\"kind\":\"promote\"}\n");
        std::fs::write(&path, raw).unwrap();
        let events = read_events(&root).unwrap();
        assert_eq!(events.len(), 2);
        assert_eq!(events[0].at, 100);
        assert_eq!(events[1].at, 200);
    }

    #[test]
    fn rotation_keeps_newest_lines() {
        let root = temp_root();
        let path = events_path(&root);
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        // Seed oversized lines directly (append_event would sanitize the agent).
        let mut raw = String::new();
        for i in 0..3500 {
            raw.push_str(&format!(
                "{{\"at\":{},\"kind\":\"session_new\",\"agent\":\"{}\"}}\n",
                i,
                "y".repeat(300)
            ));
        }
        std::fs::write(&path, &raw).unwrap();
        assert!(std::fs::metadata(&path).unwrap().len() > EVENTS_MAX_BYTES);
        append_event(&root, &event(9999, "promote")).unwrap();
        let events = read_events(&root).unwrap();
        assert_eq!(events.last().unwrap().at, 9999);
        assert!(events.len() <= EVENTS_KEEP_LINES + 1);
        assert!(events.len() < 3500, "rotation must drop oldest lines");
        let size = std::fs::metadata(&path).unwrap().len();
        assert!(size <= EVENTS_MAX_BYTES + 2048, "file stays near the cap");
    }

    #[test]
    fn events_since_filters_by_kind_and_time() {
        let root = temp_root();
        append_event(&root, &event(100, "mcp_append")).unwrap();
        append_event(&root, &event(150, "dream_sweep")).unwrap();
        append_event(&root, &event(200, "mcp_append")).unwrap();
        let events = read_events(&root).unwrap();
        let mcp = events_since(&events, 150, "mcp_append");
        assert_eq!(mcp.len(), 1);
        assert_eq!(mcp[0].at, 200);
    }

    #[test]
    fn activity_joins_daily_files_and_events() {
        let root = temp_root();
        let daily = root.join("daily");
        std::fs::create_dir_all(&daily).unwrap();
        std::fs::write(daily.join("2026-09-01.md"), "# 2026-09-01\n- [grok | s1 | /p | user_pref] a\n- [grok | s2 | /p | user_utterance] b\n").unwrap();
        std::fs::write(daily.join("2026-09-02.md"), "# 2026-09-02\n- [claude | s3 | /p | user_pref] c\n").unwrap();
        std::fs::write(daily.join("not-a-day.md"), "junk").unwrap();
        append_event(&root, &event(1_788_220_800_000, "session_new")).unwrap(); // 2026-09-01
        append_event(&root, &event(1_788_307_200_000, "mcp_append")).unwrap(); // 2026-09-02
        let snap = activity(&root).unwrap();
        assert_eq!(snap.days.len(), 2);
        assert_eq!(snap.days[0].day, "2026-09-01");
        assert_eq!(snap.days[0].daily_lines, 2);
        assert_eq!(snap.days[0].new_sessions, 1);
        assert_eq!(snap.days[1].mcp_appends, 1);
        assert_eq!(snap.earliest_day, Some("2026-09-01".into()));
    }

    #[test]
    fn activity_empty_root_is_empty_snapshot() {
        let root = temp_root();
        let snap = activity(&root).unwrap();
        assert!(snap.days.is_empty());
        assert_eq!(snap.earliest_day, None);
    }

    #[test]
    fn sanitize_trims_and_caps_agent() {
        let e = sanitize_event(MemoryEvent {
            at: 1,
            kind: "promote".into(),
            agent: Some("  codex  ".into()),
            count: None,
            bytes: None,
            prompts: None,
            in_chars: None,
            out_chars: None,
        });
        assert_eq!(e.agent.as_deref(), Some("codex"));
    }

    #[test]
    fn utc_ymd_known_epochs() {
        assert_eq!(utc_ymd(0), "1970-01-01");
        assert_eq!(utc_ymd(1_788_220_800), "2026-09-01");
        assert_eq!(utc_ymd(1_788_307_200), "2026-09-02");
    }
}
