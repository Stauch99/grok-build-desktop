use serde::{Deserialize, Serialize};
use std::path::{Component, Path, PathBuf};

pub const MAX_FILE_BYTES: usize = 64 * 1024;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub user_md: String,
    pub dreams_md: String,
    pub daily_md: String,
    pub state_json: String,
    pub memory_root: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WritePatch {
    pub user_md: Option<String>,
    pub dreams_md: Option<String>,
    pub daily_md: Option<String>,
    pub daily_day: Option<String>,
    pub state_json: Option<String>,
}

pub fn read_at(root: &Path, day: &str) -> Result<Snapshot, String> {
    Ok(Snapshot {
        user_md: read_capped(&resolve_under(root, Path::new("USER.md"))?)?,
        dreams_md: read_capped(&resolve_under(root, Path::new("DREAMS.md"))?)?,
        daily_md: read_capped(&resolve_under(root, &daily_rel(day)?)?)?,
        state_json: read_capped(&resolve_under(root, &Path::new(".dreams").join("state.json"))?)?,
        memory_root: root.to_string_lossy().into_owned(),
    })
}

pub fn write_at(root: &Path, patch: WritePatch) -> Result<(), String> {
    if let Some(text) = patch.user_md {
        write_capped(&resolve_under(root, Path::new("USER.md"))?, &text)?;
    }
    if let Some(text) = patch.dreams_md {
        write_capped(&resolve_under(root, Path::new("DREAMS.md"))?, &text)?;
    }
    if let Some(text) = patch.daily_md {
        let day = patch
            .daily_day
            .as_deref()
            .ok_or_else(|| "daily day is required".to_string())?;
        write_capped(&resolve_under(root, &daily_rel(day)?)?, &text)?;
    }
    if let Some(text) = patch.state_json {
        write_capped(&resolve_under(root, &Path::new(".dreams").join("state.json"))?, &text)?;
    }
    Ok(())
}

fn memory_root() -> PathBuf {
    crate::agents_paths::workbench_home_from(
        &crate::dirs_home(),
        std::env::var("ACP_WORKBENCH_HOME").ok().as_deref(),
    )
    .join("memory")
}

#[tauri::command]
pub fn read_memory_host() -> Result<Snapshot, String> {
    let root = memory_root();
    read_at(&root, &today_stamp())
}

#[tauri::command]
pub fn write_memory_host(patch: WritePatch) -> Result<(), String> {
    write_at(&memory_root(), patch)
}

fn is_ymd(day: &str) -> bool {
    let b = day.as_bytes();
    b.len() == 10
        && b[4] == b'-'
        && b[7] == b'-'
        && b[..4].iter().all(u8::is_ascii_digit)
        && b[5..7].iter().all(u8::is_ascii_digit)
        && b[8..].iter().all(u8::is_ascii_digit)
}

fn daily_rel(day: &str) -> Result<PathBuf, String> {
    if !is_ymd(day) {
        return Err("invalid daily day".into());
    }
    Ok(PathBuf::from("daily").join(format!("{day}.md")))
}

fn resolve_under(root: &Path, rel: &Path) -> Result<PathBuf, String> {
    if rel.is_absolute() {
        return Err("path escapes memory root".into());
    }
    if rel.components().any(|c| {
        matches!(
            c,
            Component::ParentDir | Component::RootDir | Component::Prefix(_)
        )
    }) {
        return Err("path escapes memory root".into());
    }
    let joined = root.join(rel);
    if !joined.starts_with(root) {
        return Err("path escapes memory root".into());
    }
    if joined.file_name().and_then(|s| s.to_str()) == Some("MEMORY.md") {
        return Err("refusing MEMORY.md".into());
    }
    Ok(joined)
}

fn read_capped(path: &Path) -> Result<String, String> {
    match std::fs::read(path) {
        Ok(bytes) if bytes.len() > MAX_FILE_BYTES => {
            Err("file exceeds 64 KiB size limit".into())
        }
        Ok(bytes) => String::from_utf8(bytes).map_err(|e| e.to_string()),
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(String::new()),
        Err(err) => Err(err.to_string()),
    }
}

fn write_capped(path: &Path, text: &str) -> Result<(), String> {
    if text.len() > MAX_FILE_BYTES {
        return Err("file exceeds 64 KiB size limit".into());
    }
    if path.file_name().and_then(|s| s.to_str()) == Some("MEMORY.md") {
        return Err("refusing MEMORY.md".into());
    }
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(path, text).map_err(|e| e.to_string())
}

/// UTC calendar day. Commands use this; unit tests always pass an explicit `day`.
fn today_stamp() -> String {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    utc_ymd(secs)
}

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

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};

    static NEXT: AtomicU64 = AtomicU64::new(0);

    fn temp_root() -> PathBuf {
        let n = NEXT.fetch_add(1, Ordering::Relaxed);
        let dir = std::env::temp_dir().join(format!(
            "memory-host-{}-{}-{}",
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

    fn cleanup(dir: &Path) {
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn read_missing_files_returns_empty_strings() {
        let root = temp_root();
        let snap = read_at(&root, "2026-08-30").expect("read empty root");
        assert_eq!(snap.user_md, "");
        assert_eq!(snap.dreams_md, "");
        assert_eq!(snap.daily_md, "");
        assert_eq!(snap.state_json, "");
        assert_eq!(snap.memory_root, root.to_string_lossy());
        cleanup(&root);
    }

    #[test]
    fn write_then_read_roundtrips_known_files() {
        let root = temp_root();
        write_at(
            &root,
            WritePatch {
                user_md: Some("# User\n".into()),
                dreams_md: Some("# Dreams\n".into()),
                daily_md: Some("# Daily\n".into()),
                daily_day: Some("2026-08-30".into()),
                state_json: Some(r#"{"lockOwner":null}"#.into()),
            },
        )
        .expect("write");
        let snap = read_at(&root, "2026-08-30").expect("read");
        assert_eq!(snap.user_md, "# User\n");
        assert_eq!(snap.dreams_md, "# Dreams\n");
        assert_eq!(snap.daily_md, "# Daily\n");
        assert_eq!(snap.state_json, r#"{"lockOwner":null}"#);
        assert!(root.join("USER.md").is_file());
        assert!(root.join("DREAMS.md").is_file());
        assert!(root.join("daily").join("2026-08-30.md").is_file());
        assert!(root.join(".dreams").join("state.json").is_file());
        cleanup(&root);
    }

    #[test]
    fn write_only_provided_fields() {
        let root = temp_root();
        std::fs::write(root.join("USER.md"), "keep-user").unwrap();
        std::fs::write(root.join("DREAMS.md"), "keep-dreams").unwrap();
        write_at(
            &root,
            WritePatch {
                user_md: Some("new-user".into()),
                ..WritePatch::default()
            },
        )
        .expect("partial write");
        let snap = read_at(&root, "2026-08-30").expect("read");
        assert_eq!(snap.user_md, "new-user");
        assert_eq!(snap.dreams_md, "keep-dreams");
        assert_eq!(snap.daily_md, "");
        assert_eq!(snap.state_json, "");
        cleanup(&root);
    }

    #[test]
    fn write_creates_daily_and_dreams_dirs() {
        let root = temp_root();
        write_at(
            &root,
            WritePatch {
                daily_md: Some("diary".into()),
                daily_day: Some("2026-08-31".into()),
                state_json: Some("{}".into()),
                ..WritePatch::default()
            },
        )
        .expect("write");
        assert!(root.join("daily").is_dir());
        assert!(root.join(".dreams").is_dir());
        assert_eq!(
            std::fs::read_to_string(root.join("daily").join("2026-08-31.md")).unwrap(),
            "diary"
        );
        assert_eq!(
            std::fs::read_to_string(root.join(".dreams").join("state.json")).unwrap(),
            "{}"
        );
        cleanup(&root);
    }

    #[test]
    fn daily_day_selects_which_file_to_write() {
        let root = temp_root();
        write_at(
            &root,
            WritePatch {
                daily_md: Some("a".into()),
                daily_day: Some("2026-08-29".into()),
                ..WritePatch::default()
            },
        )
        .expect("day a");
        write_at(
            &root,
            WritePatch {
                daily_md: Some("b".into()),
                daily_day: Some("2026-08-30".into()),
                ..WritePatch::default()
            },
        )
        .expect("day b");
        assert_eq!(read_at(&root, "2026-08-29").unwrap().daily_md, "a");
        assert_eq!(read_at(&root, "2026-08-30").unwrap().daily_md, "b");
        cleanup(&root);
    }

    #[test]
    fn write_rejects_file_over_64kib() {
        let root = temp_root();
        let too_big = "x".repeat(MAX_FILE_BYTES + 1);
        let err = write_at(
            &root,
            WritePatch {
                user_md: Some(too_big),
                ..WritePatch::default()
            },
        )
        .expect_err("oversized write");
        assert!(err.to_lowercase().contains("64") || err.to_lowercase().contains("size"));
        assert!(!root.join("USER.md").exists());
        cleanup(&root);
    }

    #[test]
    fn read_errors_when_file_over_64kib() {
        let root = temp_root();
        std::fs::write(root.join("USER.md"), "y".repeat(MAX_FILE_BYTES + 1)).unwrap();
        let err = read_at(&root, "2026-08-30").expect_err("oversized read");
        assert!(err.to_lowercase().contains("64") || err.to_lowercase().contains("size"));
        cleanup(&root);
    }

    #[test]
    fn write_rejects_parent_escape_in_daily_day() {
        let root = temp_root();
        let outside = root.parent().unwrap().join("escaped.md");
        let _ = std::fs::remove_file(&outside);
        let err = write_at(
            &root,
            WritePatch {
                daily_md: Some("nope".into()),
                daily_day: Some("../escaped".into()),
                ..WritePatch::default()
            },
        )
        .expect_err("escape");
        assert!(!outside.exists());
        assert!(err.to_lowercase().contains("path") || err.to_lowercase().contains("day"));
        cleanup(&root);
    }

    #[test]
    fn write_rejects_absolute_daily_day() {
        let root = temp_root();
        let err = write_at(
            &root,
            WritePatch {
                daily_md: Some("nope".into()),
                daily_day: Some("/tmp/evil".into()),
                ..WritePatch::default()
            },
        )
        .expect_err("absolute");
        assert!(err.to_lowercase().contains("path") || err.to_lowercase().contains("day"));
        cleanup(&root);
    }

    #[test]
    fn write_never_creates_memory_md() {
        let home = temp_root();
        let grok_memory = home.join(".grok").join("memory");
        std::fs::create_dir_all(&grok_memory).unwrap();
        let root = home.join("memory");
        std::fs::create_dir_all(&root).unwrap();
        let _ = write_at(
            &root,
            WritePatch {
                daily_md: Some("steal".into()),
                daily_day: Some("../.grok/memory/MEMORY".into()),
                ..WritePatch::default()
            },
        );
        assert!(!grok_memory.join("MEMORY.md").exists());
        assert!(!root.join("MEMORY.md").exists());
        cleanup(&home);
    }

    #[test]
    fn write_daily_requires_day() {
        let root = temp_root();
        let err = write_at(
            &root,
            WritePatch {
                daily_md: Some("orphan".into()),
                ..WritePatch::default()
            },
        )
        .expect_err("missing day");
        assert!(err.to_lowercase().contains("day"));
        cleanup(&root);
    }

    #[test]
    fn read_rejects_escaping_day() {
        let root = temp_root();
        let err = read_at(&root, "../USER").expect_err("escape read");
        assert!(err.to_lowercase().contains("path") || err.to_lowercase().contains("day"));
        cleanup(&root);
    }

    #[test]
    fn utc_ymd_known_unix_epochs() {
        assert_eq!(utc_ymd(0), "1970-01-01");
        assert_eq!(utc_ymd(1_777_507_200), "2026-04-30");
    }
}
