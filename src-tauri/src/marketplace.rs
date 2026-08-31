use std::fs;
use std::path::Path;

pub(crate) fn skill_folder_name(source: &Path) -> Option<String> {
    let name = source.file_name()?.to_str()?;
    if name.is_empty() {
        return None;
    }
    let mut chars = name.chars();
    let first = chars.next()?;
    if !first.is_ascii_lowercase() {
        return None;
    }
    if chars.all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-') {
        Some(name.to_string())
    } else {
        None
    }
}

pub(crate) fn install_skill_folder(source: &Path, dest: &Path) -> Result<(), String> {
    if dest.exists() {
        return Err("exists".into());
    }
    if !source.is_dir() || !source.join("SKILL.md").is_file() {
        return Err("invalid".into());
    }
    copy_dir_skip_symlinks(source, dest)
}

fn copy_dir_skip_symlinks(src: &Path, dst: &Path) -> Result<(), String> {
    fs::create_dir_all(dst).map_err(|e| e.to_string())?;
    for entry in fs::read_dir(src).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let ty = entry.file_type().map_err(|e| e.to_string())?;
        if ty.is_symlink() {
            continue;
        }
        let path = entry.path();
        let dest_path = dst.join(entry.file_name());
        if ty.is_dir() {
            copy_dir_skip_symlinks(&path, &dest_path)?;
        } else if ty.is_file() {
            fs::copy(&path, &dest_path).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

pub(crate) fn install_marketplace_skill_inner(source: &Path, agents_home: &Path) -> Result<String, String> {
    let name = skill_folder_name(source).ok_or_else(|| "invalid".to_string())?;
    let dest = agents_home.join("skills").join(&name);
    install_skill_folder(source, &dest)?;
    Ok(dest.display().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;

    fn uniq_dir() -> PathBuf {
        let p = std::env::temp_dir().join(format!(
            "acp-mkt-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&p).unwrap();
        p
    }

    #[test]
    fn name_and_copy_and_block() {
        assert_eq!(
            skill_folder_name(Path::new("/tmp/pdf-review")),
            Some("pdf-review".into())
        );
        assert_eq!(skill_folder_name(Path::new("/tmp/Pdf")), None);
        let root = uniq_dir();
        let src = root.join("pdf-review");
        fs::create_dir_all(&src).unwrap();
        fs::write(src.join("SKILL.md"), "# pdf\n").unwrap();
        let dest = root.join("out");
        install_skill_folder(&src, &dest).unwrap();
        assert_eq!(
            fs::read_to_string(dest.join("SKILL.md")).unwrap(),
            "# pdf\n"
        );
        assert_eq!(install_skill_folder(&src, &dest).unwrap_err(), "exists");
        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn install_inner_copies_into_agents_home_skills() {
        let root = uniq_dir();
        let src = root.join("pdf-review");
        fs::create_dir_all(&src).unwrap();
        fs::write(src.join("SKILL.md"), "# pdf\n").unwrap();
        let agents = root.join("agents-home");
        let dest = install_marketplace_skill_inner(&src, &agents).unwrap();
        let expected = agents.join("skills").join("pdf-review");
        assert_eq!(dest, expected.display().to_string());
        assert_eq!(
            fs::read_to_string(expected.join("SKILL.md")).unwrap(),
            "# pdf\n"
        );
        fs::remove_dir_all(root).ok();
    }
}
