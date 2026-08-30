use std::path::Path;

#[cfg(unix)]
use std::os::unix::fs::symlink;

fn dest_exists(dest: &Path) -> bool {
    dest.symlink_metadata().is_ok()
}

#[cfg(unix)]
fn is_symlink(dest: &Path) -> Result<bool, String> {
    dest.symlink_metadata()
        .map(|meta| meta.file_type().is_symlink())
        .map_err(|e| e.to_string())
}

pub(crate) fn apply_skill_link(
    canonical: &Path,
    dest: &Path,
    enabled: bool,
) -> Result<&'static str, String> {
    #[cfg(not(unix))]
    {
        let _ = (canonical, dest, enabled);
        return Err("symlink".into());
    }

    #[cfg(unix)]
    apply_skill_link_unix(canonical, dest, enabled)
}

#[cfg(unix)]
fn apply_skill_link_unix(
    canonical: &Path,
    dest: &Path,
    enabled: bool,
) -> Result<&'static str, String> {
    if enabled {
        if !dest_exists(dest) {
            if let Some(parent) = dest.parent() {
                std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            symlink(canonical, dest).map_err(|e| e.to_string())?;
            return Ok("linked");
        }
        if is_symlink(dest)? {
            let target = std::fs::read_link(dest).map_err(|e| e.to_string())?;
            if target == canonical {
                return Ok("noop");
            }
            std::fs::remove_file(dest).map_err(|e| e.to_string())?;
            symlink(canonical, dest).map_err(|e| e.to_string())?;
            return Ok("linked");
        }
        return Ok("conflict");
    }

    if !dest_exists(dest) {
        return Ok("noop");
    }
    if is_symlink(dest)? {
        let target = std::fs::read_link(dest).map_err(|e| e.to_string())?;
        if target == canonical {
            std::fs::remove_file(dest).map_err(|e| e.to_string())?;
            return Ok("unlinked");
        }
    }
    Ok("kept")
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use std::fs;
    use std::os::unix::fs::symlink;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_root(label: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("skill_sync_{label}_{nanos}"));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn links_when_enabled_and_dest_is_free() {
        let root = temp_root("link");
        let canonical = root.join("canonical");
        let dest = root.join("agent/skills/pdf");
        fs::create_dir_all(&canonical).unwrap();

        assert_eq!(
            apply_skill_link(&canonical, &dest, true).unwrap(),
            "linked"
        );
        assert!(dest.is_symlink());
        assert_eq!(fs::read_link(&dest).unwrap(), canonical);
    }

    #[test]
    fn noop_when_symlink_already_points_at_canonical() {
        let root = temp_root("noop");
        let canonical = root.join("canonical");
        let dest = root.join("agent/skills/pdf");
        fs::create_dir_all(&canonical).unwrap();
        fs::create_dir_all(dest.parent().unwrap()).unwrap();
        symlink(&canonical, &dest).unwrap();

        assert_eq!(apply_skill_link(&canonical, &dest, true).unwrap(), "noop");
        assert_eq!(fs::read_link(&dest).unwrap(), canonical);
    }

    #[test]
    fn replaces_stale_symlink() {
        let root = temp_root("replace");
        let canonical = root.join("canonical");
        let old = root.join("old");
        let dest = root.join("agent/skills/pdf");
        fs::create_dir_all(&canonical).unwrap();
        fs::create_dir_all(&old).unwrap();
        fs::create_dir_all(dest.parent().unwrap()).unwrap();
        symlink(&old, &dest).unwrap();

        assert_eq!(
            apply_skill_link(&canonical, &dest, true).unwrap(),
            "linked"
        );
        assert_eq!(fs::read_link(&dest).unwrap(), canonical);
    }

    #[test]
    fn refuses_to_overwrite_real_skill_folder() {
        let root = temp_root("conflict");
        let canonical = root.join("canonical");
        let dest = root.join("agent/skills/pdf");
        fs::create_dir_all(&canonical).unwrap();
        fs::create_dir_all(&dest).unwrap();
        fs::write(dest.join("SKILL.md"), "# skill").unwrap();

        assert_eq!(
            apply_skill_link(&canonical, &dest, true).unwrap(),
            "conflict"
        );
        assert!(dest.is_dir());
        assert!(dest.join("SKILL.md").is_file());
    }

    #[test]
    fn unlinks_only_our_symlink_when_disabled() {
        let root = temp_root("disable");
        let canonical = root.join("canonical");
        let other = root.join("other");
        let dest = root.join("agent/skills/pdf");
        fs::create_dir_all(&canonical).unwrap();
        fs::create_dir_all(&other).unwrap();
        fs::create_dir_all(dest.parent().unwrap()).unwrap();

        symlink(&canonical, &dest).unwrap();
        assert_eq!(
            apply_skill_link(&canonical, &dest, false).unwrap(),
            "unlinked"
        );
        assert!(!dest_exists(&dest));

        symlink(&other, &dest).unwrap();
        assert_eq!(
            apply_skill_link(&canonical, &dest, false).unwrap(),
            "kept"
        );
        assert!(dest_exists(&dest));

        fs::remove_file(&dest).unwrap();
        fs::create_dir_all(&dest).unwrap();
        assert_eq!(
            apply_skill_link(&canonical, &dest, false).unwrap(),
            "kept"
        );

        let missing = root.join("agent/skills/missing");
        assert_eq!(
            apply_skill_link(&canonical, &missing, false).unwrap(),
            "noop"
        );
    }
}
